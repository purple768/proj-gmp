import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { createDoc } from '@/core/db/repo'
import { assertBudgetUnique, fourWayCompare, overBudgetProjectCount } from '@/core/services/cost'
import { beforeSave } from '@/core/services/hooks'
import { getDoc } from '@/core/docs'

async function setup() {
  const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
  const w1 = await createDoc('wbs', { projectId: p.id, code: '1', name: 'A', planStart: Date.now(), enabled: true })
  const w2 = await createDoc('wbs', { projectId: p.id, code: '2', name: 'B', planStart: Date.now(), enabled: true })
  const c = await createDoc('contracts', { projectId: p.id, code: 'HT-1', name: 'C', amount: 300000, status: '正常' })
  await createDoc('budgets', { projectId: p.id, wbsId: w1.id, code: 'YS-1', category: '人工', amount: 100000 })
  await createDoc('budgets', { projectId: p.id, wbsId: w2.id, code: 'YS-2', category: '材料', amount: 100000 })
  return { p, w1, w2, c }
}

describe('M3-08 / R-03 四算对比', () => {
  beforeEach(async () => {
    await freshDb('cost')
  })

  it('合同价按预算占比分摊', async () => {
    const { p } = await setup()
    const res = await fourWayCompare(p.id)
    const a = res.rows.find((r) => r.code === '1')!
    expect(a.budget).toBe(100000)
    expect(a.contractPrice).toBe(150000)
    expect(res.totals.contractPrice).toBe(300000)
    expect(res.hasBudget).toBe(true)
  })

  it('预算为 0 时合同价显示为 —（rate=null），不参与超预算计数', async () => {
    const { p } = await setup()
    await createDoc('wbs', { projectId: p.id, code: '3', name: 'C', planStart: Date.now(), enabled: true })
    const res = await fourWayCompare(p.id)
    const c = res.rows.find((r) => r.code === '3')!
    expect(c.budget).toBe(0)
    expect(c.budgetMissing).toBe(true)
    expect(c.rate).toBeNull()
    expect(c.level).toBe('')
  })

  it('偏差率分级：>10% 紧急，0~10% 一般', async () => {
    const { p, w1, w2 } = await setup()
    await createDoc('expenses', { projectId: p.id, wbsId: w1.id, code: 'ZC-1', category: '人工', amount: 120000, occurDate: Date.now() })
    await createDoc('expenses', { projectId: p.id, wbsId: w2.id, code: 'ZC-2', category: '材料', amount: 105000, occurDate: Date.now() })
    const res = await fourWayCompare(p.id)
    expect(res.rows.find((r) => r.code === '1')!.level).toBe('紧急')
    expect(res.rows.find((r) => r.code === '2')!.level).toBe('一般')
    expect(res.rows.find((r) => r.code === '1')!.rate).toBeCloseTo(0.2, 5)
  })

  it('预估最终成本 = max(已发生, 预算)', async () => {
    const { p, w1 } = await setup()
    await createDoc('expenses', { projectId: p.id, wbsId: w1.id, code: 'ZC-1', category: '人工', amount: 80000, occurDate: Date.now() })
    const res = await fourWayCompare(p.id)
    const a = res.rows.find((r) => r.code === '1')!
    expect(a.estimate).toBe(100000)
    expect(a.deviation).toBe(-20000)
    expect(a.level).toBe('')
  })

  it('超预算项目数按项目去重计数', async () => {
    const { p, w1 } = await setup()
    await createDoc('expenses', { projectId: p.id, wbsId: w1.id, code: 'ZC-1', category: '人工', amount: 150000, occurDate: Date.now() })
    const p2 = await createDoc('projects', { code: 'XM-2', name: 'P2', status: '在建', planStart: Date.now() })
    expect(await overBudgetProjectCount([p.id, p2.id])).toBe(1)
  })

  it('同一 WBS+类别 预算重复被拦回', async () => {
    const { p, w1 } = await setup()
    await expect(assertBudgetUnique(p.id, w1.id, '人工')).rejects.toThrow(/已存在/)
    expect(await (async () => {
      try {
        await assertBudgetUnique(p.id, w1.id, '材料')
        return true
      } catch {
        return false
      }
    })()).toBe(true)
  })

  it('保存前校验把重复预算变成字段错误', async () => {
    const { p, w1 } = await setup()
    const cfg = getDoc('budget')
    const res = await beforeSave(cfg, {
      projectId: p.id,
      wbsId: w1.id,
      code: 'YS-9',
      category: '人工',
      amount: 1
    })
    expect(res.fieldErrors.some((e) => e.key === 'category')).toBe(true)
  })
})
