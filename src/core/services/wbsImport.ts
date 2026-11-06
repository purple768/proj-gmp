import ExcelJS from 'exceljs'
import { allDocs, createDoc } from '@/core/db/repo'
import { parseDate } from '@/shared/date'

export interface ImportRow {
  code?: string
  name: string
  parentCode?: string
  outlineLevel?: number
  start?: number | null
  end?: number | null
  milestone?: boolean
}

export interface ImportResult {
  created: number
  errors: string[]
  rows: ImportRow[]
}

function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1].trim() : ''
}

/** MS Project XML：仅解析 Task 的层级/名称/起止（.mpp 无法在浏览器解析） */
export function parseMsProjectXml(xml: string): ImportRow[] {
  if (!/<\s*Project[\s>]/i.test(xml) && !/<\s*Tasks[\s>]/i.test(xml)) {
    throw new Error('不是有效的 MS Project XML（未找到 Project/Tasks 节点）')
  }
  const blocks = xml.match(/<Task>[\s\S]*?<\/Task>/gi) || []
  const rows: ImportRow[] = []
  for (const b of blocks) {
    const name = tag(b, 'Name')
    if (!name) continue
    const level = Number(tag(b, 'OutlineLevel') || 1)
    const milestone = tag(b, 'Milestone') === '1'
    rows.push({
      name,
      outlineLevel: level,
      start: parseDate(tag(b, 'Start')),
      end: parseDate(tag(b, 'Finish')),
      milestone
    })
  }
  if (!rows.length) throw new Error('XML 中没有可导入的任务')
  return rows
}

export async function parseExcelWbs(buffer: ArrayBuffer): Promise<ImportRow[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Excel 中没有工作表')
  const header = (ws.getRow(1).values as any[]).map((v) => String(v || '').trim())
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h))
  const iCode = idx(['WBS编码', '编码', 'code'])
  const iName = idx(['WBS名称', '名称', 'name'])
  const iParent = idx(['上级编码', '父级编码', 'parent'])
  const iStart = idx(['计划开始', '开始日期', 'start'])
  const iEnd = idx(['计划完成', '完成日期', 'end'])
  const iLevel = idx(['层级', 'level', 'OutlineLevel'])
  if (iName <= 0) throw new Error('Excel 缺少「名称」列')
  const rows: ImportRow[] = []
  ws.eachRow((row, n) => {
    if (n === 1) return
    const name = String(row.getCell(iName).value ?? '').trim()
    if (!name) return
    rows.push({
      code: iCode > 0 ? String(row.getCell(iCode).value ?? '').trim() : undefined,
      name,
      parentCode: iParent > 0 ? String(row.getCell(iParent).value ?? '').trim() : undefined,
      outlineLevel: iLevel > 0 ? Number(row.getCell(iLevel).value || 1) : undefined,
      start: iStart > 0 ? parseDate(row.getCell(iStart).value as any) : null,
      end: iEnd > 0 ? parseDate(row.getCell(iEnd).value as any) : null,
      milestone: false
    })
  })
  if (!rows.length) throw new Error('Excel 没有可导入的数据行')
  return rows
}

/** 按层级/上级编码生成 WBS 树，编码缺失时自动按 1 / 1.1 编排 */
export async function importWbsRows(projectId: string, rows: ImportRow[]): Promise<ImportResult> {
  const existing = await allDocs('wbs', projectId, true)
  const byCode = new Map<string, string>(existing.map((w) => [String(w.code), w.id]))
  const errors: string[] = []
  let created = 0
  const stack: { level: number; code: string }[] = []

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    try {
      const level = r.outlineLevel && r.outlineLevel > 0 ? r.outlineLevel : 1
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop()
      let code = r.code || ''
      if (!code) {
        if (level === 1) {
          const roots = existing.filter((w) => !w.parentId).length + stack.length
          const used = [...byCode.keys()].filter((c) => /^\d+$/.test(c)).map(Number)
          code = String(Math.max(0, ...used, roots) + 1)
        } else {
          const parent = stack[stack.length - 1]
          if (!parent) code = `${i + 1}`
          else {
            const siblings = [...byCode.keys()].filter((c) => c.startsWith(parent.code + '.')).length
            code = `${parent.code}.${siblings + 1}`
          }
        }
      }
      if (byCode.has(code) && !r.parentCode) {
        let n = 1
        let next = `${code}_${n}`
        while (byCode.has(next)) {
          n++
          next = `${code}_${n}`
        }
        errors.push(`编码 ${code} 已存在，已自动改为 ${next}`)
        code = next
      }
      let parentId: string | null = null
      if (r.parentCode) {
        parentId = byCode.get(r.parentCode) || null
        if (!parentId) errors.push(`第 ${i + 1} 行「${r.name}」上级编码 ${r.parentCode} 不存在，已置为根节点`)
      } else if (stack.length) {
        parentId = byCode.get(stack[stack.length - 1].code) || null
      }
      const row = await createDoc('wbs', {
        projectId,
        parentId,
        code,
        name: r.name,
        milestone: r.milestone ? '是' : '否',
        planStart: r.start || Date.now(),
        planEnd: r.end || r.start || Date.now(),
        enabled: true
      })
      byCode.set(code, row.id)
      stack.push({ level, code })
      created++
    } catch (e: any) {
      errors.push(`第 ${i + 1} 行「${r.name}」导入失败：${e?.message || '未知错误'}`)
    }
  }
  return { created, errors, rows }
}
