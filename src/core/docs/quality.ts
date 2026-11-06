import { defineDoc } from '@/core/engine/types'

export const qualityPlanDoc = defineDoc({
  key: 'qualityPlan',
  table: 'qualityPlans',
  title: '质量计划',
  prefix: 'ZLJH',
  group: 'quality',
  tab: 'plan',
  order: 30,
  fields: [
    { key: 'code', label: '计划编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', required: true, span: 8, filter: true },
    { key: 'content', label: '计划内容', type: 'textarea', required: true, span: 24, rows: 3 },
    { key: 'author', label: '编制人', type: 'text', span: 8 },
    { key: 'planDate', label: '编制日期', type: 'date', span: 8, format: 'date', filter: true },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  print: { template: 'standard', title: '质量计划' }
})

export const inspectionDoc = defineDoc({
  key: 'inspection',
  table: 'inspections',
  title: '检验批记录',
  prefix: 'JYP',
  group: 'quality',
  tab: 'inspection',
  order: 31,
  desc: '不合格 → 质量预警 + 一键建缺陷单',
  fields: [
    { key: 'code', label: '检验批编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', required: true, span: 8, filter: true },
    { key: 'subItem', label: '分项工程', type: 'text', required: true, span: 8 },
    { key: 'part', label: '验收部位', type: 'text', required: true, span: 8 },
    { key: 'checkDate', label: '验收日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'mainItems', label: '主控项目情况', type: 'textarea', span: 12, rows: 2 },
    { key: 'generalItems', label: '一般项目情况', type: 'textarea', span: 12, rows: 2 },
    {
      key: 'result',
      label: '验收结果',
      type: 'select',
      required: true,
      span: 8,
      options: ['合格', '不合格'],
      filter: true,
      format: 'status',
      defaultValue: '合格'
    },
    { key: 'inspector', label: '施工验收人', type: 'text', span: 8 },
    { key: 'supervisor', label: '监理工程师', type: 'text', span: 8 },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'checkDate',
  statusField: 'result',
  print: { template: 'standard', title: '检验批质量验收记录' }
})

export const concealmentDoc = defineDoc({
  key: 'concealment',
  table: 'concealments',
  title: '隐蔽工程验收',
  prefix: 'YB',
  group: 'quality',
  tab: 'concealment',
  order: 32,
  fields: [
    { key: 'code', label: '隐蔽单号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', required: true, span: 8, filter: true },
    { key: 'part', label: '隐蔽部位', type: 'text', required: true, span: 8 },
    { key: 'content', label: '隐蔽内容', type: 'textarea', required: true, span: 24, rows: 2 },
    { key: 'mainItems', label: '主控检查项', type: 'textarea', span: 24, rows: 2 },
    {
      key: 'result',
      label: '验收结论',
      type: 'select',
      required: true,
      span: 8,
      options: ['合格', '不合格'],
      filter: true,
      format: 'status',
      defaultValue: '合格'
    },
    { key: 'inspector', label: '验收人', type: 'text', span: 8 },
    { key: 'supervisor', label: '监理', type: 'text', span: 8 },
    { key: 'checkDate', label: '验收日期', type: 'date', span: 8, format: 'date', filter: true },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'checkDate',
  statusField: 'result',
  print: { template: 'standard', title: '隐蔽工程验收记录' }
})

export const testRecordDoc = defineDoc({
  key: 'testRecord',
  table: 'tests',
  title: '试件试验检测',
  prefix: 'SY',
  group: 'quality',
  tab: 'test',
  order: 33,
  fields: [
    { key: 'code', label: '试验编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', span: 8, filter: true },
    { key: 'sampleName', label: '试件名称', type: 'text', required: true, span: 8 },
    { key: 'spec', label: '规格', type: 'text', span: 8 },
    { key: 'part', label: '代表部位', type: 'text', required: true, span: 8 },
    { key: 'sendDate', label: '送样日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'org', label: '检测机构', type: 'text', span: 8 },
    { key: 'reportNo', label: '报告编号', type: 'text', span: 8 },
    {
      key: 'result',
      label: '检测结论',
      type: 'select',
      required: true,
      span: 8,
      options: ['待出报告', '合格', '不合格'],
      filter: true,
      format: 'status',
      defaultValue: '待出报告'
    },
    { key: 'attachments', label: '附件', type: 'attachment', span: 24 }
  ],
  dateField: 'sendDate',
  statusField: 'result',
  print: { template: 'standard', title: '试件试验检测报告' }
})

export const defectDoc = defineDoc({
  key: 'defect',
  table: 'defects',
  title: '质量缺陷整改',
  prefix: 'QX',
  group: 'quality',
  tab: 'defect',
  order: 34,
  desc: '合格闭环 → 锁单 + 预警自动已读',
  fields: [
    { key: 'code', label: '缺陷单号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', required: true, span: 8, filter: true },
    { key: 'sourceCode', label: '关联单据', type: 'text', span: 8 },
    { key: 'part', label: '缺陷部位', type: 'text', required: true, span: 8 },
    { key: 'desc', label: '缺陷描述', type: 'textarea', required: true, span: 24, rows: 2 },
    { key: 'requireDate', label: '要求整改日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'finder', label: '发现人', type: 'text', span: 8 },
    { key: 'team', label: '责任班组', type: 'text', span: 8 },
    { key: 'measure', label: '整改措施', type: 'textarea', span: 24, rows: 2 },
    { key: 'checker', label: '复查人', type: 'text', span: 8 },
    {
      key: 'checkResult',
      label: '复查结论',
      type: 'select',
      required: true,
      span: 8,
      options: ['待复查', '合格闭环', '继续整改'],
      filter: true,
      format: 'status',
      defaultValue: '待复查'
    },
    { key: 'finishDate', label: '整改完成日期', type: 'date', span: 8, format: 'date' },
    { key: 'attachments', label: '整改前后照片', type: 'attachment', span: 24 }
  ],
  dateField: 'requireDate',
  statusField: 'checkResult',
  lock: (r) => r.checkResult === '合格闭环',
  lockReason: '已闭环，如需修改请先撤销闭环',
  print: { template: 'standard', title: '质量缺陷整改单' }
})
