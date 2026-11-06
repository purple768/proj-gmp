import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { createDoc, updateDoc } from '@/core/db/repo'
import { applyReceipt, assertOutbound, balance, materialKey, reflowPlans, shouldStockIn, stockAlerts, planProgress } from '@/core/services/stock'
import { beforeSave } from '@/core/services/hooks'
import { getDoc } from '@/core/docs'
import { tbl } from '@/core/db/repo'

async function setup() {
  const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
  return p
}

describe('M4-05 / R-12 库存与入库时机（AC-16）', () => {
  beforeEach(async () => {
    await freshDb('stock')
  })

  it('送检=否 或 结论=合格 才入库', () => {
    expect(shouldStockIn({ inspectRequired: '否' })).toBe(true)
    expect(shouldStockIn({ inspectRequired: '是', inspectResult: '合格' })).toBe(true)
    expect(shouldStockIn({ inspectRequired: '是', inspectResult: '待出报告' })).toBe(false)
    expect(shouldStockIn({ inspectRequired: '是', inspectResult: '不合格' })).toBe(false)
  })

  it('进场单保存后生成入库流水，重复调用幂等', async () => {
    const p = await setup()
    const r = await createDoc('materialReceipts', {
      projectId: p.id,
      code: 'JC-1',
      materialName: '碎石',
      spec: '5-25mm',
      qty: 100,
      inspectRequired: '否',
      inDate: Date.now()
    })
    expect(await applyReceipt(r.id)).toBe('created')
    expect(await applyReceipt(r.id)).toBe('skipped')
    const flows = await (await import('@/core/db/repo')).allDocs('stockFlows', p.id)
    expect(flows.length).toBe(1)
    expect(flows[0].qty).toBe(100)
    expect(await balance(p.id, materialKey('碎石', '5-25mm'))).toBe(100)
  })

  it('送检不合格不入库（禁入）', async () => {
    const p = await setup()
    const r = await createDoc('materialReceipts', {
      projectId: p.id,
      code: 'JC-2',
      materialName: '钢筋',
      spec: 'HRB400 20',
      qty: 50,
      inspectRequired: '是',
      inspectResult: '不合格',
      inDate: Date.now()
    })
    expect(await applyReceipt(r.id)).toBe('skipped')
    expect(await balance(p.id, materialKey('钢筋', 'HRB400 20'))).toBe(0)
  })

  it('检测报告合格后再次保存可入库', async () => {
    const p = await setup()
    const r = await createDoc('materialReceipts', {
      projectId: p.id,
      code: 'JC-3',
      materialName: '钢筋',
      spec: 'HRB400 20',
      qty: 50,
      inspectRequired: '是',
      inspectResult: '待出报告',
      inDate: Date.now()
    })
    await applyReceipt(r.id)
    expect(await balance(p.id, materialKey('钢筋', 'HRB400 20'))).toBe(0)
    await updateDoc('materialReceipts', r.id, { inspectResult: '合格' })
    expect(await applyReceipt(r.id)).toBe('created')
    expect(await balance(p.id, materialKey('钢筋', 'HRB400 20'))).toBe(50)
  })

  it('出库不得超库存', async () => {
    const p = await setup()
    await createDoc('stockFlows', { projectId: p.id, code: 'RK-1', materialName: '水泥', spec: 'P.O42.5', direction: '入库', qty: 30, occurDate: Date.now() })
    await expect(assertOutbound(p.id, '水泥', 'P.O42.5', 40)).rejects.toThrow(/库存/)
    await expect(assertOutbound(p.id, '水泥', 'P.O42.5', 30)).resolves.toBeUndefined()
  })

  it('库存按 项目+名称+规格 归一，不同项目不合并', async () => {
    const p1 = await setup()
    const p2 = await createDoc('projects', { code: 'XM-2', name: 'P2', status: '在建', planStart: Date.now() })
    await createDoc('stockFlows', { projectId: p1.id, code: 'RK-1', materialName: '砂', spec: '中砂', direction: '入库', qty: 10, occurDate: Date.now() })
    await createDoc('stockFlows', { projectId: p2.id, code: 'RK-2', materialName: '砂', spec: '中砂', direction: '入库', qty: 99, occurDate: Date.now() })
    expect(await balance(p1.id, materialKey('砂', '中砂'))).toBe(10)
    expect(await balance(p2.id, materialKey('砂', '中砂'))).toBe(99)
  })

  it('进场回写需求计划状态：待采购 → 部分进场 → 全部完成', async () => {
    const p = await setup()
    const plan = await createDoc('materialPlans', {
      projectId: p.id,
      code: 'XQ-1',
      materialName: '水稳',
      spec: '5%',
      unit: 't',
      qty: 100,
      planDate: Date.now(),
      status: '待采购'
    })
    expect((await planProgress(p.id, plan.id)).status).toBe('待采购')
    const r1 = await createDoc('materialReceipts', {
      projectId: p.id,
      planCode: 'XQ-1',
      code: 'JC-1',
      materialName: '水稳',
      spec: '5%',
      qty: 40,
      inspectRequired: '否',
      inDate: Date.now()
    })
    await applyReceipt(r1.id)
    await reflowPlans(p.id)
    expect((await planProgress(p.id, plan.id)).status).toBe('部分进场')
    const r2 = await createDoc('materialReceipts', {
      projectId: p.id,
      planCode: 'XQ-1',
      code: 'JC-2',
      materialName: '水稳',
      spec: '5%',
      qty: 60,
      inspectRequired: '否',
      inDate: Date.now()
    })
    await applyReceipt(r2.id)
    await reflowPlans(p.id)
    expect((await planProgress(p.id, plan.id)).status).toBe('全部完成')
  })

  it('库存低于字典最低库存时产生告警', async () => {
    const p = await setup()
    await createDoc('stockFlows', { projectId: p.id, code: 'RK-1', materialName: '水泥', spec: 'P.O42.5', direction: '入库', qty: 5, occurDate: Date.now() })
    await tbl('dictionaries').put({ key: materialKey('水泥', 'P.O42.5'), value: { minStock: 20 } })
    const alerts = await stockAlerts(p.id)
    expect(alerts.length).toBe(1)
    expect(alerts[0].qty).toBe(5)
    expect(alerts[0].minStock).toBe(20)
  })

  it('出库校验通过 hooks 进入字段级错误', async () => {
    const p = await setup()
    const cfg = getDoc('stockFlow')
    const res = await beforeSave(cfg, {
      projectId: p.id,
      code: 'CK-1',
      materialName: '水泥',
      spec: 'P.O42.5',
      direction: '出库',
      qty: 10,
      occurDate: Date.now()
    })
    expect(res.fieldErrors.some((e) => e.key === 'qty')).toBe(true)
  })
})
