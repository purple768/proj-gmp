import { defineDoc } from '@/core/engine/types'
import { multiplyMoney } from '@/shared/money'

export const materialPlanDoc = defineDoc({
  key: 'materialPlan',
  table: 'materialPlans',
  title: '材料需求计划',
  prefix: 'XQ',
  group: 'material',
  tab: 'plan',
  order: 50,
  desc: '接进场单回写状态：待采购/部分进场/全部完成',
  fields: [
    { key: 'code', label: '计划单号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8, filter: true },
    { key: 'materialName', label: '材料名称', type: 'text', required: true, span: 8, filter: true },
    { key: 'spec', label: '规格型号', type: 'text', required: true, span: 8 },
    { key: 'unit', label: '单位', type: 'select', required: true, span: 8, options: ['t', 'm³', 'm²', 'm', '个', '套', 'kg', '张'] },
    { key: 'qty', label: '计划需求量', type: 'number', required: true, span: 8, min: 0, precision: 3, format: 'qty' },
    { key: 'planDate', label: '计划进场日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    {
      key: 'status',
      label: '状态',
      type: 'computed',
      span: 8,
      format: 'status',
      computed: (r) => r.status || '待采购'
    },
    { key: 'remark', label: '备注', type: 'textarea', span: 24, rows: 2 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'planDate',
  statusField: 'status',
  print: { template: 'standard', title: '材料需求计划' }
})

export const materialReceiptDoc = defineDoc({
  key: 'materialReceipt',
  table: 'materialReceipts',
  title: '材料进场送检',
  prefix: 'JC',
  group: 'material',
  tab: 'receipt',
  order: 51,
  desc: '送检=否直接入库；送检=是且合格才入库；不合格禁入',
  fields: [
    { key: 'code', label: '进场单号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8, filter: true },
    { key: 'planCode', label: '关联计划单', type: 'text', span: 8 },
    { key: 'materialName', label: '材料名称', type: 'text', required: true, span: 8, filter: true },
    { key: 'spec', label: '规格', type: 'text', required: true, span: 8 },
    { key: 'unit', label: '单位', type: 'select', span: 8, options: ['t', 'm³', 'm²', 'm', '个', '套', 'kg', '张'] },
    { key: 'qty', label: '进场数量', type: 'number', required: true, span: 8, min: 0, precision: 3, format: 'qty' },
    { key: 'supplier', label: '供方', type: 'text', span: 8 },
    { key: 'inspectRequired', label: '是否送检', type: 'select', required: true, span: 8, options: ['是', '否'], filter: true, defaultValue: '否' },
    { key: 'inspectNo', label: '送检编号', type: 'text', span: 8 },
    { key: 'inspectOrg', label: '检测机构', type: 'text', span: 8 },
    {
      key: 'inspectResult',
      label: '检测结论',
      type: 'select',
      span: 8,
      options: ['待出报告', '合格', '不合格'],
      filter: true,
      format: 'status'
    },
    { key: 'inDate', label: '进场日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'location', label: '存放位置', type: 'text', span: 8 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'inDate',
  statusField: 'inspectResult',
  print: { template: 'standard', title: '材料进场验收单' }
})

export const stockFlowDoc = defineDoc({
  key: 'stockFlow',
  table: 'stockFlows',
  title: '出入库台账',
  prefix: 'CK',
  group: 'material',
  tab: 'stock',
  order: 52,
  desc: '库存=Σ入库-Σ出库；出库不得超库存',
  fields: [
    { key: 'code', label: '流水号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8, filter: true },
    { key: 'materialName', label: '材料', type: 'text', required: true, span: 8, filter: true },
    { key: 'spec', label: '规格', type: 'text', required: true, span: 8 },
    { key: 'direction', label: '类型', type: 'select', required: true, span: 8, options: ['入库', '出库'], filter: true, format: 'status' },
    { key: 'qty', label: '数量', type: 'number', required: true, span: 8, min: 0, precision: 3, format: 'qty' },
    { key: 'price', label: '单价', type: 'money', span: 8, min: 0, format: 'money' },
    { key: 'amount', label: '金额', type: 'computed', span: 8, format: 'money', computed: (r) => multiplyMoney(r.qty, r.price) },
    { key: 'occurDate', label: '日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'location', label: '存放位置', type: 'text', span: 8 },
    { key: 'operator', label: '经手人', type: 'text', span: 8 },
    { key: 'remark', label: '备注', type: 'textarea', span: 24, rows: 2 }
  ],
  dateField: 'occurDate',
  statusField: 'direction',
  print: { template: 'standard', title: '材料出入库台账' }
})
