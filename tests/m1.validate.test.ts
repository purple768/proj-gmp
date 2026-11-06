import { describe, expect, it } from 'vitest'
import { applyComputed, defaultRow, normalizeNumbers, validateRow } from '@/core/engine/validate'
import { getDoc } from '@/core/docs'

const visa = getDoc('visa')
const hazard = getDoc('hazard')

describe('M1-05 表单校验引擎（AC-04）', () => {
  it('必填字段为空时逐项报错，不短路', () => {
    const errors = validateRow(visa, {})
    const keys = errors.map((e) => e.key)
    expect(keys).toContain('contractId')
    expect(keys).toContain('reason')
    expect(keys).toContain('qty')
    expect(keys.length).toBeGreaterThanOrEqual(6)
  })

  it('完成率超过 100 被拦回', () => {
    const errors = validateRow(hazard, {
      code: 'YH-1',
      level: '一般',
      location: 'A',
      desc: 'x',
      requirement: 'y',
      deadline: Date.now(),
      status: '待整改'
    })
    expect(errors.length).toBe(0)
    const progress = getDoc('progress')
    const errs = validateRow(progress, { code: 'JD-1', wbsId: 'w1', cycle: '周', reportDate: Date.now(), planRate: 120, actualRate: 50 })
    expect(errs.some((e) => e.key === 'planRate')).toBe(true)
  })

  it('金额为负被拦回', () => {
    const settlement = getDoc('settlement')
    const errs = validateRow(settlement, {
      code: 'JS-1',
      contractId: 'c1',
      totalAmount: -1,
      settleDate: Date.now(),
      status: '待收款'
    })
    expect(errs.some((e) => e.key === 'totalAmount')).toBe(true)
  })

  it('枚举取值非法被拦回', () => {
    const errs = validateRow(hazard, {
      code: 'YH-1',
      level: '超大',
      location: 'A',
      desc: 'x',
      requirement: 'y',
      deadline: Date.now(),
      status: '待整改'
    })
    expect(errs.some((e) => e.key === 'level')).toBe(true)
  })

  it('签证合价自动计算且只读', () => {
    const row = applyComputed(visa, { qty: 12.5, price: 88.8 })
    expect(row.total).toBe(1110)
    const f = visa.fields.find((x) => x.key === 'total')!
    expect(f.type).toBe('computed')
  })

  it('数值规整：金额 2 位、数量 3 位、完成率取整', () => {
    const out = normalizeNumbers(visa, { qty: 1.23456, price: 2.005 })
    expect(out.qty).toBe(1.235)
    expect(out.price).toBe(2.01)
    const progress = getDoc('progress')
    const p = normalizeNumbers(progress, { planRate: 66.6, actualRate: 33.3 })
    expect(p.planRate).toBe(67)
    expect(p.actualRate).toBe(33)
  })

  it('默认值按配置生成', () => {
    const row = defaultRow(hazard, 'proj-1')
    expect(row.projectId).toBe('proj-1')
    expect(row.status).toBe('待整改')
    expect(row.level).toBe('一般')
  })
})
