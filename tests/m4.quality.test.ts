import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { createDoc, updateDoc } from '@/core/db/repo'
import { approvedMeasurementTotal, createDefectFromInspection, expireStatus, isOverdueBorrow, payrollSuggestion, remainDays } from '@/core/services/quality'
import { beforeSave } from '@/core/services/hooks'
import { getDoc } from '@/core/docs'
import { warningsWithRead } from '@/core/services/warning'
import { todayStart } from '@/shared/date'

const D = 86400000

describe('M4 质量/安全/劳务联动', () => {
  beforeEach(async () => {
    await freshDb('m4')
  })

  it('不合格检验批 → 一键生成缺陷单并带来源单号（AC-17）', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const insp = await createDoc('inspections', {
      projectId: p.id,
      code: 'JYP-20261106-0001',
      subItem: '水泥混凝土面层',
      part: 'K0+100',
      checkDate: Date.now(),
      result: '不合格',
      mainItems: '平整度超差'
    })
    const defect = await createDefectFromInspection(insp.id)
    expect(defect.sourceCode).toBe(insp.code)
    expect(defect.code).toBe('QX-20261106-0001')
    expect(defect.checkResult).toBe('待复查')
    // 幂等：重复点击不重复建单
    const again = await createDefectFromInspection(insp.id)
    expect(again.id).toBe(defect.id)
  })

  it('合格检验批不允许生成缺陷单', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const insp = await createDoc('inspections', { projectId: p.id, code: 'JYP-2', checkDate: Date.now(), result: '合格' })
    await expect(createDefectFromInspection(insp.id)).rejects.toThrow(/不合格/)
  })

  it('证件剩余天数按自然日，且分三档状态（AC-26 / R-13）', () => {
    const today = todayStart()
    expect(remainDays(today + 20 * D, today)).toBe(20)
    expect(remainDays(today - 5 * D, today)).toBe(-5)
    expect(remainDays(today, today)).toBe(0)
    expect(expireStatus(today + 20 * D, today).type).toBe('warning')
    expect(expireStatus(today + 20 * D, today).label).toBe('剩 20 天')
    expect(expireStatus(today - 5 * D, today).type).toBe('danger')
    expect(expireStatus(today - 5 * D, today).label).toBe('已过期 5 天')
    expect(expireStatus(today, today).label).toBe('今天到期')
    expect(expireStatus(today + 90 * D, today).type).toBe('success')
    expect(expireStatus(null, today).type).toBe('info')
  })

  it('证件到期在预警中分级：过期紧急、30 天内一般', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const today = todayStart()
    await createDoc('certificates', { projectId: p.id, code: 'ZJ-1', holder: '张三', jobType: '电工', expireDate: today - 3 * D })
    await createDoc('certificates', { projectId: p.id, code: 'ZJ-2', holder: '李四', jobType: '焊工', expireDate: today + 10 * D })
    await createDoc('certificates', { projectId: p.id, code: 'ZJ-3', holder: '王五', jobType: '架子工', expireDate: today + 200 * D })
    const items = await warningsWithRead({ projectId: p.id })
    const certs = items.filter((i) => i.ruleKey === 'cert-expire')
    expect(certs.length).toBe(2)
    expect(certs.find((c) => c.code === 'ZJ-1')!.priority).toBe('紧急')
    expect(certs.find((c) => c.code === 'ZJ-2')!.priority).toBe('一般')
  })

  it('隐患闭环后不再产生预警；撤销闭环后重新出现（AC-18 / R-09）', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const h = await createDoc('hazards', {
      projectId: p.id,
      code: 'YH-1',
      level: '重大',
      location: 'K1',
      desc: '临边无防护',
      requirement: '立即整改',
      deadline: todayStart() - 2 * D,
      status: '待整改'
    })
    let items = await warningsWithRead({ projectId: p.id })
    expect(items.filter((i) => i.ruleKey === 'hazard-open').length).toBe(1)
    await updateDoc('hazards', h.id, { status: '合格闭环' })
    items = await warningsWithRead({ projectId: p.id })
    expect(items.filter((i) => i.ruleKey === 'hazard-open').length).toBe(0)
    await updateDoc('hazards', h.id, { status: '整改中' })
    items = await warningsWithRead({ projectId: p.id })
    expect(items.filter((i) => i.ruleKey === 'hazard-open').length).toBe(1)
  })

  it('已审核计量合计作为工资取数来源', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const t = await createDoc('teams', { projectId: p.id, code: 'BZ-1', name: '钢筋班', status: '在岗' })
    const month = '2026-11'
    await createDoc('teamMeasurements', { projectId: p.id, teamId: t.id, code: 'JL-1', amount: 12000, auditStatus: '已审核', periodEnd: new Date(2026, 10, 20).getTime() })
    await createDoc('teamMeasurements', { projectId: p.id, teamId: t.id, code: 'JL-2', amount: 8000, auditStatus: '待审', periodEnd: new Date(2026, 10, 25).getTime() })
    expect(await approvedMeasurementTotal(p.id, t.id)).toBe(12000)
    expect(await approvedMeasurementTotal(p.id, t.id, month)).toBe(12000)
    expect(await approvedMeasurementTotal(p.id, t.id, '2026-10')).toBe(0)
  })

  it('工资建议带出在岗人数', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const t = await createDoc('teams', { projectId: p.id, code: 'BZ-1', name: '钢筋班', status: '在岗' })
    await createDoc('workers', { projectId: p.id, teamId: t.id, code: 'RY-1', name: '张三', status: '在岗' })
    await createDoc('workers', { projectId: p.id, teamId: t.id, code: 'RY-2', name: '李四', status: '退场' })
    const s = await payrollSuggestion(p.id, t.id, '2026-11')
    expect(s.headCount).toBe(1)
  })

  it('退场设备不能新增台班、退场班组不能加人与录考勤（R-14）', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const eq = await createDoc('equipment', { projectId: p.id, code: 'SB-1', name: '挖机', status: '退场' })
    const shift = await beforeSave(getDoc('machineShift'), {
      projectId: p.id,
      code: 'TB-1',
      equipmentId: eq.id,
      workDate: Date.now(),
      qty: 1,
      operator: '张师傅'
    })
    expect(shift.errors.some((e) => e.includes('设备已退场'))).toBe(true)

    const team = await createDoc('teams', { projectId: p.id, code: 'BZ-1', name: '木工班', status: '退场' })
    const worker = await beforeSave(getDoc('worker'), {
      projectId: p.id,
      code: 'RY-1',
      name: '张三',
      teamId: team.id,
      idCard: '110101199001011234',
      jobType: '木工',
      phone: '13800000000',
      inDate: Date.now(),
      status: '在岗'
    })
    expect(worker.errors.some((e) => e.includes('班组已退场'))).toBe(true)

    const att = await beforeSave(getDoc('attendance'), {
      projectId: p.id,
      code: 'KQ-1',
      teamId: team.id,
      workDate: Date.now(),
      presentCount: 3,
      recorder: '李四'
    })
    expect(att.errors.some((e) => e.includes('班组已退场'))).toBe(true)
  })

  it('资料借出超过 30 天视为逾期', () => {
    const today = todayStart()
    expect(isOverdueBorrow({ borrower: '张三', borrowDate: today - 31 * D }, 30, today)).toBe(true)
    expect(isOverdueBorrow({ borrower: '张三', borrowDate: today - 31 * D, returnDate: today }, 30, today)).toBe(false)
    expect(isOverdueBorrow({ borrower: '张三', borrowDate: today - 3 * D }, 30, today)).toBe(false)
  })
})
