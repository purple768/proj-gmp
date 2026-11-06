import { defineDoc } from '@/core/engine/types'
import { multiplyMoney } from '@/shared/money'

export const equipmentDoc = defineDoc({
  key: 'equipment',
  table: 'equipment',
  title: '设备台账',
  prefix: 'SB',
  group: 'equipment',
  tab: 'ledger',
  order: 60,
  desc: '退场后不可新增台班；年检到期生成预警',
  fields: [
    { key: 'code', label: '设备编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'name', label: '设备名称', type: 'text', required: true, span: 8, filter: true },
    { key: 'spec', label: '规格型号', type: 'text', required: true, span: 8 },
    { key: 'ownership', label: '权属', type: 'select', required: true, span: 8, options: ['自有', '租赁'], filter: true },
    { key: 'serialNo', label: '出厂编号', type: 'text', span: 8 },
    { key: 'inDate', label: '进场日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'location', label: '存放地点', type: 'text', span: 8 },
    {
      key: 'status',
      label: '设备状态',
      type: 'select',
      required: true,
      span: 8,
      options: ['在用', '闲置', '维修', '退场'],
      filter: true,
      format: 'status',
      defaultValue: '在用'
    },
    { key: 'maintainCycle', label: '维保周期(天)', type: 'number', span: 8, min: 0, precision: 0 },
    { key: 'lastInspect', label: '上次年检日期', type: 'date', span: 8, format: 'date' },
    { key: 'inspectExpire', label: '年检有效期截止', type: 'date', span: 8, format: 'date', filter: true },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'inDate',
  statusField: 'status',
  print: { template: 'standard', title: '设备台账' }
})

export const machineShiftDoc = defineDoc({
  key: 'machineShift',
  table: 'machineShifts',
  title: '台班登记',
  prefix: 'TB',
  group: 'equipment',
  tab: 'shift',
  order: 61,
  fields: [
    { key: 'code', label: '台班单号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8, filter: true },
    { key: 'equipmentId', label: '设备', type: 'ref', ref: 'equipment', refLabel: 'name', required: true, span: 8, filter: true },
    { key: 'workDate', label: '台班日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'qty', label: '台班数量', type: 'number', required: true, span: 8, min: 0, precision: 2, format: 'qty', defaultValue: 1 },
    { key: 'price', label: '单价', type: 'money', span: 8, min: 0, format: 'money' },
    { key: 'amount', label: '合价', type: 'computed', span: 8, format: 'money', computed: (r) => multiplyMoney(r.qty, r.price) },
    { key: 'operator', label: '操作人员', type: 'text', required: true, span: 8 },
    { key: 'content', label: '作业内容', type: 'textarea', span: 24, rows: 2 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'workDate',
  print: { template: 'standard', title: '设备台班登记单' }
})
