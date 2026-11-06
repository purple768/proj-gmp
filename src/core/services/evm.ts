import { allDocs } from '@/core/db/repo'
import { monthEnd, monthStart, fmtDate } from '@/shared/date'
import { round2, sumMoney } from '@/shared/money'

export interface EvmPoint {
  month: string
  bcws: number
  bcwp: number
  acwp: number
}

function monthsBetween(from: number, to: number): number[] {
  const out: number[] = []
  const d = new Date(from)
  let cur = new Date(d.getFullYear(), d.getMonth(), 1).getTime()
  const end = monthStart(to)
  let guard = 0
  while (cur <= end && guard++ < 240) {
    out.push(cur)
    const x = new Date(cur)
    cur = new Date(x.getFullYear(), x.getMonth() + 1, 1).getTime()
  }
  return out
}

/** 简化挣值：BCWS=预算×计划完成率，BCWP=预算×实际完成率，ACWP=累计支出；只认自身填报（R-04） */
export async function evmSeries(projectId: string, from?: number, to?: number): Promise<EvmPoint[]> {
  const [budgets, records, expenses, wbs] = await Promise.all([
    allDocs('budgets', projectId),
    allDocs('progressRecords', projectId),
    allDocs('expenses', projectId),
    allDocs('wbs', projectId)
  ])
  const budgetByWbs = new Map<string, number>()
  for (const b of budgets) budgetByWbs.set(b.wbsId, (budgetByWbs.get(b.wbsId) || 0) + Number(b.amount || 0))
  const validWbs = new Set(wbs.filter((w) => w.enabled !== false).map((w) => w.id))

  const start = from || Math.min(...wbs.map((w) => w.planStart || Date.now()))
  const end = to || Date.now()
  const months = monthsBetween(start, end)
  const out: EvmPoint[] = []

  for (const m of months) {
    const cutoff = monthEnd(m)
    let bcws = 0
    let bcwp = 0
    for (const [wbsId, budget] of budgetByWbs) {
      if (!validWbs.has(wbsId)) continue
      const recs = records
        .filter((r) => r.wbsId === wbsId && (r.reportDate || 0) <= cutoff)
        .sort((a, b) => (b.reportDate || 0) - (a.reportDate || 0))
      const latest = recs[0]
      if (!latest) continue
      bcws += (budget * Number(latest.planRate || 0)) / 100
      bcwp += (budget * Number(latest.actualRate || 0)) / 100
    }
    const acwp = sumMoney(expenses.filter((e) => (e.occurDate || 0) <= cutoff).map((e) => e.amount))
    out.push({
      month: fmtDate(m).slice(0, 7),
      bcws: round2(bcws),
      bcwp: round2(bcwp),
      acwp: round2(acwp)
    })
  }
  return out
}

export function evmSummary(series: EvmPoint[]) {
  const last = series[series.length - 1]
  if (!last) return { bcws: 0, bcwp: 0, acwp: 0, spi: 0, cpi: 0 }
  return {
    bcws: last.bcws,
    bcwp: last.bcwp,
    acwp: last.acwp,
    spi: last.bcws > 0 ? round2(last.bcwp / last.bcws) : 0,
    cpi: last.acwp > 0 ? round2(last.bcwp / last.acwp) : 0
  }
}
