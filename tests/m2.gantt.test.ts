import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { createDoc } from '@/core/db/repo'
import { buildGantt, latestByWbs, progressWarnings } from '@/core/services/gantt'

const D = 86400000
const base = new Date(2026, 0, 5).getTime() // 2026-01-05 周一

async function setup() {
  const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: base })
  const root = await createDoc('wbs', {
    projectId: p.id,
    parentId: null,
    code: '1',
    name: '道路',
    planStart: base,
    planEnd: base + 29 * D,
    enabled: true
  })
  const a = await createDoc('wbs', {
    projectId: p.id,
    parentId: root.id,
    code: '1.1',
    name: '路基',
    planStart: base,
    planEnd: base + 9 * D,
    enabled: true
  })
  const b = await createDoc('wbs', {
    projectId: p.id,
    parentId: root.id,
    code: '1.2',
    name: '基层',
    planStart: base + 10 * D,
    planEnd: base + 29 * D,
    enabled: true
  })
  return { p, root, a, b }
}

describe('M2-03 / M3-02 甘特图与进度（R-04）', () => {
  beforeEach(async () => {
    await freshDb('gantt')
  })

  it('最新填报按 reportDate 取，同日取最后创建', async () => {
    const { p, a } = await setup()
    await createDoc('progressRecords', { projectId: p.id, wbsId: a.id, reportDate: base + 3 * D, actualRate: 30, planRate: 40 })
    await createDoc('progressRecords', { projectId: p.id, wbsId: a.id, reportDate: base + 5 * D, actualRate: 60, planRate: 70 })
    const rows = await (await import('@/core/db/repo')).allDocs('progressRecords', p.id)
    const latest = latestByWbs(rows, a.id)
    expect(latest!.actualRate).toBe(60)
  })

  it('叶子节点实际条长度 = 完成率 × 计划工期', async () => {
    const { p, a } = await setup()
    await createDoc('progressRecords', { projectId: p.id, wbsId: a.id, reportDate: base + 5 * D, actualRate: 50, planRate: 60 })
    const bars = await buildGantt(p.id)
    const bar = bars.find((x) => x.wbsId === a.id)!
    expect(bar.source).toBe('self')
    expect(bar.rate).toBe(50)
    // 10 天计划工期 × 50% = 5 天 → 起止相差 4 天
    const days = Math.round((bar.actualEnd! - bar.actualStart!) / D) + 1
    expect(days).toBe(5)
  })

  it('父节点无自身填报时按子节点工期加权（仅展示层）', async () => {
    const { p, a, b } = await setup()
    await createDoc('progressRecords', { projectId: p.id, wbsId: a.id, reportDate: base + 5 * D, actualRate: 100, planRate: 100 })
    await createDoc('progressRecords', { projectId: p.id, wbsId: b.id, reportDate: base + 5 * D, actualRate: 0, planRate: 10 })
    const bars = await buildGantt(p.id)
    const root = bars.find((x) => x.name === '道路')!
    expect(root.source).toBe('children')
    // 路基 10 天 ×100%，基层 20 天 ×0% → 1000/30 ≈ 33
    expect(root.rate).toBe(33)
  })

  it('父节点有自身填报时优先自身', async () => {
    const { p, root } = await setup()
    await createDoc('progressRecords', { projectId: p.id, wbsId: root.id, reportDate: base + 6 * D, actualRate: 30, planRate: 40 })
    const bars = await buildGantt(p.id)
    expect(bars.find((x) => x.wbsId === root.id)!.source).toBe('self')
    expect(bars.find((x) => x.wbsId === root.id)!.rate).toBe(30)
  })

  it('无填报不画实际条（与 0% 区分）', async () => {
    const { p, a } = await setup()
    const bars = await buildGantt(p.id)
    const bar = bars.find((x) => x.wbsId === a.id)!
    expect(bar.source).toBe('none')
    expect(bar.actualStart).toBeNull()
  })

  it('工期预警：预计工期 = 计划工期 / 完成率，偏差 >7 天为紧急', async () => {
    const { p, a } = await setup()
    await createDoc('progressRecords', { projectId: p.id, wbsId: a.id, reportDate: base + 5 * D, actualRate: 20, planRate: 50 })
    const warns = await progressWarnings(p.id)
    const w = warns.find((x) => x.wbsId === a.id)!
    expect(w.planDays).toBe(10)
    expect(w.estimatedDays).toBe(50)
    expect(w.deviation).toBe(40)
    expect(w.level).toBe('紧急')
  })

  it('完成率 100% 不产生工期预警', async () => {
    const { p, a } = await setup()
    await createDoc('progressRecords', { projectId: p.id, wbsId: a.id, reportDate: base + 5 * D, actualRate: 100, planRate: 100 })
    const warns = await progressWarnings(p.id)
    expect(warns.find((x) => x.wbsId === a.id)).toBeUndefined()
  })
})
