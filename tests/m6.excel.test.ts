import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbook } from '@/core/services/excel'

describe('M5-06 台账导出（AC-33）', () => {
  it('生成的 xlsx 可被重新读取，表头与数据正确', async () => {
    const buf = await buildWorkbook([
      {
        name: '隐患台账',
        columns: [
          { header: '编号', key: 'code', width: 18 },
          { header: '金额', key: 'amount', money: true, width: 14 },
          { header: '日期', key: 'date', date: true, width: 14 }
        ],
        rows: [
          { code: 'YH-1', amount: 1234567.5, date: new Date(2026, 10, 6).getTime() },
          { code: 'YH-2', amount: 0, date: new Date(2026, 10, 7).getTime() }
        ]
      }
    ])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as ArrayBuffer)
    const ws = wb.worksheets[0]
    expect(ws.name).toBe('隐患台账')
    expect(ws.getRow(1).getCell(1).value).toBe('编号')
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true)
    expect(ws.getRow(2).getCell(1).value).toBe('YH-1')
    expect(ws.getRow(2).getCell(2).value).toBe(1234567.5)
    expect(ws.getColumn(2).numFmt).toBe('#,##0.00')
    expect(ws.getColumn(3).numFmt).toBe('yyyy-mm-dd')
    expect(ws.views[0].state).toBe('frozen')
    expect((ws.views[0] as any).ySplit).toBe(1)
    expect(ws.autoFilter).toBeTruthy()
    expect(ws.rowCount).toBe(3)
  })

  it('多类型导出为多工作表', async () => {
    const buf = await buildWorkbook([
      { name: '安全', columns: [{ header: '编号', key: 'code' }], rows: [{ code: 'A' }] },
      { name: '质量', columns: [{ header: '编号', key: 'code' }], rows: [{ code: 'B' }] }
    ])
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as ArrayBuffer)
    expect(wb.worksheets.length).toBe(2)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['安全', '质量'])
  })

  it('空结果集也能生成合法文件（只有表头）', async () => {
    const buf = await buildWorkbook([{ name: '空表', columns: [{ header: '编号', key: 'code' }], rows: [] }])
    expect(buf.byteLength).toBeGreaterThan(1000)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as ArrayBuffer)
    expect(wb.worksheets[0].rowCount).toBe(1)
  })
})
