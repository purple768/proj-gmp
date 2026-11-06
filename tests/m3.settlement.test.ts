import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { createDoc, updateDoc } from '@/core/db/repo'
import { checkSettlement, receivable, referenceValues, unreceivedOf } from '@/core/services/settlement'
import { beforeSave } from '@/core/services/hooks'
import { getDoc } from '@/core/docs'

describe('M3-05 / R-02 结算金额与应收口径', () => {
  beforeEach(async () => {
    await freshDb('settle')
  })

  it('未收余额 = max(0, 结算 - 已收)', () => {
    expect(unreceivedOf({ totalAmount: 100, receivedAmount: 30 })).toBe(70)
    expect(unreceivedOf({ totalAmount: 100, receivedAmount: 120 })).toBe(0)
    expect(unreceivedOf({ totalAmount: 0, receivedAmount: 0 })).toBe(0)
  })

  it('首页应收未收只统计待收款/部分收款，已结清与软删不计', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await createDoc('settlements', { projectId: p.id, code: 'JS-1', totalAmount: 1000, receivedAmount: 400, status: '部分收款' })
    await createDoc('settlements', { projectId: p.id, code: 'JS-2', totalAmount: 2000, receivedAmount: 2000, status: '已结清' })
    const deleted = await createDoc('settlements', { projectId: p.id, code: 'JS-3', totalAmount: 500, receivedAmount: 0, status: '待收款', deletedAt: Date.now() })
    const res = await receivable(p.id)
    expect(res.total).toBe(1000)
    expect(res.received).toBe(400)
    expect(res.unreceived).toBe(600)
    expect(res.count).toBe(1)
    void deleted
  })

  it('已收大于结算直接拦截', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const res = await checkSettlement({ projectId: p.id, totalAmount: 100, receivedAmount: 150, status: '部分收款' })
    expect(res.errors).toContain('已收金额不能大于结算总金额')
  })

  it('已结清但仍有未收余额给出提示', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const res = await checkSettlement({ projectId: p.id, totalAmount: 100, receivedAmount: 90, status: '已结清' })
    expect(res.warnings.some((w) => w.includes('未收余额'))).toBe(true)
  })

  it('与参考值差异 >5% 提示但不阻断', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const c = await createDoc('contracts', { projectId: p.id, code: 'HT-1', name: 'C', amount: 100000, status: '正常' })
    await createDoc('submissions', { projectId: p.id, contractId: c.id, code: 'BS-1', amount: 100000, auditStatus: '已审核', periodEnd: Date.now() })
    const ref = await referenceValues(p.id, c.id)
    expect(ref.reference).toBe(100000)
    const res = await checkSettlement({ projectId: p.id, contractId: c.id, totalAmount: 80000, receivedAmount: 0, status: '待收款' })
    expect(res.errors.length).toBe(0)
    expect(res.warnings.some((w) => w.includes('差异'))).toBe(true)
  })

  it('已审核报审与已确认签证计入参考值，待审不计', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const c = await createDoc('contracts', { projectId: p.id, code: 'HT-1', name: 'C', amount: 500000, status: '正常' })
    await createDoc('visas', { projectId: p.id, contractId: c.id, code: 'QZ-1', total: 30000, confirmStatus: '已确认' })
    await createDoc('visas', { projectId: p.id, contractId: c.id, code: 'QZ-2', total: 99999, confirmStatus: '待确认' })
    await createDoc('submissions', { projectId: p.id, contractId: c.id, code: 'BS-1', amount: 200000, auditStatus: '已审核', periodEnd: Date.now() })
    await createDoc('submissions', { projectId: p.id, contractId: c.id, code: 'BS-2', amount: 88888, auditStatus: '待审', periodEnd: Date.now() })
    const ref = await referenceValues(p.id, c.id)
    expect(ref.visaTotal).toBe(30000)
    expect(ref.submitted).toBe(200000)
    expect(ref.contractAmount).toBe(500000)
    expect(ref.reference).toBe(230000)
  })

  it('一合同多结算累计超「合同+变更+签证」110% 时提示（不阻断）', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const c = await createDoc('contracts', { projectId: p.id, code: 'HT-1', name: 'C', amount: 100000, status: '正常' })
    await createDoc('changes', { projectId: p.id, contractId: c.id, code: 'BG-1', auditStatus: '已批', addAmount: 10000, subAmount: 0 })
    await createDoc('visas', { projectId: p.id, contractId: c.id, code: 'QZ-1', total: 5000, confirmStatus: '已确认' })
    await createDoc('settlements', { projectId: p.id, contractId: c.id, code: 'JS-1', totalAmount: 100000, receivedAmount: 0, status: '待收款' })

    // 上限 = (100000 + 10000 + 5000) × 1.1 = 126500；本次再结转 20000 → 累计 120000，未超
    const okRes = await checkSettlement({
      projectId: p.id,
      contractId: c.id,
      code: 'JS-2',
      totalAmount: 20000,
      receivedAmount: 0,
      status: '待收款'
    })
    expect(okRes.errors.length).toBe(0)
    expect(okRes.warnings.some((w) => w.includes('110%'))).toBe(false)

    // 本次结转 30000 → 累计 130000 > 126500，给出提示但不阻断
    const overRes = await checkSettlement({
      projectId: p.id,
      contractId: c.id,
      code: 'JS-3',
      totalAmount: 30000,
      receivedAmount: 0,
      status: '待收款'
    })
    expect(overRes.errors.length).toBe(0)
    expect(overRes.warnings.some((w) => w.includes('110%'))).toBe(true)
  })

  it('未批准的变更洽商不允许据此新增签证；已批后可保存（AC-15）', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const c = await createDoc('contracts', { projectId: p.id, code: 'HT-1', name: 'C', amount: 1000, status: '正常' })
    const pending = await createDoc('changes', { projectId: p.id, contractId: c.id, code: 'BG-1', auditStatus: '待审', content: '增加雨水口' })
    const visa = getDoc('visa')
    const base = {
      projectId: p.id,
      contractId: c.id,
      wbsId: 'w1',
      reason: '增加雨水口',
      content: '按洽商增加雨水口 2 座',
      qty: 2,
      price: 100,
      total: 200,
      confirmStatus: '待确认'
    }

    const blocked = await beforeSave(visa, { ...base, code: 'QZ-20261106-0001', changeId: pending.id })
    expect(blocked.errors.some((e) => e.includes('未批准'))).toBe(true)
    expect(blocked.fieldErrors.some((f) => f.key === 'changeId')).toBe(true)

    await updateDoc('changes', pending.id, { auditStatus: '已批' })
    const ok = await beforeSave(visa, { ...base, code: 'QZ-20261106-0002', changeId: pending.id })
    expect(ok.errors.length).toBe(0)
  })

  it('引用不存在的变更洽商时报错', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const c = await createDoc('contracts', { projectId: p.id, code: 'HT-1', name: 'C', amount: 1000, status: '正常' })
    const visa = getDoc('visa')
    const res = await beforeSave(visa, {
      projectId: p.id,
      contractId: c.id,
      changeId: 'not-exist',
      code: 'QZ-20261106-0003',
      wbsId: 'w1',
      reason: 'x',
      content: 'y',
      qty: 1,
      price: 10,
      confirmStatus: '待确认'
    })
    expect(res.errors.some((e) => e.includes('不存在'))).toBe(true)
  })

  it('合同已完成不允许新增签证（保存前拦截）', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const c = await createDoc('contracts', { projectId: p.id, code: 'HT-1', name: 'C', amount: 100, status: '已完成' })
    const visa = getDoc('visa')
    const res = await beforeSave(visa, {
      projectId: p.id,
      contractId: c.id,
      code: 'QZ-20261106-0001',
      wbsId: 'w1',
      reason: 'x',
      content: 'y',
      qty: 1,
      price: 10,
      total: 10,
      confirmStatus: '待确认'
    })
    expect(res.errors.some((e) => e.includes('合同已完成'))).toBe(true)
  })
})
