import { defineDoc } from '@/core/engine/types'
import { multiplyMoney } from '@/shared/money'

export const teamDoc = defineDoc({
  key: 'team',
  table: 'teams',
  title: '班组信息',
  prefix: 'BZ',
  group: 'labor',
  tab: 'team',
  order: 80,
  desc: '退场后不可加人',
  fields: [
    { key: 'code', label: '班组编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'name', label: '班组名称', type: 'text', required: true, span: 8, filter: true },
    { key: 'type', label: '班组类型', type: 'select', required: true, span: 8, options: ['钢筋', '模板', '混凝土', '砌筑', '抹灰', '水电', '架子', '其他'], filter: true },
    { key: 'leader', label: '班组长', type: 'text', required: true, span: 8 },
    { key: 'phone', label: '联系电话', type: 'text', required: true, span: 8 },
    { key: 'inDate', label: '进场日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'status', label: '状态', type: 'select', required: true, span: 8, options: ['在岗', '退场'], filter: true, format: 'status', defaultValue: '在岗' },
    { key: 'subUnit', label: '分包单位', type: 'text', span: 8 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'inDate',
  statusField: 'status',
  print: { template: 'standard', title: '班组信息登记' }
})

export const workerDoc = defineDoc({
  key: 'worker',
  table: 'workers',
  title: '人员实名',
  prefix: 'RY',
  group: 'labor',
  tab: 'worker',
  order: 81,
  desc: '退场后不可录考勤',
  fields: [
    { key: 'code', label: '人员编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'name', label: '姓名', type: 'text', required: true, span: 8, filter: true },
    { key: 'teamId', label: '班组', type: 'ref', ref: 'teams', refLabel: 'name', required: true, span: 8, filter: true },
    { key: 'idCard', label: '身份证号', type: 'text', required: true, span: 8, filter: true },
    { key: 'jobType', label: '工种', type: 'text', required: true, span: 8, filter: true },
    { key: 'phone', label: '联系电话', type: 'text', required: true, span: 8 },
    { key: 'inDate', label: '进场日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'outDate', label: '退场日期', type: 'date', span: 8, format: 'date' },
    { key: 'status', label: '状态', type: 'select', required: true, span: 8, options: ['在岗', '退场'], filter: true, format: 'status', defaultValue: '在岗' },
    { key: 'certInfo', label: '持证情况', type: 'text', span: 8 },
    { key: 'attachments', label: '身份证/照片/证书', type: 'attachment', span: 24 }
  ],
  dateField: 'inDate',
  statusField: 'status',
  print: { template: 'standard', title: '人员实名登记' }
})

export const attendanceDoc = defineDoc({
  key: 'attendance',
  table: 'attendances',
  title: '考勤记录',
  prefix: 'KQ',
  group: 'labor',
  tab: 'attendance',
  order: 82,
  fields: [
    { key: 'code', label: '考勤编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'teamId', label: '班组', type: 'ref', ref: 'teams', refLabel: 'name', required: true, span: 8, filter: true },
    { key: 'workDate', label: '考勤日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'presentCount', label: '出勤人数', type: 'number', required: true, span: 8, min: 0, precision: 0 },
    { key: 'absentCount', label: '缺勤人数', type: 'number', span: 8, min: 0, precision: 0 },
    { key: 'detail', label: '出勤明细', type: 'textarea', span: 24, rows: 2 },
    { key: 'recorder', label: '记录人', type: 'text', required: true, span: 8 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'workDate',
  print: { template: 'table', title: '班组考勤记录' }
})

export const teamMeasurementDoc = defineDoc({
  key: 'teamMeasurement',
  table: 'teamMeasurements',
  title: '班组计量',
  prefix: 'JL',
  group: 'labor',
  tab: 'measurement',
  order: 83,
  desc: '已审核 → 作为工资台账取数来源',
  fields: [
    { key: 'code', label: '计量编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'teamId', label: '班组', type: 'ref', ref: 'teams', refLabel: 'name', required: true, span: 8, filter: true },
    { key: 'periodStart', label: '起止日期-起', type: 'date', required: true, span: 8, format: 'date' },
    { key: 'periodEnd', label: '起止日期-止', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'content', label: '计量内容', type: 'textarea', required: true, span: 24, rows: 2 },
    { key: 'qty', label: '工程量', type: 'number', required: true, span: 8, min: 0, precision: 3, format: 'qty' },
    { key: 'price', label: '综合单价', type: 'money', span: 8, min: 0, format: 'money' },
    { key: 'amount', label: '计量金额', type: 'computed', span: 8, format: 'money', computed: (r) => multiplyMoney(r.qty, r.price) },
    { key: 'auditStatus', label: '审核状态', type: 'select', required: true, span: 8, options: ['待审', '已审核', '驳回'], filter: true, format: 'status', defaultValue: '待审' },
    { key: 'auditOpinion', label: '审核意见', type: 'textarea', span: 16, rows: 2 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'periodEnd',
  statusField: 'auditStatus',
  print: { template: 'standard', title: '班组计量单' }
})

export const payrollDoc = defineDoc({
  key: 'payroll',
  table: 'payrolls',
  title: '工资发放',
  prefix: 'GZ',
  group: 'labor',
  tab: 'payroll',
  order: 84,
  desc: '已发放锁单',
  fields: [
    { key: 'code', label: '发放编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'teamId', label: '班组', type: 'ref', ref: 'teams', refLabel: 'name', required: true, span: 8, filter: true },
    { key: 'month', label: '发放月份', type: 'text', required: true, span: 8, placeholder: 'yyyy-MM', filter: true },
    { key: 'amount', label: '发放总金额', type: 'money', required: true, span: 8, min: 0, format: 'money' },
    { key: 'headCount', label: '发放人数', type: 'number', required: true, span: 8, min: 0, precision: 0 },
    { key: 'detail', label: '工资明细', type: 'textarea', span: 24, rows: 3 },
    { key: 'status', label: '发放状态', type: 'select', required: true, span: 8, options: ['待发放', '已发放'], filter: true, format: 'status', defaultValue: '待发放' },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  statusField: 'status',
  lock: (r) => r.status === '已发放',
  lockReason: '已发放，如需修改请先撤销发放',
  print: { template: 'standard', title: '工资发放表' }
})
