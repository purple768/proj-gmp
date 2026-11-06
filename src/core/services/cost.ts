import { allDocs } from '@/core/db/repo'
import { round2, sumMoney } from '@/shared/money'
import { loadWbs } from './wbs'

export interface FourRow {
  wbsId: string
  code: string
  name: string
  budget: number
  contractPrice: number
  actual: number
  estimate: number
  deviation: number
  rate: number | null
  level: '' | '一般' | '紧急'
  budgetMissing: boolean
}

export interface FourResult {
  rows: FourRow[]
  totals: { budget: number; contractPrice: number; actual: number; deviation: number; rate: number | null }
  hasBudget: boolean
}

function levelOf(rate: number | null): '' | '一般' | '紧急' {
  if (rate === null) return ''
  if (rate > 0.1) return '紧急'
  if (rate > 0) return '一般'
  return ''
}

/** R-03：合同价按预算占比分摊；预算为 0 显示 —（rate=null）；预估最终成本简化为 max(实际, 预算) */
export async function fourWayCompare(projectId: string): Promise<FourResult> {
  const [wbs, budgets, expenses, contracts] = await Promise.all([
    loadWbs(projectId),
    allDocs('budgets', projectId),
    allDocs('expenses', projectId),
    allDocs('contracts', projectId)
  ])
  const totalBudget = sumMoney(budgets.map((b) => b.amount))
  const contractAmount = sumMoney(contracts.filter((c) => c.status !== '中止').map((c) => c.amount))
  const budgetByWbs = new Map<string, number>()
  for (const b of budgets) budgetByWbs.set(b.wbsId, round2((budgetByWbs.get(b.wbsId) || 0) + Number(b.amount || 0)))
  const actualByWbs = new Map<string, number>()
  for (const e of expenses) actualByWbs.set(e.wbsId, round2((actualByWbs.get(e.wbsId) || 0) + Number(e.amount || 0)))

  const rows: FourRow[] = wbs.map((w) => {
    const budget = budgetByWbs.get(w.id) || 0
    const actual = actualByWbs.get(w.id) || 0
    const contractPrice = totalBudget > 0 && budget > 0 ? round2((contractAmount * budget) / totalBudget) : 0
    const deviation = round2(actual - budget)
    const rate = budget > 0 ? (actual - budget) / budget : null
    return {
      wbsId: w.id,
      code: w.code,
      name: w.name,
      budget,
      contractPrice,
      actual,
      estimate: Math.max(actual, budget),
      deviation,
      rate,
      level: levelOf(rate),
      budgetMissing: budget === 0
    }
  })

  const budget = sumMoney(rows.map((r) => r.budget))
  const actual = sumMoney(rows.map((r) => r.actual))
  const contractPrice = sumMoney(rows.map((r) => r.contractPrice))
  return {
    rows,
    totals: {
      budget,
      contractPrice,
      actual,
      deviation: round2(actual - budget),
      rate: budget > 0 ? (actual - budget) / budget : null
    },
    hasBudget: totalBudget > 0
  }
}

/** 首页"超预算项目数"：存在偏差率>0 的 WBS 的项目数（去重） */
export async function overBudgetProjectCount(projectIds: string[]): Promise<number> {
  let count = 0
  for (const pid of projectIds) {
    const res = await fourWayCompare(pid)
    if (res.rows.some((r) => r.rate !== null && r.rate > 0)) count++
  }
  return count
}

export async function assertBudgetUnique(projectId: string, wbsId: string, category: string, excludeId?: string) {
  const rows = await allDocs('budgets', projectId)
  const dup = rows.find((r) => r.wbsId === wbsId && r.category === category && r.id !== excludeId)
  if (dup) throw new Error(`该 WBS 的「${category}」预算已存在（${dup.code}），请编辑原记录`)
}
