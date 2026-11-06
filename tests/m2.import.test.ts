import { beforeEach, describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { freshDb } from './helpers'
import { allDocs, createDoc } from '@/core/db/repo'
import { importWbsRows, parseExcelWbs, parseMsProjectXml } from '@/core/services/wbsImport'

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Tasks>
    <Task><UID>1</UID><Name>道路工程</Name><OutlineLevel>1</OutlineLevel><Start>2026-01-05T08:00:00</Start><Finish>2026-03-05T17:00:00</Finish><Milestone>0</Milestone></Task>
    <Task><UID>2</UID><Name>路基土方</Name><OutlineLevel>2</OutlineLevel><Start>2026-01-05T08:00:00</Start><Finish>2026-01-25T17:00:00</Finish><Milestone>0</Milestone></Task>
    <Task><UID>3</UID><Name>水稳基层</Name><OutlineLevel>2</OutlineLevel><Start>2026-01-26T08:00:00</Start><Finish>2026-02-20T17:00:00</Finish><Milestone>0</Milestone></Task>
    <Task><UID>4</UID><Name>通车节点</Name><OutlineLevel>1</OutlineLevel><Start>2026-03-05T08:00:00</Start><Finish>2026-03-05T17:00:00</Finish><Milestone>1</Milestone></Task>
  </Tasks>
</Project>`

describe('M2-04 WBS 导入（MS Project XML / Excel）', () => {
  beforeEach(async () => {
    await freshDb('import')
  })

  it('解析 MS Project XML 的层级、名称与日期', () => {
    const rows = parseMsProjectXml(XML)
    expect(rows.length).toBe(4)
    expect(rows[0]).toMatchObject({ name: '道路工程', outlineLevel: 1 })
    expect(rows[1].outlineLevel).toBe(2)
    expect(rows[3].milestone).toBe(true)
    expect(new Date(rows[0].start!).getFullYear()).toBe(2026)
  })

  it('非 Project XML 给出明确错误', () => {
    expect(() => parseMsProjectXml('<html><body>404</body></html>')).toThrow(/MS Project XML/)
  })

  it('空任务列表给出明确错误', () => {
    expect(() => parseMsProjectXml('<Project><Tasks></Tasks></Project>')).toThrow(/没有可导入/)
  })

  it('导入后按层级自动生成 1 / 1.1 / 1.2 编码并建立父子关系', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const rows = parseMsProjectXml(XML)
    const res = await importWbsRows(p.id, rows)
    expect(res.created).toBe(4)
    const wbs = await allDocs('wbs', p.id)
    const codes = wbs.map((w) => w.code).sort()
    expect(codes).toEqual(['1', '1.1', '1.2', '2'])
    const child = wbs.find((w) => w.code === '1.1')!
    const root = wbs.find((w) => w.code === '1')!
    expect(child.parentId).toBe(root.id)
    expect(wbs.find((w) => w.code === '2')!.parentId).toBeNull()
  })

  it('里程碑标记被保留', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await importWbsRows(p.id, parseMsProjectXml(XML))
    const wbs = await allDocs('wbs', p.id)
    expect(wbs.find((w) => w.name === '通车节点')!.milestone).toBe('是')
  })

  it('Excel 模板可解析并导入', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('WBS')
    ws.addRow(['WBS编码', 'WBS名称', '上级编码', '计划开始', '计划完成'])
    ws.addRow(['A', '单位工程一', '', '2026-01-05', '2026-02-05'])
    ws.addRow(['A.1', '分项一', 'A', '2026-01-05', '2026-01-20'])
    const buf = await wb.xlsx.writeBuffer()

    const rows = await parseExcelWbs(buf as ArrayBuffer)
    expect(rows.length).toBe(2)
    expect(rows[1].parentCode).toBe('A')

    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const res = await importWbsRows(p.id, rows)
    expect(res.created).toBe(2)
    const wbs = await allDocs('wbs', p.id)
    const child = wbs.find((w) => w.code === 'A.1')!
    expect(child.parentId).toBe(wbs.find((w) => w.code === 'A')!.id)
  })

  it('Excel 缺少名称列时报错', async () => {
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('WBS')
    ws.addRow(['编号'])
    ws.addRow(['A'])
    const buf = await wb.xlsx.writeBuffer()
    await expect(parseExcelWbs(buf as ArrayBuffer)).rejects.toThrow(/名称/)
  })

  it('上级编码缺失时置为根节点并给出提示', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const res = await importWbsRows(p.id, [{ code: 'B.1', name: '孤立节点', parentCode: 'B' }])
    expect(res.created).toBe(1)
    expect(res.errors.some((e) => e.includes('不存在'))).toBe(true)
    const wbs = await allDocs('wbs', p.id)
    expect(wbs[0].parentId).toBeNull()
  })
})
