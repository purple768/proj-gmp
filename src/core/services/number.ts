import { getDb, settingGet } from '@/core/db/repo'
import { fmtDate } from '@/shared/date'

function ymd(ts: number) {
  return fmtDate(ts).replace(/-/g, '')
}

/** 前缀可在设置页修改，仅影响新单（R-15） */
export async function resolvePrefix(key: string, fallback: string): Promise<string> {
  const v = await settingGet<string>(`prefix:${key}`, fallback)
  return (v || fallback || 'NO').trim()
}

export function buildCode(prefix: string, seq: number, ts = Date.now(), digits = 4): string {
  return `${prefix}-${ymd(ts)}-${String(seq).padStart(digits, '0')}`
}

/** 事务内取号：前缀+日期 维度递增，冲突重试由调用方负责（R-15） */
export async function nextCode(prefix: string, ts = Date.now(), digits = 4): Promise<string> {
  const db = getDb()
  const key = `${prefix}-${ymd(ts)}`
  return await db.transaction('rw', db.numberSequences, async () => {
    const row: any = await db.numberSequences.get(key)
    const seq = Number(row?.seq || 0) + 1
    await db.numberSequences.put({ key, seq })
    return buildCode(prefix, seq, ts, digits)
  })
}

export async function ensureCodeUnique(table: string, code: string, excludeId?: string): Promise<boolean> {
  const db = getDb()
  const rows: any[] = await (db as any)[table].toArray()
  return !rows.some((r) => r.code === code && r.id !== excludeId)
}

/** 允许手改：冲突时抛出可读错误 */
export async function assertCodeAvailable(table: string, code: string, excludeId?: string) {
  if (!code) throw new Error('编号不能为空')
  const ok = await ensureCodeUnique(table, code, excludeId)
  if (!ok) throw new Error(`编号 ${code} 已被占用，请更换`)
}

/** 导入另存用的后缀编号（R-08） */
export function withSuffix(code: string, n: number): string {
  return `${code}-R${n}`
}
