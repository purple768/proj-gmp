import ExcelJS from 'exceljs'

export interface SheetColumn {
  header: string
  key: string
  width?: number
  money?: boolean
  date?: boolean
}

export interface SheetSpec {
  name: string
  columns: SheetColumn[]
  rows: any[]
}

function cellValue(col: SheetColumn, row: any) {
  const v = row[col.key]
  if (v === null || v === undefined) return ''
  if (col.money) return Number(v) || 0
  return v
}

/** 千分位、列宽、冻结表头、自动筛选（M5-06 / AC-33） */
export async function buildWorkbook(sheets: SheetSpec[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = '工程管理本地版'
  wb.created = new Date()
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name.slice(0, 31))
    ws.columns = spec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width || 14 }))
    for (const row of spec.rows) {
      const obj: any = {}
      for (const c of spec.columns) obj[c.key] = cellValue(c, row)
      ws.addRow(obj)
    }
    const header = ws.getRow(1)
    header.font = { bold: true }
    header.alignment = { vertical: 'middle', horizontal: 'center' }
    header.height = 22
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F1FB' } }
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFB5D4F4' } } }
    })
    spec.columns.forEach((c, i) => {
      if (c.money) ws.getColumn(i + 1).numFmt = '#,##0.00'
      if (c.date) ws.getColumn(i + 1).numFmt = 'yyyy-mm-dd'
    })
    ws.views = [{ state: 'frozen', ySplit: 1 }]
    if (spec.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: spec.columns.length } }
  }
  return await wb.xlsx.writeBuffer()
}

export async function downloadWorkbook(sheets: SheetSpec[], fileName: string) {
  const buf = await buildWorkbook(sheets)
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
