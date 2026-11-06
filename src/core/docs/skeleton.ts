import { defineDoc } from '@/core/engine/types'

export const projectDoc = defineDoc({
  key: 'project',
  table: 'projects',
  title: '项目',
  prefix: 'XM',
  group: 'project',
  order: 1,
  fields: [
    { key: 'code', label: '项目编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'name', label: '项目名称', type: 'text', required: true, span: 16, filter: true },
    {
      key: 'status',
      label: '项目状态',
      type: 'select',
      required: true,
      span: 8,
      options: ['待开工', '在建', '暂停', '已完工'],
      filter: true,
      format: 'status',
      defaultValue: '在建'
    },
    { key: 'ownerUnit', label: '建设单位', type: 'text', span: 8 },
    { key: 'buildUnit', label: '施工单位', type: 'text', span: 8 },
    { key: 'supervisorUnit', label: '监理单位', type: 'text', span: 8 },
    { key: 'contractNo', label: '合同编号', type: 'text', span: 8 },
    { key: 'planStart', label: '计划开工日期', type: 'date', required: true, span: 8, format: 'date' },
    { key: 'planEnd', label: '计划竣工日期', type: 'date', span: 8, format: 'date' },
    { key: 'actualStart', label: '实际开工日期', type: 'date', span: 8, format: 'date' },
    { key: 'actualEnd', label: '实际竣工日期', type: 'date', span: 8, format: 'date' },
    { key: 'reportCycle', label: '填报周期', type: 'select', span: 8, options: ['日', '周', '月'], defaultValue: '周' },
    { key: 'reportAnchor', label: '周填报基准日', type: 'select', span: 8, options: [
      { label: '周一', value: 1 }, { label: '周二', value: 2 }, { label: '周三', value: 3 },
      { label: '周四', value: 4 }, { label: '周五', value: 5 }, { label: '周六', value: 6 }, { label: '周日', value: 7 }
    ], defaultValue: 5 },
    { key: 'remark', label: '项目备注', type: 'textarea', span: 24, rows: 3 },
    { key: 'attachments', label: '备注附件', type: 'attachment', span: 24 }
  ],
  searchFields: ['code', 'name', 'ownerUnit', 'buildUnit', 'supervisorUnit', 'contractNo', 'remark'],
  print: { template: 'standard', title: '项目信息' }
})
