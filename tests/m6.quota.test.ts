import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { freshDb, makeFile } from './helpers'
import { addAttachment, checkQuota, classifyWriteError, currentBackend, initStorage } from '@/core/services/attachment'

/** 把 navigator.storage.estimate 换成固定配额（Node 环境没有真的 storage） */
function stubQuota(quota: number) {
  vi.stubGlobal('navigator', {
    storage: {
      estimate: async () => ({ quota, usage: 0 })
    }
  })
}

const MB = 1024 * 1024

describe('R-06 附件配额分级与写入失败文案', () => {
  beforeEach(async () => {
    await freshDb('quota')
    stubQuota(0)
    await initStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('取不到配额时不阻断（兼容不支持 estimate 的浏览器）', async () => {
    stubQuota(0)
    const r = await checkQuota(50 * MB)
    expect(r.ok).toBe(true)
    expect(r.level).toBe('ok')
    expect(r.quota).toBe(0)
  })

  it('低于 80% 正常放行', async () => {
    stubQuota(1000 * MB)
    const r = await checkQuota(1 * MB)
    expect(r.ok).toBe(true)
    expect(r.level).toBe('ok')
    expect(r.ratio).toBeLessThan(0.8)
  })

  it('达到 80% 起黄条提醒但不阻断', async () => {
    stubQuota(1000)
    await addAttachment('hazard', 'd1', makeFile('x'.repeat(800), 'a.txt'), 'a.txt')
    const r = await checkQuota(10)
    expect(r.level).toBe('warn')
    expect(r.ok).toBe(true)
    // 文案里的百分比是真实比例，便于用户判断还剩多少
    expect(r.message).toContain('81%')
    expect(r.message).toContain('清理')
  })

  it('达到 95% 且文件 >10MB 时拦截大文件（内置存储模式）', async () => {
    expect(currentBackend()).toBe('idb')
    stubQuota(1)
    const r = await checkQuota(11 * MB)
    expect(r.ok).toBe(false)
    expect(r.level).toBe('block')
    expect(r.message).toContain('容量')
  })

  it('达到 95% 但文件很小时只警告，不拦小文件', async () => {
    stubQuota(1)
    const r = await checkQuota(100)
    expect(r.ok).toBe(true)
    expect(r.level).toBe('warn')
    expect(r.message).toContain('容量已达')
  })

  it('写入失败按原因分三种文案', () => {
    expect(classifyWriteError({ name: 'QuotaExceededError' })).toContain('容量不足')
    expect(classifyWriteError({ name: 'NotAllowedError' })).toContain('授权')
    expect(classifyWriteError({ name: 'NotReadableError' })).toContain('占用')
    expect(classifyWriteError({ name: 'InvalidStateError' })).toContain('占用')
    expect(classifyWriteError(new Error('磁盘只读'))).toBe('磁盘只读')
  })
})
