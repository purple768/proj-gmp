import type { DocConfig } from '@/core/engine/types'
import { validateRow } from '@/core/engine/validate'
import { allDocs, tbl } from '@/core/db/repo'
import { assertBudgetUnique } from './cost'
import { checkSettlement } from './settlement'
import { applyReceipt, assertOutbound, materialKey, reflowPlans } from './stock'
import { assertCodeAvailable } from './number'

export interface SaveCheck {
  errors: string[]
  warnings: string[]
  fieldErrors: { key: string; message: string }[]
}

/** 保存前的业务规则校验（R 系列），全部集中在单点，页面只调用 */
export async function beforeSave(cfg: DocConfig, row: any): Promise<SaveCheck> {
  const fieldErrors = validateRow(cfg, row)
  const errors: string[] = []
  const warnings: string[] = []

  if (row.code) {
    const ok = await assertCodeAvailable(cfg.table, row.code, row.id).then(
      () => true,
      (e: Error) => {
        errors.push(e.message)
        return false
      }
    )
    if (!ok) fieldErrors.push({ key: cfg.codeField || 'code', message: errors[errors.length - 1] })
  }

  if (cfg.key === 'budget' && row.projectId && row.wbsId && row.category) {
    try {
      await assertBudgetUnique(row.projectId, row.wbsId, row.category, row.id)
    } catch (e: any) {
      errors.push(e.message)
      fieldErrors.push({ key: 'category', message: e.message })
    }
  }

  if (cfg.key === 'settlement') {
    const res = await checkSettlement(row)
    errors.push(...res.errors)
    warnings.push(...res.warnings)
  }

  if (cfg.key === 'stockFlow' && row.direction === '出库') {
    try {
      await assertOutbound(row.projectId, row.materialName, row.spec, row.qty)
    } catch (e: any) {
      errors.push(e.message)
      fieldErrors.push({ key: 'qty', message: e.message })
    }
  }

  if (cfg.key === 'materialReceipt') {
    if (row.planCode) {
      const plans = await allDocs('materialPlans', row.projectId)
      if (row.planCode && !plans.some((p) => p.code === row.planCode)) {
        warnings.push(`未找到计划单 ${row.planCode}，本次进场不会回写计划状态`)
      }
    }
    if (row.inspectRequired === '是' && !row.inspectResult) {
      warnings.push('已选择送检但未填检测结论，将不会入库')
    }
  }

  if (cfg.key === 'visa' && row.contractId) {
    const contracts = await allDocs('contracts', row.projectId)
    const c = contracts.find((x) => x.id === row.contractId)
    if (c?.status === '已完成' && !row.id) errors.push('合同已完成，不允许新增签证')
  }

  // AC-15：基于变更洽商建签证时，未批准的洽商不允许引用
  if (cfg.key === 'visa' && row.changeId) {
    const changes = await allDocs('changes', row.projectId)
    const ch = changes.find((x) => x.id === row.changeId)
    if (!ch) {
      errors.push('所引用的变更洽商不存在或已删除')
      fieldErrors.push({ key: 'changeId', message: '所引用的变更洽商不存在或已删除' })
    } else if (ch.auditStatus !== '已批') {
      const msg = `变更洽商 ${ch.code} 审批状态为「${ch.auditStatus}」，未批准不能据此新增签证`
      errors.push(msg)
      fieldErrors.push({ key: 'changeId', message: msg })
    }
  }

  // 退场后不可继续产生业务（R-14 矩阵中的联动约束）
  if (cfg.key === 'machineShift' && row.equipmentId) {
    const eq = await allDocs('equipment', row.projectId)
    const e = eq.find((x) => x.id === row.equipmentId)
    if (e?.status === '退场') errors.push('设备已退场，不能新增台班')
  }

  if (cfg.key === 'worker' && row.teamId) {
    const teams = await allDocs('teams', row.projectId)
    const t = teams.find((x) => x.id === row.teamId)
    if (t?.status === '退场') errors.push('班组已退场，不能新增人员')
  }

  if (cfg.key === 'attendance' && row.teamId) {
    const teams = await allDocs('teams', row.projectId)
    const t = teams.find((x) => x.id === row.teamId)
    if (t?.status === '退场') errors.push('班组已退场，不能录考勤')
  }

  return { errors, warnings, fieldErrors }
}

/** 保存后的联动（库存、计划回写） */
export async function afterSave(cfg: DocConfig, row: any, isNew: boolean) {
  if (cfg.key === 'materialReceipt') {
    await applyReceipt(row.id)
    await reflowPlans(row.projectId)
  }
  if (cfg.key === 'materialPlan' && !isNew) {
    await reflowPlans(row.projectId)
  }
}

/** 删除前保护 */
export async function beforeDelete(cfg: DocConfig, row: any) {
  if (cfg.key === 'project') {
    const wbs = await allDocs('wbs', row.id, true)
    const docs: number[] = []
    for (const d of cfg.fields.length ? [] : []) void d
    const { BUSINESS_DOCS } = await import('@/core/docs')
    for (const d of BUSINESS_DOCS) {
      const rows: any[] = await (tbl(d.table) as any).toArray()
      docs.push(rows.filter((r) => r.projectId === row.id).length)
    }
    const totalDocs = docs.reduce((s, n) => s + n, 0)
    if (wbs.length || totalDocs) {
      throw new Error(`项目下还有 ${wbs.length} 个 WBS、${totalDocs} 条单据（含回收站），不能删除，请改为「已完工」或归档`)
    }
  }
}

export function sameMaterial(a: any, b: any) {
  return materialKey(a.materialName, a.spec) === materialKey(b.materialName, b.spec)
}
