import { allDocs, tbl } from '@/core/db/repo'
import { BUSINESS_DOCS } from '@/core/docs'

export interface WbsNode {
  id: string
  code: string
  name: string
  parentId: string | null
  planStart: number | null
  planEnd: number | null
  milestone: string
  enabled: boolean
  level: number
  children: WbsNode[]
}

export async function loadWbs(projectId: string): Promise<any[]> {
  const rows = await allDocs('wbs', projectId)
  return rows.sort((a, b) => String(a.code).localeCompare(String(b.code), 'zh-CN', { numeric: true }))
}

export function buildTree(rows: any[]): WbsNode[] {
  const map = new Map<string, WbsNode>()
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      code: r.code,
      name: r.name,
      parentId: r.parentId || null,
      planStart: r.planStart ?? null,
      planEnd: r.planEnd ?? null,
      milestone: r.milestone || '否',
      enabled: r.enabled !== false,
      level: 0,
      children: []
    })
  }
  const roots: WbsNode[] = []
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) map.get(node.parentId)!.children.push(node)
    else roots.push(node)
  }
  const walk = (list: WbsNode[], level: number) => {
    for (const n of list) {
      n.level = level
      walk(n.children, level + 1)
    }
  }
  walk(roots, 0)
  return roots
}

export function flattenTree(nodes: WbsNode[]): WbsNode[] {
  const out: WbsNode[] = []
  const walk = (list: WbsNode[]) => {
    for (const n of list) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(nodes)
  return out
}

export function descendantIds(id: string, rows: any[]): string[] {
  const out: string[] = []
  const walk = (pid: string) => {
    for (const r of rows) {
      if ((r.parentId || null) === pid) {
        out.push(r.id)
        walk(r.id)
      }
    }
  }
  walk(id)
  return out
}

export interface Blocker {
  table: string
  title: string
  count: number
}

/** R-05：有子节点或单据引用（含回收站）时禁止删除 */
export async function assertWbsDeletable(id: string, projectId: string): Promise<{ ok: boolean; blockers: Blocker[] }> {
  const rows = await allDocs('wbs', projectId, true)
  const blockers: Blocker[] = []
  const children = rows.filter((r) => (r.parentId || null) === id && r.deletedAt == null)
  if (children.length) blockers.push({ table: 'wbs', title: '子节点', count: children.length })

  for (const doc of BUSINESS_DOCS) {
    const fields = doc.fields.some((f) => f.key === 'wbsId')
    if (!fields) continue
    const list: any[] = await (tbl(doc.table) as any).toArray()
    const count = list.filter((r) => r.wbsId === id).length
    if (count) blockers.push({ table: doc.table, title: doc.title, count })
  }
  return { ok: blockers.length === 0, blockers }
}

/** 停用父节点递归停用子节点；启用不自动放开子节点（R-05） */
export async function setWbsEnabled(id: string, enabled: boolean, projectId: string) {
  const rows = await allDocs('wbs', projectId, true)
  const targets = enabled ? [id] : [id, ...descendantIds(id, rows)]
  for (const tid of targets) {
    const row: any = await tbl('wbs').get(tid)
    if (row) await tbl('wbs').put({ ...row, enabled, updatedAt: Date.now() })
  }
}

export function wbsPath(rows: any[], id: string): string {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const parts: string[] = []
  let cur = byId.get(id)
  let guard = 0
  while (cur && guard++ < 20) {
    parts.unshift(`${cur.code} ${cur.name}`)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return parts.join(' / ')
}
