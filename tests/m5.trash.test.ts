import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb, makeFile } from './helpers'
import { createDoc, getDoc, softDeleteDoc, tbl } from '@/core/db/repo'
import { cleanupExpired, expiringSoon, KEEP_DAYS, listTrash, purgeDoc, restoreDoc_ } from '@/core/services/trash'
import { addAttachment, readAttachment } from '@/core/services/attachment'
import { ensureCodeUnique } from '@/core/services/number'

const D = 86400000

describe('M5-04 / R-07 回收站与物理文件生命周期（AC-28~30）', () => {
  beforeEach(async () => {
    await freshDb('trash')
  })

  it('软删记录出现在回收站，带到期时间 90 天', async () => {
    const row = await createDoc('hazards', { projectId: 'p1', code: 'YH-1', status: '待整改' })
    await softDeleteDoc('hazards', row.id)
    const items = await listTrash()
    expect(items.length).toBe(1)
    expect(items[0].code).toBe('YH-1')
    expect(items[0].expireAt - items[0].deletedAt).toBe(KEEP_DAYS * D)
    expect(items[0].daysLeft).toBeGreaterThanOrEqual(89)
  })

  it('恢复后回到原列表且字段完整', async () => {
    const row = await createDoc('hazards', { projectId: 'p1', code: 'YH-1', status: '待整改', location: 'K1' })
    await softDeleteDoc('hazards', row.id)
    const res = await restoreDoc_('hazards', row.id)
    expect(res.ok).toBe(true)
    const back: any = await getDoc('hazards', row.id)
    expect(back.deletedAt).toBeNull()
    expect(back.location).toBe('K1')
    expect((await listTrash()).length).toBe(0)
  })

  it('恢复时编号被占用则自动改号为 -R1', async () => {
    const oldRow = await createDoc('hazards', { projectId: 'p1', code: 'YH-1', status: '待整改' })
    await softDeleteDoc('hazards', oldRow.id)
    // 新建一条占用同一编号（模拟历史数据）
    await createDoc('hazards', { id: 'other', projectId: 'p1', code: 'YH-1', status: '待整改' })
    // 让占用者 id 与旧记录不同：直接写入
    await tbl('hazards').put({ id: 'other', projectId: 'p1', code: 'YH-1', status: '待整改', deletedAt: null })
    const res = await restoreDoc_('hazards', oldRow.id)
    expect(res.ok).toBe(true)
    expect(res.code).toBe('YH-1-R1')
    expect(await ensureCodeUnique('hazards', 'YH-1-R1', oldRow.id)).toBe(true)
  })

  it('永久删除会释放附件；文件被多条单据引用时不误删', async () => {
    const d1 = await createDoc('hazards', { projectId: 'p1', code: 'YH-1', status: '待整改' })
    const d2 = await createDoc('defects', { projectId: 'p1', code: 'QX-1', checkResult: '待复查' })
    const a1 = await addAttachment('hazard', d1.id, makeFile('shared-bytes', 'p.jpg'), 'p.jpg')
    const a2 = await addAttachment('defect', d2.id, makeFile('shared-bytes', 'p2.jpg'), 'p2.jpg')
    expect(a1.relPath).toBe(a2.relPath)

    await softDeleteDoc('hazards', d1.id)
    await purgeDoc('hazards', d1.id)
    expect(await getDoc('hazards', d1.id)).toBeFalsy()
    expect(await readAttachment(a2 as any)).toBeTruthy()

    await softDeleteDoc('defects', d2.id)
    await purgeDoc('defects', d2.id)
    const blobs = await tbl('fileBlobs').toArray()
    expect(blobs.length).toBe(0)
  })

  it('90 天到期清理：只删到期记录，未到期保留', async () => {
    const oldRow = await createDoc('hazards', { projectId: 'p1', code: 'YH-OLD', status: '待整改' })
    await tbl('hazards').put({ ...(await getDoc('hazards', oldRow.id)), deletedAt: Date.now() - (KEEP_DAYS + 1) * D })
    const newRow = await createDoc('hazards', { projectId: 'p1', code: 'YH-NEW', status: '待整改' })
    await softDeleteDoc('hazards', newRow.id)

    const res = await cleanupExpired()
    expect(res.removed).toBe(1)
    expect(res.failed.length).toBe(0)
    const left = await listTrash()
    expect(left.length).toBe(1)
    expect(left[0].code).toBe('YH-NEW')
  })

  it('剩余 ≤7 天的记录被标记为即将清理', async () => {
    const row = await createDoc('hazards', { projectId: 'p1', code: 'YH-1', status: '待整改' })
    await tbl('hazards').put({ ...(await getDoc('hazards', row.id)), deletedAt: Date.now() - (KEEP_DAYS - 3) * D })
    const soon = expiringSoon(await listTrash())
    expect(soon.length).toBe(1)
    expect(soon[0].daysLeft).toBeLessThanOrEqual(7)
  })

  it('回收站不收纳未删除记录', async () => {
    await createDoc('hazards', { projectId: 'p1', code: 'YH-1', status: '待整改' })
    expect((await listTrash()).length).toBe(0)
  })
})
