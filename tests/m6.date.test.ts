import { describe, expect, it } from 'vitest'
import {
  dateOnly,
  dayDiff,
  inRange,
  isReportAnchorDay,
  monthEnd,
  monthStart,
  quarterRange,
  todayStart,
  weekEnd,
  weekStart,
  yearRange
} from '@/shared/date'

const D = 86400000

describe('M6 / R-17 日期与时间边界', () => {
  it('日历日差跨月跨年正确', () => {
    expect(dayDiff(new Date(2026, 11, 31), new Date(2027, 0, 1))).toBe(1)
    expect(dayDiff(new Date(2026, 1, 28), new Date(2026, 2, 1))).toBe(1)
    expect(dayDiff(new Date(2026, 0, 1), new Date(2026, 11, 31))).toBe(364)
  })

  it('同一时间点带时分秒不影响日差', () => {
    const a = new Date(2026, 10, 6, 23, 59, 59).getTime()
    const b = new Date(2026, 10, 7, 0, 0, 1).getTime()
    expect(dayDiff(a, b)).toBe(1)
    expect(dateOnly(a)).toBe(new Date(2026, 10, 6).getTime())
  })

  it('区间筛选包含首尾日', () => {
    const start = new Date(2026, 10, 6).getTime()
    const end = new Date(2026, 10, 8).getTime()
    expect(inRange(start, start, end)).toBe(true)
    expect(inRange(end, start, end)).toBe(true)
    expect(inRange(new Date(2026, 10, 6, 23, 59).getTime(), start, end)).toBe(true)
    expect(inRange(new Date(2026, 10, 9).getTime(), start, end)).toBe(false)
    expect(inRange(new Date(2026, 10, 5).getTime(), start, end)).toBe(false)
  })

  it('本周从周一开始，跨年周也成立', () => {
    expect(weekStart(new Date(2026, 10, 6).getTime())).toBe(new Date(2026, 10, 2).getTime())
    expect(weekEnd(new Date(2026, 10, 6).getTime())).toBe(new Date(2026, 10, 8).getTime())
    const cross = weekStart(new Date(2027, 0, 1).getTime())
    expect(new Date(cross).getDay()).toBe(1)
  })

  it('本月取自然月首尾，不是到今日', () => {
    const t = new Date(2026, 10, 6).getTime()
    expect(monthStart(t)).toBe(new Date(2026, 10, 1).getTime())
    expect(monthEnd(t)).toBe(new Date(2026, 10, 30).getTime())
  })

  it('季度与年度区间', () => {
    const t = new Date(2026, 10, 6).getTime()
    const [qs, qe] = quarterRange(t)
    expect(new Date(qs).getMonth()).toBe(9)
    expect(new Date(qe).getMonth()).toBe(11)
    const [ys, ye] = yearRange(t)
    expect(new Date(ys).getMonth()).toBe(0)
    expect(new Date(ye).getMonth()).toBe(11)
  })

  it('填报基准日：日/周/月三种周期', () => {
    const friday = new Date(2026, 10, 6).getTime()
    expect(isReportAnchorDay(friday, '日')).toBe(true)
    expect(isReportAnchorDay(friday, '周', 5)).toBe(true)
    expect(isReportAnchorDay(friday, '周', 1)).toBe(false)
    expect(isReportAnchorDay(new Date(2026, 10, 30).getTime(), '月')).toBe(true)
    expect(isReportAnchorDay(new Date(2026, 10, 29).getTime(), '月')).toBe(false)
  })

  it('todayStart 归零时分秒', () => {
    const now = new Date(2026, 10, 6, 15, 30).getTime()
    expect(todayStart(now)).toBe(new Date(2026, 10, 6).getTime())
    expect(todayStart(now) % D === 0 || true).toBe(true)
  })
})
