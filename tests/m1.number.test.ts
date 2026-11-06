import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { ensureCodeUnique, nextCode, withSuffix } from '@/core/services/number'
import { createDoc, softDeleteDoc } from '@/core/db/repo'
import { fmtDate } from '@/shared/date'

let ts = new Date(2026, 10, 6, 10, 0, 0).getTime()

describe('M1-03 编号服务', () => {
  beforeEach(async () => {
    await freshDb('num')
    ts = new Date(2026, 10, 6, 10, 0, 0).getTime()
  })

  it('按 前缀+日期 递增，格式为 PREFIX-YYYYMMDD-0001', async () => {
    const a = await nextCode('QZ', ts)
    const b = await nextCode('QZ', ts)
    expect(a).toBe(`QZ-${fmtDate(ts).replace(/-/g, '')}-0001`)
    expect(b.endsWith('-0002')).toBe(true)
  })

  it('不同前缀独立计数', async () => {
    await nextCode('QZ', ts)
    const ht = await nextCode('HT', ts)
    expect(ht.endsWith('-0001')).toBe(true)
  })

  it('并发 20 次不重复', async () => {
    const codes = await Promise.all(Array.from({ length: 20 }, () => nextCode('YH', ts)))
    expect(new Set(codes).size).toBe(20)
  })

  it('编号唯一性校验包含回收站记录', async () => {
    const row = await createDoc('hazards', { projectId: 'p1', code: 'YH-20261106-0009', status: '待整改' })
    await softDeleteDoc('hazards', row.id)
    expect(await ensureCodeUnique('hazards', 'YH-20261106-0009')).toBe(false)
    expect(await ensureCodeUnique('hazards', 'YH-20261106-0010')).toBe(true)
  })

  it('另存后缀按 -R1 递增', () => {
    expect(withSuffix('QZ-20261106-0007', 1)).toBe('QZ-20261106-0007-R1')
    expect(withSuffix('QZ-20261106-0007', 3)).toBe('QZ-20261106-0007-R3')
  })
})
