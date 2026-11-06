import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb, makeFile } from './helpers'
import {
  addAttachment,
  attachmentStats,
  bindTempAttachments,
  currentBackend,
  discardTempAttachments,
  initStorage,
  listAttachments,
  readAttachment,
  releaseAttachment
} from '@/core/services/attachment'
import { softDeleteDoc, createDoc } from '@/core/db/repo'

describe('M0-02 / M1-06 附件服务（AC-08/09/10/11）', () => {
  beforeEach(async () => {
    await freshDb('att')
    await initStorage()
  })

  it('无目录授权时自动降级到内置存储', () => {
    expect(currentBackend()).toBe('idb')
  })

  it('写入 3MB 文件后可读回，字节数一致', async () => {
    const content = new Uint8Array(3 * 1024 * 1024).fill(7)
    const file = new Blob([content])
    const row = await addAttachment('hazard', 'doc-1', file, 'big.bin')
    expect(row.size).toBe(content.length)
    const blob = await readAttachment(row as any)
    expect(blob).toBeTruthy()
    expect(blob!.size).toBe(content.length)
  })

  it('相同内容按 sha256 去重：同一物理文件只写一次，引用计数 +1', async () => {
    const f1 = makeFile('same-content-abc', 'a.txt')
    const f2 = makeFile('same-content-abc', 'b.txt')
    const a = await addAttachment('hazard', 'doc-1', f1, 'a.txt')
    const b = await addAttachment('hazard', 'doc-2', f2, 'b.txt')
    expect(a.relPath).toBe(b.relPath)
    expect(a.hash).toBe(b.hash)
    const all = await (await import('@/core/db/repo')).tbl('attachments').toArray()
    expect(all.length).toBe(2)
    expect(all.some((x: any) => x.refCount === 2)).toBe(true)
  })

  it('释放其中一个引用后文件仍可读；全部释放后文件被删除（R-07）', async () => {
    const f1 = makeFile('shared-photo-bytes', 'p.jpg')
    const a = await addAttachment('hazard', 'd1', f1, 'p.jpg')
    const b = await addAttachment('defect', 'd2', f1, 'p2.jpg')
    await releaseAttachment(a.id)
    expect(await readAttachment(b as any)).toBeTruthy()
    await releaseAttachment(b.id)
    const all = await (await import('@/core/db/repo')).tbl('attachments').toArray()
    expect(all.every((x: any) => x.state === 'deleted')).toBe(true)
    const blobs = await (await import('@/core/db/repo')).tbl('fileBlobs').toArray()
    expect(blobs.length).toBe(0)
  })

  it('临时附件：取消表单后丢弃，保存后绑定到单据（AC-05）', async () => {
    const tempId = 'temp-1'
    await addAttachment('hazard', tempId, makeFile('tmp-a', 'a.txt'), 'a.txt', 'temp')
    await addAttachment('hazard', tempId, makeFile('tmp-b', 'b.txt'), 'b.txt', 'temp')
    expect((await listAttachments('hazard', tempId)).length).toBe(2)
    await bindTempAttachments('hazard', tempId, 'real-1')
    expect((await listAttachments('hazard', 'real-1')).length).toBe(2)

    await addAttachment('hazard', 'temp-2', makeFile('tmp-c', 'c.txt'), 'c.txt', 'temp')
    await discardTempAttachments('hazard', 'temp-2')
    expect((await listAttachments('hazard', 'temp-2')).length).toBe(0)
  })

  it('统计已用空间不含已删除文件', async () => {
    const a = await addAttachment('hazard', 'd1', makeFile('abcdefghij', 'x.txt'), 'x.txt')
    const before = await attachmentStats()
    expect(before.used).toBeGreaterThan(0)
    await releaseAttachment(a.id)
    const after = await attachmentStats()
    expect(after.used).toBe(0)
  })

  it('软删单据不影响物理文件（回收站可预览）', async () => {
    const doc = await createDoc('hazards', { projectId: 'p', code: 'YH-1', status: '待整改' })
    const att = await addAttachment('hazard', doc.id, makeFile('keepme', 'k.txt'), 'k.txt')
    await softDeleteDoc('hazards', doc.id)
    expect(await readAttachment(att as any)).toBeTruthy()
  })
})
