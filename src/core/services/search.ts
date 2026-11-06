import { allDocs } from '@/core/db/repo'
import { BUSINESS_DOCS, DOC_MAP, TABLE_TO_DOC } from '@/core/docs'

export interface SearchDoc {
  key: string
  docType: string
  docId: string
  projectId: string
  code: string
  title: string
  text: string
  date: number
}

export interface SearchHit {
  docType: string
  docId: string
  code: string
  title: string
  projectId: string
  projectName: string
  date: number
  snippet: string
  score: number
}

const TITLE_KEYS = ['name', 'title', 'topic', 'subject', 'materialName', 'sampleName', 'holder', 'event', 'part']

function titleOf(row: any, doc: any): string {
  for (const k of TITLE_KEYS) {
    if (row[k]) return String(row[k])
  }
  return String(row.code || '')
}

function textOf(row: any, fields: string[]): string {
  return fields
    .map((f) => {
      const v = row[f]
      if (v === null || v === undefined) return ''
      return Array.isArray(v) ? v.join(' ') : String(v)
    })
    .filter(Boolean)
    .join(' ')
}

/** R-18：编号 + 名称 + 描述文本 + 项目名 + WBS 编码/名称 + 附件文件名 */
export async function buildIndex(projectId?: string | null): Promise<SearchDoc[]> {
  const projects = await allDocs('projects')
  const projectName = new Map(projects.map((p) => [p.id, p.name]))
  const wbsAll: any[] = await allDocs('wbs', projectId || null)
  const wbsMap = new Map(wbsAll.map((w) => [w.id, `${w.code} ${w.name}`]))
  const out: SearchDoc[] = []

  for (const doc of BUSINESS_DOCS) {
    if (projectId && doc.table === 'progressRecords') {
      /* 支持按项目过滤 */
    }
    const rows = await allDocs(doc.table, projectId || null)
    for (const row of rows) {
      const fields = doc.searchFields || [doc.codeField || 'code']
      const parts = [
        doc.title,
        row.code || '',
        titleOf(row, doc),
        textOf(row, fields.filter((f) => f !== 'code')),
        projectName.get(row.projectId) || '',
        row.wbsId ? wbsMap.get(row.wbsId) || '' : '',
        String(row.remark || '')
      ]
      out.push({
        key: `${doc.key}:${row.id}`,
        docType: doc.key,
        docId: row.id,
        projectId: row.projectId,
        code: String(row.code || ''),
        title: titleOf(row, doc),
        text: parts.filter(Boolean).join(' | '),
        date: Number(row[doc.dateField || 'createdAt'] || row.createdAt || 0)
      })
    }
  }

  // 附件文件名并入索引
  const { tbl } = await import('@/core/db/repo')
  const atts: any[] = await tbl('attachments').toArray()
  const byKey = new Map(out.map((d) => [d.key, d]))
  for (const a of atts) {
    if (a.state === 'deleted') continue
    const doc = DOC_MAP[a.docType]
    if (!doc) continue
    const key = `${a.docType}:${a.docId}`
    const target = byKey.get(key)
    if (target) target.text += ` | ${a.fileName}`
  }
  return out
}

export function termsOf(query: string): string[] {
  return String(query || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase())
}

export function searchIndex(
  index: SearchDoc[],
  query: string,
  opt: { projectId?: string | null; docTypes?: string[]; from?: number | null; to?: number | null; limit?: number } = {}
): SearchHit[] {
  const terms = termsOf(query)
  if (!terms.length) return []
  const hits: SearchHit[] = []
  for (const d of index) {
    if (opt.projectId && d.projectId !== opt.projectId) continue
    if (opt.docTypes?.length && !opt.docTypes.includes(d.docType)) continue
    if (opt.from && d.date < opt.from) continue
    if (opt.to && d.date > opt.to) continue

    const code = d.code.toLowerCase()
    const title = d.title.toLowerCase()
    const text = d.text.toLowerCase()
    let score = 0
    let ok = true
    for (const t of terms) {
      let hit = 0
      if (code.includes(t)) hit += 3
      if (title.includes(t)) hit += 2
      if (text.includes(t)) hit += 1
      if (!hit) {
        ok = false
        break
      }
      score += hit
    }
    if (!ok) continue
    if (terms.every((t) => t.length <= 1) && !code.includes(terms[0]) && !title.includes(terms[0])) continue

    const idx = text.indexOf(terms[0])
    const snippet =
      idx >= 0
        ? `${idx > 30 ? '…' : ''}${d.text.slice(Math.max(0, idx - 30), Math.min(d.text.length, idx + 30))}${idx + 30 < d.text.length ? '…' : ''}`
        : d.text.slice(0, 60)
    hits.push({
      docType: d.docType,
      docId: d.docId,
      code: d.code,
      title: d.title,
      projectId: d.projectId,
      projectName: '',
      date: d.date,
      snippet,
      score
    })
  }
  hits.sort((a, b) => (b.score - a.score) || (b.date - a.date))
  return hits.slice(0, opt.limit || 200)
}

export function highlight(text: string, query: string): string {
  const terms = termsOf(query)
  if (!terms.length) return text
  let out = text
  for (const t of terms) {
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
    out = out.replace(re, '<mark>$1</mark>')
  }
  return out
}

export function docTitle(type: string): string {
  return DOC_MAP[type]?.title || TABLE_TO_DOC[type]?.title || type
}
