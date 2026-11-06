export const DAY_MS = 86400000

/** 归零到当天 00:00:00.000（本地时区），用于日历日比较 */
export function dateOnly(ts: number | string | Date): number {
  const d = ts instanceof Date ? ts : new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** 日历日差：b - a，单位天。不做毫秒除法，避免时区/夏令时误差 */
export function dayDiff(a: number | string | Date, b: number | string | Date): number {
  const da = dateOnly(a)
  const db = dateOnly(b)
  const ua = new Date(da).getTimezoneOffset()
  const ub = new Date(db).getTimezoneOffset()
  return Math.round((db - da + (ub - ua) * 60000) / DAY_MS)
}

export function todayStart(now = Date.now()): number {
  return dateOnly(now)
}

export function isSameDay(a: number | string | Date, b: number | string | Date): boolean {
  return dateOnly(a) === dateOnly(b)
}

export function fmtDate(ts?: number | string | Date | null): string {
  if (ts === null || ts === undefined || ts === '') return ''
  const d = ts instanceof Date ? ts : new Date(ts)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function fmtDateTime(ts?: number | null): string {
  if (!ts) return ''
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${fmtDate(d)} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 支持 yyyy-MM-dd / yyyy/MM/dd / 时间戳 */
export function parseDate(v: any): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  if (v instanceof Date) return v.getTime()
  const s = String(v).trim().replace(/\//g, '-')
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (!m) {
    const t = new Date(s).getTime()
    return Number.isNaN(t) ? null : t
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime()
}

export function monthStart(ts = Date.now()): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime()
}

export function monthEnd(ts = Date.now()): number {
  const d = new Date(ts)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime()
}

/** 周一为一周首日 */
export function weekStart(ts = Date.now()): number {
  const d = new Date(dateOnly(ts))
  const wd = d.getDay() === 0 ? 7 : d.getDay()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - (wd - 1)).getTime()
}

export function weekEnd(ts = Date.now()): number {
  return new Date(weekStart(ts)).setDate(new Date(weekStart(ts)).getDate() + 6)
}

export function quarterRange(ts = Date.now()): [number, number] {
  const d = new Date(ts)
  const q = Math.floor(d.getMonth() / 3)
  const start = new Date(d.getFullYear(), q * 3, 1)
  const end = new Date(d.getFullYear(), q * 3 + 3, 0)
  return [start.getTime(), end.getTime()]
}

export function yearRange(ts = Date.now()): [number, number] {
  const d = new Date(ts)
  return [new Date(d.getFullYear(), 0, 1).getTime(), new Date(d.getFullYear(), 11, 31).getTime()]
}

/** 日期区间包含首尾日 */
export function inRange(ts: number | null | undefined, start: number | null, end: number | null): boolean {
  if (ts === null || ts === undefined) return false
  if (start !== null && start !== undefined && dateOnly(ts) < dateOnly(start)) return false
  if (end !== null && end !== undefined && dateOnly(ts) > dateOnly(end)) return false
  return true
}

/** 项目填报基准日判定（R-11）：日=每天；周=每周指定星期；月=每月最后一天 */
export function isReportAnchorDay(
  ts: number,
  cycle: '日' | '周' | '月' = '周',
  weekday = 5
): boolean {
  const d = new Date(ts)
  if (cycle === '日') return true
  if (cycle === '周') {
    const wd = d.getDay() === 0 ? 7 : d.getDay()
    return wd === weekday
  }
  return d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}
