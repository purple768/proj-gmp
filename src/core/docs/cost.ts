import { defineDoc } from '@/core/engine/types'

export const CATEGORIES = ['人工', '材料', '机械', '分包']

export const budgetDoc = defineDoc({
  key: 'budget',
  table: 'budgets',
  title: '预算录入',
  prefix: 'YS',
  group: 'cost',
  tab: 'budget',
  order: 20,
  desc: '预算按 WBS+类别 唯一',
  fields: [
    { key: 'code', label: '预算编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', required: true, span: 8, filter: true },
    { key: 'category', label: '预算类别', type: 'select', required: true, span: 8, options: CATEGORIES, filter: true },
    { key: 'amount', label: '预算金额', type: 'money', required: true, span: 8, min: 0, format: 'money' },
    { key: 'desc', label: '说明', type: 'textarea', span: 24, rows: 2 }
  ],
  statusField: 'category',
  print: { template: 'standard', title: '预算单' }
})

export const expenseDoc = defineDoc({
  key: 'expense',
  table: 'expenses',
  title: '成本支出',
  prefix: 'ZC',
  group: 'cost',
  tab: 'expense',
  order: 21,
  fields: [
    { key: 'code', label: '支出编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', required: true, span: 8, filter: true },
    { key: 'category', label: '支出类别', type: 'select', required: true, span: 8, options: CATEGORIES, filter: true },
    { key: 'amount', label: '支出金额', type: 'money', required: true, span: 8, min: 0, format: 'money' },
    { key: 'occurDate', label: '发生日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'voucherNo', label: '凭证编号', type: 'text', span: 8 },
    { key: 'desc', label: '说明', type: 'textarea', span: 24, rows: 2 },
    { key: 'attachments', label: '凭证照片', type: 'attachment', span: 24 }
  ],
  dateField: 'occurDate',
  print: { template: 'standard', title: '成本支出凭证' }
})
