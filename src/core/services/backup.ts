import { strToU8, strFromU8, unzipSync, zipSync, Zip, ZipPassThrough } from 'fflate'
import { getDb, tbl, allDocs } from '@/core/db/repo'
import { DOC_MAP, TABLE_TO_DOC } from '@/core/docs'
import { readAttachment, restoreFile } from './attachment'
import { uid } from '@/shared/id'
import { withSuffix } from './number'

export const BACKUP_VERSION = 1

export interface ExportStats {
  tables: number
  rows: number
  attachments: number
  bytes: number
}

export interface ExportProgress {
  stage: string
  current: number
  total: number
}

const SKIP_SETTING_KEYS = ['attachDir']

/** 流式导出：数据 JSON + 附件字节，全程不把整包放内存（D-5） */
export async function exportBackup(
  onProgress?: (p: ExportProgress) => void,
  sink?: { write: (chunk: Uint8Array) => void | Promise<void> }
): Promise<{ bytes: Uint8Array; stats: ExportStats }> {
  const db = getDb()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  const zip = new Zip((_err, chunk, _final) => {
    chunks.push(chunk)
    totalBytes += chunk.length
    if (sink) sink.write(chunk)
  })

  const tables = db.tables.map((t) => t.name)
  const data: Record<string, any[]> = {}
  let rowCount = 0
  for (const name of tables) {
    if (name === 'fileBlobs') continue
    const rows: any[] = await (tbl(name) as any).toArray()
    if (name === 'settings') {
      data[name] = rows.filter((r) => !SKIP_SETTING_KEYS.includes(r.key))
    } else {
      data[name] = rows
    }
    rowCount += data[name].length
    onProgress?.({ stage: `读取 ${name}`, current: rowCount, total: rowCount })
  }

  const atts: any[] = await (tbl('attachments') as any).toArray()
  const manifest = {
    version: BACKUP_VERSION,
    app: 'proj-gmp',
    createdAt: Date.now(),
    tables: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])),
    attachments: atts.length,
    rows: rowCount
  }

  const put = (name: string, content: Uint8Array) => {
    const entry = new ZipPassThrough(name)
    zip.add(entry)
    entry.push(content, true)
  }

  put('manifest.json', strToU8(JSON.stringify(manifest, null, 2)))
  for (const [name, rows] of Object.entries(data)) {
    put(`data/${name}.json`, strToU8(JSON.stringify(rows)))
  }

  let attCount = 0
  for (const a of atts) {
    if (a.state === 'deleted') continue
    const blob = await readAttachment(a)
    if (!blob) continue
    const buf = new Uint8Array(await blob.arrayBuffer())
    put(`files/${a.relPath}`, buf)
    attCount++
    onProgress?.({ stage: `打包附件 ${attCount}`, current: attCount, total: atts.length })
  }

  const blobs: any[] = await (tbl('fileBlobs') as any).toArray()
  for (const b of blobs) {
    if (!b.blob) continue
    const buf = new Uint8Array(await b.blob.arrayBuffer())
    put(`blobs/${b.id}`, buf)
  }

  zip.end()
  const bytes = concat(chunks)
  return { bytes, stats: { tables: tables.length, rows: rowCount, attachments: attCount, bytes: bytes.length } }
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const out = new Uint8Array(total)
  let off = 0
  for (const c of chunks) {
    out.set(c, off)
    off += c.length
  }
  return out
}

export interface ImportReport {
  added: number
  overwritten: number
  renamed: number
  skipped: number
  failed: string[]
}

export type ConflictPolicy = 'skip' | 'overwrite' | 'rename'

/** 导入：冲突三选项；WBS/项目改号时同步迁移子节点与单据引用（R-08） */
export async function importBackup(
  bytes: Uint8Array,
  policy: ConflictPolicy = 'skip'
): Promise<{ report: ImportReport; manifest: any }> {
  const files = unzipSync(bytes)
  const manifestRaw = files['manifest.json']
  if (!manifestRaw) throw new Error('备份包缺少 manifest.json，可能不是本系统的备份')
  const manifest = JSON.parse(strFromU8(manifestRaw))
  if (Number(manifest.version) > BACKUP_VERSION) throw new Error('备份包版本高于当前程序，请升级后再导入')

  const report: ImportReport = { added: 0, overwritten: 0, renamed: 0, skipped: 0, failed: [] }
  const idMap = new Map<string, string>()

  for (const key of Object.keys(files)) {
    const m = key.match(/^data\/(.+?)\.json$/)
    if (!m) continue
    const table = m[1]
    let rows: any[]
    try {
      rows = JSON.parse(strFromU8(files[key]))
    } catch {
      report.failed.push(`${table}: JSON 解析失败`)
      continue
    }
    const existing: any[] = await (tbl(table) as any).toArray()
    const byKey = new Map<string, any>(existing.map((r) => [String(r.code || r.id), r]))
    const doc = TABLE_TO_DOC[table]
    const isProject = table === 'projects'
    const isWbs = table === 'wbs'

    for (const row of rows) {
      const key2 = String(row.code || row.id)
      if (byKey.has(key2)) {
        if (policy === 'skip') {
          report.skipped++
          continue
        }
        if (policy === 'overwrite') {
          const old = byKey.get(key2)
          const next = { ...old, ...row, id: old.id }
          await (tbl(table) as any).put(next)
          report.overwritten++
          continue
        }
        if (policy === 'rename') {
          let n = 1
          let newCode = withSuffix(String(row.code || row.id), n)
          while (byKey.has(newCode)) {
            n++
            newCode = withSuffix(String(row.code || row.id), n)
          }
          const newId = uid()
          idMap.set(row.id, newId)
          const next = { ...row, id: newId, code: newCode }
          await (tbl(table) as any).put(next)
          byKey.set(newCode, next)
          report.renamed++
          continue
        }
      }
      if (isProject || isWbs) idMap.set(row.id, row.id)
      await (tbl(table) as any).put(row)
      byKey.set(key2, row)
      report.added++
    }
  }

  // 迁移引用：被另存改号的 WBS / 项目 及其子节点
  if (idMap.size) {
    const wbsRows: any[] = await (tbl('wbs') as any).toArray()
    for (const w of wbsRows) {
      let changed = false
      const next = { ...w }
      if (w.parentId && idMap.has(w.parentId)) {
        next.parentId = idMap.get(w.parentId)
        changed = true
      }
      if (w.projectId && idMap.has(w.projectId)) {
        next.projectId = idMap.get(w.projectId)
        changed = true
      }
      if (changed) await (tbl('wbs') as any).put(next)
    }
    for (const doc of Object.values(DOC_MAP)) {
      const rows: any[] = await (tbl(doc.table) as any).toArray()
      for (const r of rows) {
        const next = { ...r }
        let changed = false
        if (r.wbsId && idMap.has(r.wbsId)) {
          next.wbsId = idMap.get(r.wbsId)
          changed = true
        }
        if (r.projectId && idMap.has(r.projectId)) {
          next.projectId = idMap.get(r.projectId)
          changed = true
        }
        if (changed) await (tbl(doc.table) as any).put(next)
      }
    }
  }

  // 恢复附件文件（目录/OPFS/内置三种模式统一走 restoreFile）
  for (const key of Object.keys(files)) {
    const fm = key.match(/^files\/(.+)$/)
    if (!fm) continue
    try {
      await restoreFile(fm[1], files[key])
    } catch (e: any) {
      report.failed.push(`附件 ${fm[1]} 恢复失败：${e?.message || ''}`)
    }
  }

  // 恢复 idb 兜底模式下的二进制
  for (const key of Object.keys(files)) {
    const m = key.match(/^blobs\/(.+)$/)
    if (!m) continue
    const data = files[key]
    await (tbl('fileBlobs') as any).put({ id: m[1], hash: m[1], blob: new Blob([data]) })
  }

  return { report, manifest }
}

/** 仅导出数据表（不含附件），用于快速核对 */
export async function exportDataOnly(): Promise<Uint8Array> {
  const db = getDb()
  const payload: Record<string, any[]> = {}
  for (const t of db.tables.map((x) => x.name)) {
    if (t === 'fileBlobs') continue
    payload[t] = await (tbl(t) as any).toArray()
  }
  return zipSync({ 'data.json': strToU8(JSON.stringify(payload)) })
}

export async function backupStats() {
  const db = getDb()
  const rows = await allDocs('attachments')
  return { tables: db.tables.length, attachments: rows.length }
}
