import { defineDoc } from '@/core/engine/types'

export const progressDoc = defineDoc({
  key: 'progress',
  table: 'progressRecords',
  title: '进度填报',
  prefix: 'JD',
  group: 'progress',
  order: 2,
  fields: [
    { key: 'code', label: '填报编号', type: 'autoCode', required: true, span: 8, filter: true },
    { key: 'wbsId', label: 'WBS', type: 'wbs', required: true, span: 8, filter: true },
    { key: 'cycle', label: '填报周期', type: 'select', required: true, span: 8, options: ['日', '周', '月'], filter: true, defaultValue: '周' },
    { key: 'reportDate', label: '填报日期', type: 'date', required: true, span: 8, format: 'date', filter: true },
    { key: 'planRate', label: '计划完成率', type: 'percent', required: true, span: 8, format: 'percent' },
    { key: 'actualRate', label: '实际完成率', type: 'percent', required: true, span: 8, format: 'percent' },
    { key: 'imageProgress', label: '形象进度', type: 'textarea', span: 24, rows: 2 },
    { key: 'problems', label: '存在问题', type: 'textarea', span: 12, rows: 2 },
    { key: 'measures', label: '纠偏措施', type: 'textarea', span: 12, rows: 2 },
    { key: 'attachments', label: '佐证照片/附件', type: 'attachment', span: 24 }
  ],
  dateField: 'reportDate',
  print: { template: 'standard', title: '进度填报记录' }
})
