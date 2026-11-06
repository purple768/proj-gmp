import { db, GmpDB } from './index'

let active: GmpDB = db

export function useDb(instance: GmpDB) {
  active = instance
}

export function getDb(): GmpDB {
  return active
}

export function tbl(name: string): any {
  return (active as any)[name]
}

export interface ListOptions {
  projectId?: string | null
  keyword?: string | null
  searchFields?: string[]
  filters?: Record<string, any>
  ranges?: Record<string, [any, any]>
  from?: number | null
  to?: number | null
  dateField?: string
  page?: number
  pageSize?: number
  includeDeleted?: boolean
  onlyDeleted?: boolean
  sortField?: string
  sortDir?: 'asc' | 'desc'
  wbsIds?: string[] | null
}

function textOf(row: any, fields: string[]): string {
  return fields
    .map((f) => {
      const v = row?.[f]
      if (v === null || v === undefined) return ''
      if (Array.isArray(v)) return v.join(' ')
      return String(v)
    })
    .join(' ')
    .toLowerCase()
}

export function matchKeywords(row: any, terms: string[], fields: string[]): boolean {
  if (!terms.length) return true
  const hay = textOf(row, fields)
  return terms.every((t) => hay.includes(t.toLowerCase()))
}

function compare(a: any, b: any): number {
  if (a === b) return 0
  if (a === null || a === undefined) return -1
  if (b === null || b === undefined) return 1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'zh-CN')
}

export async function rawRows(table: string, projectId?: string | null): Promise<any[]> {
  const coll = tbl(table)
  if (!coll) return []
  if (projectId && table !== 'projects' && table !== 'settings' && table !== 'todayTodos') {
    try {
      return await coll.where('projectId').equals(projectId).toArray()
    } catch {
      return await coll.toArray()
    }
  }
  return await coll.toArray()
}

export async function listDocs(table: string, opt: ListOptions = {}) {
  const opts: ListOptions = { page: 1, pageSize: 20, sortDir: 'desc', ...opt }
  const fields = opts.searchFields?.length ? opts.searchFields : ['code']
  const terms = (opts.keyword || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)

  let rows = await rawRows(table, opts.projectId)

  if (opts.onlyDeleted) rows = rows.filter((r) => r.deletedAt != null)
  else if (!opts.includeDeleted) rows = rows.filter((r) => r.deletedAt == null)

  if (terms.length) rows = rows.filter((r) => matchKeywords(r, terms, fields))

  if (opts.filters) {
    for (const [k, v] of Object.entries(opts.filters)) {
      if (v === null || v === undefined || v === '' || v === '全部' || v === 'all') continue
      if (Array.isArray(v)) {
        if (!v.length) continue
        rows = rows.filter((r) => v.includes(r[k]))
      } else {
        rows = rows.filter((r) => r[k] === v)
      }
    }
  }

  if (opts.ranges) {
    for (const [k, [min, max]] of Object.entries(opts.ranges)) {
      if (min === null || min === undefined) {
        if (max === null || max === undefined) continue
      }
      rows = rows.filter((r) => {
        const v = r[k]
        if (v === null || v === undefined || v === '') return false
        if (min !== null && min !== undefined && v < min) return false
        if (max !== null && max !== undefined && v > max) return false
        return true
      })
    }
  }

  if (opts.from !== null && opts.from !== undefined || opts.to !== null && opts.to !== undefined) {
    const dateField = opts.dateField || 'createdAt'
    rows = rows.filter((r) => {
      const v = r[dateField]
      if (v === null || v === undefined) return false
      if (opts.from !== null && opts.from !== undefined && v < opts.from) return false
      if (opts.to !== null && opts.to !== undefined && v > opts.to) return false
      return true
    })
  }

  if (opts.wbsIds && opts.wbsIds.length) {
    rows = rows.filter((r) => !r.wbsId || opts.wbsIds!.includes(r.wbsId))
  }

  const sortField = opts.sortField || (table === 'projects' ? 'createdAt' : 'createdAt')
  rows.sort((a, b) => {
    const c = compare(a[sortField], b[sortField])
    return opts.sortDir === 'asc' ? c : -c
  })

  const total = rows.length
  const page = Math.max(1, Number(opts.page) || 1)
  const size = Math.max(1, Number(opts.pageSize) || 20)
  const start = (page - 1) * size
  return { rows: rows.slice(start, start + size), total }
}

export async function allDocs(table: string, projectId?: string | null, includeDeleted = false) {
  const rows = await rawRows(table, projectId)
  return includeDeleted ? rows : rows.filter((r) => r.deletedAt == null)
}

export async function getDoc(table: string, id: string) {
  return await tbl(table).get(id)
}

export async function createDoc(table: string, data: any) {
  const now = Date.now()
  const row = {
    id: data.id || crypto.randomUUID(),
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...data
  }
  row.createdAt = data.createdAt || now
  row.updatedAt = now
  await tbl(table).put(row)
  return row
}

export async function updateDoc(table: string, id: string, patch: any) {
  const row = await tbl(table).get(id)
  if (!row) throw new Error('记录不存在')
  const next = { ...row, ...patch, id, updatedAt: Date.now() }
  await tbl(table).put(next)
  return next
}

export async function softDeleteDoc(table: string, id: string) {
  const row = await tbl(table).get(id)
  if (!row) throw new Error('记录不存在')
  const next = { ...row, deletedAt: Date.now(), updatedAt: Date.now() }
  await tbl(table).put(next)
  return next
}

export async function restoreDoc(table: string, id: string) {
  const row = await tbl(table).get(id)
  if (!row) throw new Error('记录不存在')
  const next = { ...row, deletedAt: null, updatedAt: Date.now() }
  await tbl(table).put(next)
  return next
}

export async function hardDeleteDoc(table: string, id: string) {
  await tbl(table).delete(id)
}

export async function countDocs(table: string, projectId?: string | null, predicate?: (r: any) => boolean) {
  const rows = await allDocs(table, projectId)
  return predicate ? rows.filter(predicate).length : rows.length
}

export async function settingGet<T = any>(key: string, fallback: T): Promise<T> {
  const row = await tbl('settings').get(key)
  return row ? (row.value as T) : fallback
}

export async function settingSet(key: string, value: any) {
  await tbl('settings').put({ key, value })
}

export async function clearAllData(keepSettings = true) {
  const names = (active as any).tables.map((t: any) => t.name as string)
  for (const n of names) {
    if (keepSettings && (n === 'settings' || n === 'numberSequences')) continue
    await tbl(n).clear()
  }
}
