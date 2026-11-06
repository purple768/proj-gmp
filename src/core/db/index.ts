import Dexie, { type Table } from 'dexie'

/** 32 类单据 + 骨架/支撑表，共 41 张（见开发计划 §4.2） */
export const DOC_TABLE_INDEX: Record<string, string> = {
  projects: 'id, code, status, deletedAt',
  wbs: 'id, projectId, parentId, code, [projectId+code], [projectId+parentId], enabled, deletedAt',
  progressRecords: 'id, projectId, wbsId, reportDate, cycle, deletedAt',
  contracts: 'id, projectId, code, status, deletedAt',
  changes: 'id, projectId, code, contractId, status, deletedAt',
  visas: 'id, projectId, code, contractId, wbsId, confirmStatus, deletedAt',
  submissions: 'id, projectId, code, contractId, auditStatus, periodEnd, deletedAt',
  settlements: 'id, projectId, code, contractId, status, deletedAt',
  budgets: 'id, projectId, wbsId, category, [projectId+wbsId+category], deletedAt',
  expenses: 'id, projectId, wbsId, category, occurDate, deletedAt',
  qualityPlans: 'id, projectId, code, status, deletedAt',
  inspections: 'id, projectId, code, wbsId, result, deletedAt',
  concealments: 'id, projectId, code, wbsId, status, deletedAt',
  tests: 'id, projectId, code, result, deletedAt',
  defects: 'id, projectId, code, wbsId, status, requireDate, deletedAt',
  safetyPlans: 'id, projectId, code, status, deletedAt',
  briefings: 'id, projectId, code, wbsId, briefDate, deletedAt',
  hazards: 'id, projectId, code, wbsId, level, status, deadline, deletedAt',
  riskSources: 'id, projectId, code, level, deletedAt',
  emergencyPlans: 'id, projectId, code, status, deletedAt',
  trainings: 'id, projectId, code, trainDate, deletedAt',
  certificates: 'id, projectId, code, holder, expireDate, deletedAt',
  materialPlans: 'id, projectId, code, materialKey, status, deletedAt',
  materialReceipts: 'id, projectId, code, materialKey, planCode, inspectRequired, inspectResult, deletedAt',
  stockFlows: 'id, projectId, materialKey, direction, occurDate, sourceId, deletedAt',
  equipment: 'id, projectId, code, status, inspectExpire, deletedAt',
  machineShifts: 'id, projectId, code, equipmentId, workDate, deletedAt',
  drawings: 'id, projectId, drawingNo, version, isCurrent, deletedAt',
  archives: 'id, projectId, code, borrower, status, deletedAt',
  teams: 'id, projectId, code, status, deletedAt',
  workers: 'id, projectId, code, teamId, idCard, status, deletedAt',
  attendances: 'id, projectId, teamId, workDate, deletedAt',
  teamMeasurements: 'id, projectId, code, teamId, auditStatus, deletedAt',
  payrolls: 'id, projectId, code, teamId, status, deletedAt',
  attachments: 'id, docType, docId, hash, [docType+docId], state, deletedAt',
  settings: 'key',
  dictionaries: 'key',
  warningReads: 'id, key, ruleKey, sourceId',
  todayTodos: 'id, done, date',
  numberSequences: 'key',
  fileBlobs: 'id, hash'
}

export const DOC_TABLES = Object.keys(DOC_TABLE_INDEX).filter(
  (t) => !['projects', 'wbs', 'attachments', 'settings', 'dictionaries', 'warningReads', 'todayTodos', 'numberSequences', 'fileBlobs'].includes(t)
)

/** 带 deletedAt 的业务表（回收站来源） */
export const SOFT_DELETE_TABLES = [...DOC_TABLES, 'projects', 'wbs', 'attachments', 'stockFlows']

export class GmpDB extends Dexie {
  // 每张表都显式声明，供 TypeScript 识别（表清单唯一来源仍是 DOC_TABLE_INDEX）
  projects!: Table<any, string>
  wbs!: Table<any, string>
  progressRecords!: Table<any, string>
  contracts!: Table<any, string>
  changes!: Table<any, string>
  visas!: Table<any, string>
  submissions!: Table<any, string>
  settlements!: Table<any, string>
  budgets!: Table<any, string>
  expenses!: Table<any, string>
  qualityPlans!: Table<any, string>
  inspections!: Table<any, string>
  concealments!: Table<any, string>
  tests!: Table<any, string>
  defects!: Table<any, string>
  safetyPlans!: Table<any, string>
  briefings!: Table<any, string>
  hazards!: Table<any, string>
  riskSources!: Table<any, string>
  emergencyPlans!: Table<any, string>
  trainings!: Table<any, string>
  certificates!: Table<any, string>
  materialPlans!: Table<any, string>
  materialReceipts!: Table<any, string>
  stockFlows!: Table<any, string>
  equipment!: Table<any, string>
  machineShifts!: Table<any, string>
  drawings!: Table<any, string>
  archives!: Table<any, string>
  teams!: Table<any, string>
  workers!: Table<any, string>
  attendances!: Table<any, string>
  teamMeasurements!: Table<any, string>
  payrolls!: Table<any, string>
  attachments!: Table<any, string>
  settings!: Table<any, string>
  dictionaries!: Table<any, string>
  warningReads!: Table<any, string>
  todayTodos!: Table<any, string>
  numberSequences!: Table<any, string>
  fileBlobs!: Table<any, string>

  constructor(name = 'GMP_DB') {
    super(name)
    const stores: Record<string, string> = {}
    for (const [t, idx] of Object.entries(DOC_TABLE_INDEX)) stores[t] = idx
    this.version(1).stores(stores)
  }
}

export function createDb(name?: string) {
  return new GmpDB(name)
}

export const db = new GmpDB()

export function table(name: string): Table<any, string> {
  return (db as any)[name] as Table<any, string>
}

export async function openDb(instance: GmpDB = db) {
  if (!instance.isOpen()) await instance.open()
  return instance
}
