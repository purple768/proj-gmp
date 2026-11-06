import { allDocs, tbl } from '@/core/db/repo'
import { DOC_MAP, TABLE_TO_DOC } from '@/core/docs'
import { releaseDocAttachments } from './attachment'
import { ensureCodeUnique, withSuffix } from './number'

export interface TrashItem {
  table: string
  docType: string
  docId: string
  code: string
  title: string
  projectId: string
  projectName: string
  deletedAt: number
  expireAt: number
  daysLeft: number
}

const DAY = 86400000
export const KEEP_DAYS = 90

const SOFT_TABLES = [
  ...Object.values(DOC_MAP).map((d) => d.table),
  'wbs'
]

function titleOf(row: any): string {
  return String(row.name || row.title || row.topic || row.content || row.holder || row.code || '')
}

export async function listTrash(now = Date.now()): Promise<TrashItem[]> {
  const projects = await allDocs('projects', null, true)
  const pname = new Map(projects.map((p) => [p.id, p.name]))
  const out: TrashItem[] = []
  for (const table of Array.from(new Set(SOFT_TABLES))) {
    const doc = TABLE_TO_DOC[table]
    if (!doc) continue
    const rows: any[] = await (tbl(table) as any).toArray()
    for (const r of rows) {
      if (r.deletedAt == null) continue
      const expireAt = r.deletedAt + KEEP_DAYS * DAY
      out.push({
        table,
        docType: doc.key,
        docId: r.id,
        code: String(r.code || ''),
        title: titleOf(r),
        projectId: r.projectId || '',
        projectName: pname.get(r.projectId) || '',
        deletedAt: r.deletedAt,
        expireAt,
        daysLeft: Math.ceil((expireAt - now) / DAY)
      })
    }
  }
  return out.sort((a, b) => b.deletedAt - a.deletedAt)
}

export async function restoreDoc_(table: string, id: string): Promise<{ ok: boolean; message?: string; code?: string }> {
  const row: any = await (tbl(table) as any).get(id)
  if (!row) return { ok: false, message: '记录不存在' }
  const doc = TABLE_TO_DOC[table]
  if (doc && row.code) {
    const ok = await ensureCodeUnique(table, row.code, id)
    if (!ok) {
      let n = 1
      while (!(await ensureCodeUnique(table, withSuffix(row.code, n)))) n++
      const newCode = withSuffix(row.code, n)
      await (tbl(table) as any).put({ ...row, code: newCode, deletedAt: null, updatedAt: Date.now() })
      return { ok: true, message: `原编号已被占用，已改号为 ${newCode}`, code: newCode }
    }
  }
  await (tbl(table) as any).put({ ...row, deletedAt: null, updatedAt: Date.now() })
  return { ok: true }
}

export async function purgeDoc(table: string, id: string) {
  const row: any = await (tbl(table) as any).get(id)
  if (!row) return
  const doc = TABLE_TO_DOC[table]
  if (doc) await releaseDocAttachments(doc.key, id)
  await (tbl(table) as any).delete(id)
}

/** 启动时清理 90 天到期记录；单条失败不中断（R-07） */
export async function cleanupExpired(now = Date.now()): Promise<{ removed: number; failed: string[] }> {
  const items = await listTrash(now)
  const expired = items.filter((i) => i.expireAt <= now)
  const failed: string[] = []
  let removed = 0
  for (const it of expired) {
    try {
      await purgeDoc(it.table, it.docId)
      removed++
    } catch (e: any) {
      failed.push(`${it.code}:${e?.message || 'unknown'}`)
    }
  }
  return { removed, failed }
}

export function expiringSoon(items: TrashItem[]): TrashItem[] {
  return items.filter((i) => i.daysLeft <= 7)
}
