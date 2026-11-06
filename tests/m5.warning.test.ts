import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { createDoc, tbl, updateDoc } from '@/core/db/repo'
import { cleanupOldReads, computeWarnings, markRead, warningSummary, warningsWithRead } from '@/core/services/warning'
import { todayStart } from '@/shared/date'

const D = 86400000

async function hazard(projectId: string, code = 'YH-1') {
  return await createDoc('hazards', {
    projectId,
    code,
    level: '重大',
    location: 'K1',
    desc: '临边无防护',
    requirement: '立即整改',
    deadline: todayStart() - 2 * D,
    status: '待整改'
  })
}

describe('M5-02 / R-09 预警引擎与已读签名（AC-25）', () => {
  beforeEach(async () => {
    await freshDb('warn')
  })

  it('同一来源同一规则只产出一条（去重）', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await hazard(p.id)
    const items = await computeWarnings({ projectId: p.id })
    const hs = items.filter((i) => i.ruleKey === 'hazard-open')
    expect(hs.length).toBe(1)
  })

  it('标记已读后计入 unread 归零，重启重算仍为已读', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await hazard(p.id)
    let s = await warningSummary({ projectId: p.id })
    expect(s.unread).toBeGreaterThan(0)
    const items = await warningsWithRead({ projectId: p.id })
    await markRead(items.map((i) => i.key))
    s = await warningSummary({ projectId: p.id })
    expect(s.unread).toBe(0)
    // 模拟重开浏览器：已读记录在库里
    const reads = await tbl('warningReads').toArray()
    expect(reads.length).toBe(items.length)
  })

  it('状态签名变化视为新预警（重新未读）', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const h = await hazard(p.id)
    let items = await warningsWithRead({ projectId: p.id })
    await markRead(items.map((i) => i.key))
    expect((await warningSummary({ projectId: p.id })).unread).toBe(0)

    await updateDoc('hazards', h.id, { status: '整改中' })
    items = await warningsWithRead({ projectId: p.id })
    const hItem = items.find((i) => i.ruleKey === 'hazard-open')!
    expect(hItem.read).toBe(false)
    expect((await warningSummary({ projectId: p.id })).unread).toBe(1)
  })

  it('只改备注不改签名时保持已读', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const h = await hazard(p.id)
    let items = await warningsWithRead({ projectId: p.id })
    await markRead(items.map((i) => i.key))
    await updateDoc('hazards', h.id, { desc: '临边无防护（补充说明）' })
    items = await warningsWithRead({ projectId: p.id })
    expect(items.find((i) => i.ruleKey === 'hazard-open')!.read).toBe(true)
  })

  it('紧急/一般分级：重大隐患或逾期为紧急', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await hazard(p.id, 'YH-1')
    await createDoc('hazards', {
      projectId: p.id,
      code: 'YH-2',
      level: '一般',
      location: 'K2',
      desc: '材料堆放凌乱',
      requirement: '整理',
      deadline: todayStart() + 2 * D,
      status: '待整改'
    })
    const items = await computeWarnings({ projectId: p.id })
    expect(items.find((i) => i.code === 'YH-1')!.priority).toBe('紧急')
    expect(items.find((i) => i.code === 'YH-2')!.priority).toBe('一般')
  })

  it('隐患闭环后规则不再产出该条', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const h = await hazard(p.id)
    await updateDoc('hazards', h.id, { status: '合格闭环' })
    const items = await computeWarnings({ projectId: p.id })
    expect(items.filter((i) => i.ruleKey === 'hazard-open').length).toBe(0)
  })

  it('成本超预算与应收未收进入预警', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const w = await createDoc('wbs', { projectId: p.id, code: '1', name: 'A', planStart: Date.now(), enabled: true })
    await createDoc('budgets', { projectId: p.id, wbsId: w.id, code: 'YS-1', category: '人工', amount: 100000 })
    await createDoc('expenses', { projectId: p.id, wbsId: w.id, code: 'ZC-1', category: '人工', amount: 150000, occurDate: Date.now() })
    await createDoc('settlements', {
      projectId: p.id,
      code: 'JS-1',
      totalAmount: 1000,
      receivedAmount: 200,
      status: '部分收款',
      settleDate: todayStart() - 40 * D
    })
    const items = await computeWarnings({ projectId: p.id })
    expect(items.some((i) => i.ruleKey === 'cost-over' && i.priority === '紧急')).toBe(true)
    expect(items.some((i) => i.ruleKey === 'ar-outstanding')).toBe(true)
  })

  it('结算后 30 天内不产生应收预警', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await createDoc('settlements', {
      projectId: p.id,
      code: 'JS-1',
      totalAmount: 1000,
      receivedAmount: 200,
      status: '部分收款',
      settleDate: todayStart() - 5 * D
    })
    const items = await computeWarnings({ projectId: p.id })
    expect(items.filter((i) => i.ruleKey === 'ar-outstanding').length).toBe(0)
  })

  it('30 天前的已读记录会被清理', async () => {
    await tbl('warningReads').put({ id: 'k1', key: 'k1', ruleKey: 'x', sourceId: 'y', readAt: Date.now() - 31 * D })
    await tbl('warningReads').put({ id: 'k2', key: 'k2', ruleKey: 'x', sourceId: 'z', readAt: Date.now() })
    await cleanupOldReads(30)
    const rows = await tbl('warningReads').toArray()
    expect(rows.length).toBe(1)
    expect(rows[0].id).toBe('k2')
  })
})
