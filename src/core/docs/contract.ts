import { defineDoc } from '@/core/engine/types'
import { round2, multiplyMoney } from '@/shared/money'

export const contractDoc = defineDoc({
  key: 'contract',
  table: 'contracts',
  title: '合同台账',
  prefix: 'HT',
  group: 'contract',
  tab: 'contract',
  order: 10,
  desc: '变更/签证/报审/结算均挂此合同；已完成不可新增洽商签证',
  fields: [
    { key: 'code', label: '合同编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'name', label: '合同名称', type: 'text', required: true, span: 16, filter: true },
    { key: 'partyA', label: '甲方', type: 'text', required: true, span: 8 },
    { key: 'partyB', label: '乙方', type: 'text', required: true, span: 8 },
    { key: 'amount', label: '合同金额', type: 'money', required: true, span: 8, format: 'money', min: 0 },
    { key: 'signDate', label: '签约日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'duration', label: '合同工期(天)', type: 'number', span: 8, min: 0, precision: 0 },
    { key: 'payTerms', label: '付款约定', type: 'textarea', span: 24, rows: 2 },
    {
      key: 'status',
      label: '合同状态',
      type: 'select',
      required: true,
      span: 8,
      options: ['正常', '中止', '已完成'],
      filter: true,
      format: 'status',
      defaultValue: '正常'
    },
    { key: 'remark', label: '备注', type: 'textarea', span: 16, rows: 2 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'signDate',
  statusField: 'status',
  print: { template: 'standard', title: '合同台账' }
})

export const changeDoc = defineDoc({
  key: 'change',
  table: 'changes',
  title: '变更洽商',
  prefix: 'BG',
  group: 'contract',
  tab: 'change',
  order: 11,
  desc: '审批=已批后才允许基于本洽商新建签证单',
  fields: [
    { key: 'code', label: '洽商编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'contractId', label: '合同', type: 'ref', ref: 'contracts', refLabel: 'name', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', required: true, span: 8, filter: true },
    { key: 'part', label: '变更部位', type: 'text', required: true, span: 8 },
    { key: 'reason', label: '变更原因', type: 'text', required: true, span: 16 },
    { key: 'content', label: '变更内容', type: 'textarea', required: true, span: 24, rows: 3 },
    { key: 'addAmount', label: '预估增额', type: 'money', span: 8, format: 'money', min: 0 },
    { key: 'subAmount', label: '预估减额', type: 'money', span: 8, format: 'money', min: 0 },
    {
      key: 'auditStatus',
      label: '审批状态',
      type: 'select',
      required: true,
      span: 8,
      options: ['待审', '已批', '驳回'],
      filter: true,
      format: 'status',
      defaultValue: '待审'
    },
    { key: 'auditOpinion', label: '审批意见', type: 'textarea', span: 24, rows: 2 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  statusField: 'auditStatus',
  print: { template: 'standard', title: '变更洽商单' }
})

export const visaDoc = defineDoc({
  key: 'visa',
  table: 'visas',
  title: '现场签证单',
  prefix: 'QZ',
  group: 'contract',
  tab: 'visa',
  order: 12,
  desc: '合价=工程量×综合单价（只读）；确认后计入报审与成本',
  fields: [
    { key: 'code', label: '签证编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'contractId', label: '合同', type: 'ref', ref: 'contracts', refLabel: 'name', required: true, span: 8, filter: true },
    { key: 'changeId', label: '依据变更洽商', type: 'ref', ref: 'changes', refLabel: 'content', span: 8, help: '仅可引用审批状态为「已批」的洽商' },
    { key: 'wbsId', label: 'WBS', type: 'wbs', required: true, span: 8, filter: true },
    { key: 'reason', label: '签证事由', type: 'text', required: true, span: 24 },
    { key: 'content', label: '工作内容', type: 'textarea', required: true, span: 24, rows: 2 },
    { key: 'unit', label: '计量单位', type: 'select', span: 8, options: ['项', 'm', 'm²', 'm³', 't', '套', '台班', '工日'] },
    { key: 'qty', label: '工程量', type: 'number', required: true, span: 8, min: 0, precision: 3, format: 'qty' },
    { key: 'price', label: '综合单价', type: 'money', required: true, span: 8, min: 0, format: 'money' },
    { key: 'total', label: '合价', type: 'computed', span: 8, format: 'money', computed: (r) => multiplyMoney(r.qty, r.price) },
    { key: 'supervisorOpinion', label: '监理意见', type: 'textarea', span: 24, rows: 2 },
    {
      key: 'confirmStatus',
      label: '监理确认状态',
      type: 'select',
      required: true,
      span: 8,
      options: ['待确认', '已确认'],
      filter: true,
      format: 'status',
      defaultValue: '待确认'
    },
    { key: 'visaDate', label: '签证日期', type: 'date', span: 8, format: 'date', filter: true },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'visaDate',
  statusField: 'confirmStatus',
  lock: (r) => r.confirmStatus === '已确认',
  lockReason: '监理已确认，如需修改请先撤销确认',
  print: { template: 'standard', title: '现场签证单' }
})

export const submissionDoc = defineDoc({
  key: 'submission',
  table: 'submissions',
  title: '进度报审',
  prefix: 'BS',
  group: 'contract',
  tab: 'submission',
  order: 13,
  desc: '已审核汇入结算参考值；驳回可改后重报',
  fields: [
    { key: 'code', label: '报审编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'contractId', label: '合同', type: 'ref', ref: 'contracts', refLabel: 'name', required: true, span: 8, filter: true },
    { key: 'periodStart', label: '周期开始', type: 'date', required: true, span: 8, format: 'date' },
    { key: 'periodEnd', label: '周期结束', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'amount', label: '本期申报金额', type: 'money', required: true, span: 8, min: 0, format: 'money' },
    { key: 'desc', label: '报审说明', type: 'textarea', span: 24, rows: 2 },
    {
      key: 'auditStatus',
      label: '审核状态',
      type: 'select',
      required: true,
      span: 8,
      options: ['待审', '已审核', '驳回'],
      filter: true,
      format: 'status',
      defaultValue: '待审'
    },
    { key: 'auditOpinion', label: '审核意见', type: 'textarea', span: 16, rows: 2 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'periodEnd',
  statusField: 'auditStatus',
  print: { template: 'standard', title: '进度报审单' }
})

export const settlementDoc = defineDoc({
  key: 'settlement',
  table: 'settlements',
  title: '结算及应收',
  prefix: 'JS',
  group: 'contract',
  tab: 'settlement',
  order: 14,
  desc: '结算总金额手工录入；未收余额=结算-已收（下限 0）；已结清锁单',
  fields: [
    { key: 'code', label: '结算编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'contractId', label: '合同', type: 'ref', ref: 'contracts', refLabel: 'name', required: true, span: 8, filter: true },
    { key: 'totalAmount', label: '结算总金额', type: 'money', required: true, span: 8, min: 0, format: 'money' },
    { key: 'receivedAmount', label: '已收金额', type: 'money', span: 8, min: 0, format: 'money' },
    {
      key: 'unreceived',
      label: '未收余额',
      type: 'computed',
      span: 8,
      format: 'money',
      computed: (r) => Math.max(0, round2(Number(r.totalAmount || 0) - Number(r.receivedAmount || 0)))
    },
    { key: 'settleDate', label: '结算日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    {
      key: 'status',
      label: '结算状态',
      type: 'select',
      required: true,
      span: 8,
      options: ['待收款', '部分收款', '已结清'],
      filter: true,
      format: 'status',
      defaultValue: '待收款'
    },
    { key: 'desc', label: '结算说明', type: 'textarea', span: 24, rows: 2 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'settleDate',
  statusField: 'status',
  lock: (r) => r.status === '已结清',
  lockReason: '已结清，如需修改请先撤销结清',
  print: { template: 'standard', title: '工程结算单' }
})
