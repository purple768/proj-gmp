import { defineDoc } from '@/core/engine/types'

export const drawingDoc = defineDoc({
  key: 'drawing',
  table: 'drawings',
  title: '图纸版本',
  prefix: 'TZ',
  group: 'document',
  tab: 'drawing',
  order: 70,
  desc: '同编号多版本，最新版标当前版；旧版只读',
  fields: [
    { key: 'code', label: '登记编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'drawingNo', label: '图纸编号', type: 'text', required: true, span: 8, filter: true },
    { key: 'name', label: '图纸名称', type: 'text', required: true, span: 8, filter: true },
    { key: 'version', label: '版本号', type: 'text', required: true, span: 8, filter: true },
    { key: 'major', label: '专业', type: 'select', span: 8, options: ['建筑', '结构', '给排水', '电气', '暖通', '幕墙', '其他'], filter: true },
    { key: 'desc', label: '图纸说明', type: 'textarea', required: true, span: 24, rows: 2 },
    { key: 'isCurrent', label: '是否当前版', type: 'select', span: 8, options: ['是', '否'], format: 'status', defaultValue: '是' },
    { key: 'attachments', label: '文件（PDF/图片/IFC/BIM）', type: 'attachment', span: 24 }
  ],
  statusField: 'isCurrent',
  searchFields: ['code', 'drawingNo', 'name', 'version', 'major', 'desc'],
  print: { template: 'standard', title: '图纸版本登记' }
})

export const archiveDoc = defineDoc({
  key: 'archive',
  table: 'archives',
  title: '资料归档借阅',
  prefix: 'DA',
  group: 'document',
  tab: 'archive',
  order: 71,
  desc: '未归还在列表标借出中',
  fields: [
    { key: 'code', label: '资料编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'name', label: '资料名称', type: 'text', required: true, span: 8, filter: true },
    { key: 'category', label: '资料类别', type: 'select', span: 8, options: ['施工资料', '验收资料', '图纸', '合同', '其他'], filter: true },
    { key: 'borrower', label: '借阅人', type: 'text', span: 8, filter: true },
    { key: 'borrowDate', label: '借出日期', type: 'date', span: 8, format: 'date', filter: true },
    { key: 'returnDate', label: '归还日期', type: 'date', span: 8, format: 'date' },
    { key: 'status', label: '状态', type: 'computed', span: 8, format: 'status', computed: (r) => (r.borrower && !r.returnDate ? '借出中' : '在库') },
    { key: 'remark', label: '备注', type: 'textarea', span: 24, rows: 2 },
    { key: 'attachments', label: '文件', type: 'attachment', span: 24 }
  ],
  dateField: 'borrowDate',
  statusField: 'status',
  print: { template: 'standard', title: '资料归档借阅登记' }
})
