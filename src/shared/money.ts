/** 金额一律用"分"的整数参与运算，避免 0.1+0.2 类浮点误差 */
export function toCents(v: any): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

export function fromCents(c: number): number {
  return Math.round(c) / 100
}

export function round2(v: any): number {
  return fromCents(toCents(v))
}

export function roundTo(v: any, digits: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  const f = Math.pow(10, digits)
  return Math.round(n * f) / f
}

export function addMoney(a: any, b: any): number {
  return fromCents(toCents(a) + toCents(b))
}

export function subMoney(a: any, b: any): number {
  return fromCents(toCents(a) - toCents(b))
}

/** 数量 × 单价 → 金额（2 位），先按分计算一次取整 */
export function multiplyMoney(qty: any, price: any): number {
  const q = Number(qty) || 0
  const p = Number(price) || 0
  return fromCents(Math.round(q * toCents(p)))
}

export function sumMoney(arr: any[]): number {
  return fromCents(arr.reduce((s, v) => s + toCents(v), 0))
}

export function formatMoney(v: any): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0.00'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatQty(v: any): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return String(roundTo(n, 3))
}

/** 千分位（无小数）*/
export function formatInt(v: any): string {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0'
  return Math.round(n).toLocaleString('zh-CN')
}
