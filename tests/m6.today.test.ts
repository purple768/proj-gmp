import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { createDoc, tbl } from '@/core/db/repo'
import { addTodo, buildToday, toggleTodo } from '@/core/services/today'
import { todayStart } from '@/shared/date'

const D = 86400000

describe('M2-06 / R-10 今日计划四类来源', () => {
  beforeEach(async () => {
    await freshDb('today')
  })

  it('今日到期整改单进入待办，不计逾期', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now(), reportCycle: '月' })
    await createDoc('hazards', {
      projectId: p.id,
      code: 'YH-1',
      level: '一般',
      location: 'K1',
      desc: 'x',
      requirement: 'y',
      deadline: todayStart(),
      status: '待整改'
    })
    const res = await buildToday(p.id)
    const item = res.items.find((i) => i.docId)!
    expect(item.kind).toBe('整改')
    expect(item.overdue).toBe(false)
    expect(res.todoCount).toBe(1)
    expect(res.overdueCount).toBe(0)
  })

  it('逾期整改单计入 N 与 M，并给出逾期天数', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now(), reportCycle: '月' })
    await createDoc('hazards', {
      projectId: p.id,
      code: 'YH-2',
      level: '重大',
      location: 'K2',
      desc: 'x',
      requirement: 'y',
      deadline: todayStart() - 3 * D,
      status: '待整改'
    })
    const res = await buildToday(p.id)
    const item = res.items.find((i) => i.kind === '整改')!
    expect(item.overdue).toBe(true)
    expect(item.overdueDays).toBe(3)
    expect(res.todoCount).toBe(1)
    expect(res.overdueCount).toBe(1)
  })

  it('已闭环隐患不进入今日计划', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now(), reportCycle: '月' })
    await createDoc('hazards', {
      projectId: p.id,
      code: 'YH-3',
      level: '一般',
      location: 'K3',
      desc: 'x',
      requirement: 'y',
      deadline: todayStart(),
      status: '合格闭环'
    })
    expect((await buildToday(p.id)).items.length).toBe(0)
  })

  it('今日到期证件进入待办', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now(), reportCycle: '月' })
    await createDoc('certificates', { projectId: p.id, code: 'ZJ-1', holder: '张三', jobType: '电工', expireDate: todayStart() })
    const res = await buildToday(p.id)
    expect(res.items.some((i) => i.kind === '证件')).toBe(true)
  })

  it('填报基准日当天未填报时按项目只出一条（R-11）', async () => {
    const p = await createDoc('projects', {
      code: 'XM-1',
      name: 'P',
      status: '在建',
      planStart: Date.now(),
      reportCycle: '日'
    })
    await createDoc('wbs', { projectId: p.id, code: '1', name: 'A', planStart: Date.now(), enabled: true })
    await createDoc('wbs', { projectId: p.id, code: '2', name: 'B', planStart: Date.now(), enabled: true })
    const res = await buildToday(p.id)
    const reportItems = res.items.filter((i) => i.kind === '填报')
    expect(reportItems.length).toBe(1)
    expect(reportItems[0].title).toContain('已填 0/2')
  })

  it('已填报全部 WBS 时不再提示填报', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now(), reportCycle: '日' })
    const w = await createDoc('wbs', { projectId: p.id, code: '1', name: 'A', planStart: Date.now(), enabled: true })
    await createDoc('progressRecords', { projectId: p.id, wbsId: w.id, code: 'JD-1', reportDate: todayStart(), planRate: 10, actualRate: 10 })
    const res = await buildToday(p.id)
    expect(res.items.filter((i) => i.kind === '填报').length).toBe(0)
  })

  it('手动待办可新增、可完成，逾期待办单独计数', async () => {
    await freshDb('today2')
    const id1 = await addTodo('联系监理验收')
    await addTodo('整理归档资料')
    let res = await buildToday(null)
    expect(res.items.filter((i) => i.manual).length).toBe(2)
    expect(res.overdueCount).toBe(0)

    await toggleTodo(id1, true)
    res = await buildToday(null)
    expect(res.items.filter((i) => i.manual).length).toBe(1)

    // 把剩余待办日期改到昨天，应计入逾期
    const all: any[] = await tbl('todayTodos').toArray()
    const remain = all.find((t) => !t.done)!
    await tbl('todayTodos').put({ ...remain, date: todayStart() - 2 * D })
    res = await buildToday(null)
    expect(res.overdueCount).toBe(1)
    expect(res.items.find((i) => i.manual)!.overdueDays).toBe(2)
  })
})
