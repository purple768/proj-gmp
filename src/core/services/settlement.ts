import { allDocs, getDoc } from '@/core/db/repo'
import { round2, sumMoney } from '@/shared/money'

export interface ReceivableSummary {
  total: number
  received: number
  unreceived: number
  count: number
}

/** R-02：只统计待收款/部分收款，软删不计 */
export async function receivable(projectId?: string | null): Promise<ReceivableSummary> {
  const rows = await allDocs('settlements', projectId || null)
  const alive = rows.filter((r) => r.status === '待收款' || r.status === '部分收款')
  const total = sumMoney(alive.map((r) => r.totalAmount))
  const received = sumMoney(alive.map((r) => r.receivedAmount))
  return {
    total,
    received,
    unreceived: Math.max(0, round2(total - received)),
    count: alive.length
  }
}

export function unreceivedOf(row: any): number {
  return Math.max(0, round2(Number(row.totalAmount || 0) - Number(row.receivedAmount || 0)))
}

export interface ReferenceValues {
  submitted: number
  visaTotal: number
  contractAmount: number
  reference: number
}

/** 结算参考值：已审核报审 + 已确认签证 + 合同金额，仅作参考与差异提示 */
export async function referenceValues(projectId: string, contractId?: string | null): Promise<ReferenceValues> {
  const [submissions, visas, contracts] = await Promise.all([
    allDocs('submissions', projectId),
    allDocs('visas', projectId),
    allDocs('contracts', projectId)
  ])
  const subs = submissions.filter(
    (r) => r.auditStatus === '已审核' && (!contractId || r.contractId === contractId)
  )
  const vs = visas.filter((r) => r.confirmStatus === '已确认' && (!contractId || r.contractId === contractId))
  const contract = contractId ? contracts.find((c) => c.id === contractId) : null
  const submitted = sumMoney(subs.map((r) => r.amount))
  const visaTotal = sumMoney(vs.map((r) => r.total))
  const contractAmount = Number(contract?.amount || 0)
  return { submitted, visaTotal, contractAmount, reference: round2(submitted + visaTotal) }
}

export interface SettleCheck {
  errors: string[]
  warnings: string[]
}

/** 保存前校验：已收不得大于结算；已结清不得有未收；参考值差异 >5% 提示 */
export async function checkSettlement(row: any): Promise<SettleCheck> {
  const errors: string[] = []
  const warnings: string[] = []
  const total = Number(row.totalAmount || 0)
  const received = Number(row.receivedAmount || 0)
  const un = unreceivedOf(row)

  if (received > total) errors.push('已收金额不能大于结算总金额')
  if (row.status === '已结清' && un > 0) warnings.push('状态为已结清，但仍有未收余额，请确认')
  if (row.status === '已结清' && un === 0) {
    /* ok */
  }

  if (row.projectId) {
    const ref = await referenceValues(row.projectId, row.contractId)
    if (ref.reference > 0) {
      const diff = Math.abs(total - ref.reference) / ref.reference
      if (diff > 0.05) warnings.push(`与参考值（报审+签证 ¥${ref.reference.toFixed(2)}）差异 ${(diff * 100).toFixed(1)}%，请确认`)
    }
  }

  // 一合同多结算：累计结算超过「合同额 + 已批变更 + 已确认签证」的 110% 时提示，不阻断
  if (row.contractId && row.projectId) {
    const [settlements, contracts, changes, visas] = await Promise.all([
      allDocs('settlements', row.projectId),
      allDocs('contracts', row.projectId),
      allDocs('changes', row.projectId),
      allDocs('visas', row.projectId)
    ])
    const sameContract = settlements.filter((s) => s.contractId === row.contractId && s.id !== row.id)
    const planned = sumMoney([...sameContract.map((s) => s.totalAmount), total])
    const contract = contracts.find((c) => c.id === row.contractId)
    const changeNet = sumMoney(
      changes.filter((c) => c.contractId === row.contractId && c.auditStatus === '已批').map((c) => Number(c.addAmount || 0) - Number(c.subAmount || 0))
    )
    const visaNet = sumMoney(visas.filter((v) => v.contractId === row.contractId && v.confirmStatus === '已确认').map((v) => v.total))
    const cap = round2((Number(contract?.amount || 0) + changeNet + visaNet) * 1.1)
    if (cap > 0 && planned > cap) {
      warnings.push(`同一合同累计结算 ¥${planned.toFixed(2)} 已超过「合同+变更+签证」合计的 110%（¥${cap.toFixed(2)}），请确认`)
    }
  }
  return { errors, warnings }
}
