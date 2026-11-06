import type { DocConfig } from '@/core/engine/types'
import { projectDoc } from './skeleton'
import { progressDoc } from './progress'
import { contractDoc, changeDoc, visaDoc, submissionDoc, settlementDoc } from './contract'
import { budgetDoc, expenseDoc } from './cost'
import { qualityPlanDoc, inspectionDoc, concealmentDoc, testRecordDoc, defectDoc } from './quality'
import { safetyPlanDoc, briefingDoc, hazardDoc, riskSourceDoc, emergencyPlanDoc, trainingDoc, certificateDoc } from './safety'
import { materialPlanDoc, materialReceiptDoc, stockFlowDoc } from './material'
import { equipmentDoc, machineShiftDoc } from './equipment'
import { drawingDoc, archiveDoc } from './document'
import { teamDoc, workerDoc, attendanceDoc, teamMeasurementDoc, payrollDoc } from './labor'

export const ALL_DOCS: DocConfig[] = [
  projectDoc,
  progressDoc,
  contractDoc,
  changeDoc,
  visaDoc,
  submissionDoc,
  settlementDoc,
  budgetDoc,
  expenseDoc,
  qualityPlanDoc,
  inspectionDoc,
  concealmentDoc,
  testRecordDoc,
  defectDoc,
  safetyPlanDoc,
  briefingDoc,
  hazardDoc,
  riskSourceDoc,
  emergencyPlanDoc,
  trainingDoc,
  certificateDoc,
  materialPlanDoc,
  materialReceiptDoc,
  stockFlowDoc,
  equipmentDoc,
  machineShiftDoc,
  drawingDoc,
  archiveDoc,
  teamDoc,
  workerDoc,
  attendanceDoc,
  teamMeasurementDoc,
  payrollDoc
]

/** 32 类业务单据（不含项目骨架） */
export const BUSINESS_DOCS = ALL_DOCS.filter((d) => d.key !== 'project')

export const DOC_MAP: Record<string, DocConfig> = Object.fromEntries(ALL_DOCS.map((d) => [d.key, d]))
export const TABLE_TO_DOC: Record<string, DocConfig> = Object.fromEntries(ALL_DOCS.map((d) => [d.table, d]))

export function getDoc(key: string): DocConfig {
  const d = DOC_MAP[key]
  if (!d) throw new Error(`未注册的单据类型：${key}`)
  return d
}

export function docsOfGroup(group: string): DocConfig[] {
  return ALL_DOCS.filter((d) => d.group === group).sort((a, b) => (a.order || 0) - (b.order || 0))
}

export const GROUP_TITLES: Record<string, string> = {
  project: '项目与 WBS',
  progress: '进度管理',
  contract: '合同 · 签证 · 计量结算',
  cost: '成本管理',
  quality: '质量安全',
  safety: '质量安全',
  material: '物资设备',
  equipment: '物资设备',
  document: '文档图纸',
  labor: '劳务管理'
}

export function docCount() {
  return BUSINESS_DOCS.length
}
