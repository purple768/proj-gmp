import { defineDoc } from '@/core/engine/types'

export const safetyPlanDoc = defineDoc({
  key: 'safetyPlan',
  table: 'safetyPlans',
  title: '安全专项方案',
  prefix: 'FA',
  group: 'safety',
  tab: 'plan',
  order: 40,
  fields: [
    { key: 'code', label: '方案编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8, filter: true },
    { key: 'name', label: '方案名称', type: 'text', required: true, span: 8 },
    { key: 'category', label: '类别', type: 'select', span: 8, options: ['基坑', '模板', '脚手架', '起重吊装', '临时用电', '其他'] },
    { key: 'author', label: '编制人', type: 'text', required: true, span: 8 },
    { key: 'planDate', label: '编制日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'approver', label: '审批人', type: 'text', span: 8 },
    {
      key: 'status',
      label: '审批状态',
      type: 'select',
      required: true,
      span: 8,
      options: ['待审', '已批', '驳回'],
      filter: true,
      format: 'status',
      defaultValue: '待审'
    },
    { key: 'rejectOpinion', label: '驳回意见', type: 'textarea', span: 24, rows: 2 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'planDate',
  statusField: 'status',
  lock: (r) => r.status === '已批',
  lockReason: '方案已批，更新请以新版本记录',
  print: { template: 'standard', title: '安全专项方案' }
})

export const briefingDoc = defineDoc({
  key: 'briefing',
  table: 'briefings',
  title: '安全技术交底',
  prefix: 'JD',
  group: 'safety',
  tab: 'briefing',
  order: 41,
  fields: [
    { key: 'code', label: '交底编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8, filter: true },
    { key: 'topic', label: '交底主题', type: 'text', required: true, span: 8 },
    { key: 'part', label: '交底部位', type: 'text', required: true, span: 8 },
    { key: 'team', label: '交底班组', type: 'text', required: true, span: 8 },
    { key: 'content', label: '交底内容', type: 'textarea', required: true, span: 24, rows: 3 },
    { key: 'presenter', label: '交底人', type: 'text', span: 8 },
    { key: 'briefDate', label: '交底日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'briefDate',
  print: { template: 'standard', title: '安全技术交底记录' }
})

export const hazardDoc = defineDoc({
  key: 'hazard',
  table: 'hazards',
  title: '隐患排查复查',
  prefix: 'YH',
  group: 'safety',
  tab: 'hazard',
  order: 42,
  desc: '重大→紧急预警；闭环后锁单与预警已读',
  fields: [
    { key: 'code', label: '隐患单号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8, filter: true },
    { key: 'level', label: '隐患等级', type: 'select', required: true, span: 8, options: ['一般', '重大'], filter: true, format: 'status', defaultValue: '一般' },
    { key: 'location', label: '隐患位置', type: 'text', required: true, span: 8 },
    { key: 'desc', label: '隐患描述', type: 'textarea', required: true, span: 24, rows: 2 },
    { key: 'requirement', label: '整改要求', type: 'textarea', required: true, span: 24, rows: 2 },
    { key: 'deadline', label: '限期整改日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'finder', label: '发现人', type: 'text', span: 8 },
    { key: 'team', label: '发现班组', type: 'text', span: 8 },
    { key: 'measure', label: '整改措施', type: 'textarea', span: 24, rows: 2 },
    { key: 'finishDate', label: '整改完成日期', type: 'date', span: 8, format: 'date' },
    { key: 'checker', label: '复查人', type: 'text', span: 8 },
    {
      key: 'status',
      label: '复查结论',
      type: 'select',
      required: true,
      span: 8,
      options: ['待整改', '整改中', '合格闭环', '不合格'],
      filter: true,
      format: 'status',
      defaultValue: '待整改'
    },
    { key: 'attachments', label: '对比照片', type: 'attachment', span: 24 }
  ],
  dateField: 'deadline',
  statusField: 'status',
  lock: (r) => r.status === '合格闭环',
  lockReason: '已闭环，如需修改请先撤销闭环',
  print: { template: 'standard', title: '安全隐患整改通知单' }
})

export const riskSourceDoc = defineDoc({
  key: 'riskSource',
  table: 'riskSources',
  title: '危险源清单',
  prefix: 'WXY',
  group: 'safety',
  tab: 'risk',
  order: 43,
  fields: [
    { key: 'code', label: '危险源编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8, filter: true },
    { key: 'desc', label: '描述', type: 'textarea', required: true, span: 24, rows: 2 },
    { key: 'level', label: '风险等级', type: 'select', required: true, span: 8, options: ['重大', '较大', '一般', '低'], filter: true, format: 'status', defaultValue: '一般' },
    { key: 'measure', label: '管控措施', type: 'textarea', required: true, span: 24, rows: 2 },
    { key: 'owner', label: '管控责任人', type: 'text', required: true, span: 8 },
    { key: 'emergency', label: '应急处置', type: 'textarea', span: 16, rows: 2 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  statusField: 'level',
  print: { template: 'standard', title: '危险源清单' }
})

export const emergencyPlanDoc = defineDoc({
  key: 'emergencyPlan',
  table: 'emergencyPlans',
  title: '应急预案',
  prefix: 'YA',
  group: 'safety',
  tab: 'emergency',
  order: 44,
  fields: [
    { key: 'code', label: '预案编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8 },
    { key: 'part', label: '适用部位', type: 'text', span: 8 },
    { key: 'event', label: '应急事项', type: 'text', required: true, span: 8 },
    { key: 'org', label: '组织机构', type: 'textarea', span: 24, rows: 2 },
    { key: 'process', label: '处置流程', type: 'textarea', required: true, span: 24, rows: 3 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  print: { template: 'standard', title: '应急预案' }
})

export const trainingDoc = defineDoc({
  key: 'training',
  table: 'trainings',
  title: '安全教育培训',
  prefix: 'PX',
  group: 'safety',
  tab: 'training',
  order: 45,
  fields: [
    { key: 'code', label: '培训编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'team', label: '班组', type: 'text', required: true, span: 8 },
    { key: 'topic', label: '培训主题', type: 'text', required: true, span: 8 },
    { key: 'trainDate', label: '培训日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'duration', label: '培训时长(小时)', type: 'number', span: 8, min: 0, precision: 1, format: 'qty' },
    { key: 'trainer', label: '培训人', type: 'text', required: true, span: 8 },
    { key: 'content', label: '培训内容', type: 'textarea', span: 24, rows: 2 },
    { key: 'attendees', label: '参训人员名单', type: 'textarea', span: 12, rows: 2 },
    { key: 'result', label: '考核结果', type: 'select', span: 8, options: ['合格', '不合格'], format: 'status' },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'trainDate',
  statusField: 'result',
  print: { template: 'standard', title: '安全教育培训记录' }
})

export const certificateDoc = defineDoc({
  key: 'certificate',
  table: 'certificates',
  title: '特种作业证件',
  prefix: 'ZJ',
  group: 'safety',
  tab: 'certificate',
  order: 46,
  desc: '剩余≤30天→一般预警；已过期→紧急预警',
  fields: [
    { key: 'code', label: '台账编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'holder', label: '姓名', type: 'text', required: true, span: 8, filter: true },
    { key: 'team', label: '班组', type: 'text', required: true, span: 8 },
    { key: 'jobType', label: '工种', type: 'text', required: true, span: 8, filter: true },
    { key: 'certNo', label: '证件编号', type: 'text', required: true, span: 8 },
    { key: 'issuer', label: '发证单位', type: 'text', required: true, span: 8 },
    { key: 'issueDate', label: '发证日期', type: 'date', required: true, span: 8, format: 'date' },
    { key: 'expireDate', label: '有效期截止', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'remark', label: '备注', type: 'textarea', span: 24, rows: 2 },
    { key: 'attachments', label: '证件扫描件', type: 'attachment', span: 24 }
  ],
  dateField: 'expireDate',
  print: { template: 'standard', title: '特种作业人员证件台账' }
})
