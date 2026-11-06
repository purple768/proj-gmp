import { getDb, settingGet, settingSet } from '@/core/db/repo'
import { uid } from '@/shared/id'

export type StorageBackend = 'dir' | 'opfs' | 'idb'

export interface AttachmentRow {
  id: string
  docType: string
  docId: string
  fileName: string
  ext: string
  size: number
  hash: string
  relPath: string
  state: 'active' | 'temp' | 'pending-trash' | 'deleted'
  refCount: number
  createdAt: number
  deletedAt: number | null
}

const DIR_KEY = 'attachDir'
let dirHandle: any = null
let backend: StorageBackend = 'idb'

export function currentBackend(): StorageBackend {
  return backend
}

export function storageSupported(): { dir: boolean; opfs: boolean } {
  const g: any = globalThis
  return {
    dir: typeof g.showDirectoryPicker === 'function',
    opfs: !!(g.navigator?.storage?.getDirectory)
  }
}

/** 恢复已授权目录（句柄存 settings），失败则降级 */
export async function initStorage(): Promise<StorageBackend> {
  const g: any = globalThis
  try {
    const saved = await settingGet<any>(DIR_KEY, null)
    if (saved && typeof g.showDirectoryPicker === 'function') {
      const perm = await saved.queryPermission?.({ mode: 'readwrite' })
      if (perm === 'granted') {
        dirHandle = saved
        backend = 'dir'
        return backend
      }
      dirHandle = saved
      backend = 'opfs'
      return backend
    }
  } catch {
    /* ignore */
  }
  if (g.navigator?.storage?.getDirectory) backend = 'opfs'
  else backend = 'idb'
  return backend
}

export async function pickDirectory(): Promise<boolean> {
  const g: any = globalThis
  if (typeof g.showDirectoryPicker !== 'function') throw new Error('当前浏览器不支持选择本地文件夹，已使用浏览器存储')
  const handle = await g.showDirectoryPicker({ mode: 'readwrite', id: 'gmp-data' })
  dirHandle = handle
  backend = 'dir'
  await settingSet(DIR_KEY, handle)
  return true
}

export async function reauthorize(): Promise<boolean> {
  if (!dirHandle?.requestPermission) return false
  const perm = await dirHandle.requestPermission({ mode: 'readwrite' })
  if (perm === 'granted') {
    backend = 'dir'
    return true
  }
  return false
}

export function dirAuthorized(): boolean {
  return backend === 'dir'
}

async function getOpfsRoot() {
  const g: any = globalThis
  if (!g.navigator?.storage?.getDirectory) return null
  return await g.navigator.storage.getDirectory()
}

async function ensureDir(path: string) {
  if (backend === 'dir' && dirHandle) {
    const parts = path.split('/').filter(Boolean)
    let cur = dirHandle
    for (const p of parts) cur = await cur.getDirectoryHandle(p, { create: true })
    return cur
  }
  return null
}

async function sha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer()
  const sub = (globalThis as any).crypto?.subtle
  if (!sub) {
    let h = 0
    const view = new Uint8Array(buf)
    for (let i = 0; i < view.length; i++) h = ((h << 5) - h + view[i]) | 0
    return 'h' + (h >>> 0).toString(16) + '-' + blob.size
  }
  const digest = await sub.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * 写入失败统一分类（R-06）：容量不足 / 授权失效 / 文件被占用 三种文案分开，
 * 用户看到的提示要能直接指出下一步该做什么。
 */
export function classifyWriteError(e: any): string {
  const name = String(e?.name || '')
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return '存储容量不足，请清理回收站或更换数据目录后重试'
  if (name === 'NotAllowedError' || name === 'SecurityError') return '数据目录授权已失效，请到设置页重新授权后重试'
  if (name === 'NoModificationAllowedError' || name === 'InvalidStateError' || name === 'NotReadableError') return '文件正被其他程序占用，请关闭该文件后重试'
  return e?.message || '附件写入失败'
}

async function writeBytes(relPath: string, blob: Blob) {
  const slash = relPath.lastIndexOf('/')
  const dir = relPath.slice(0, slash)
  const name = relPath.slice(slash + 1)
  if (backend === 'dir' && dirHandle) {
    try {
      const target = await ensureDir(dir)
      const fh = await target.getFileHandle(name, { create: true })
      const w = await fh.createWritable()
      await w.write(blob)
      await w.close()
      return
    } catch (e: any) {
      // 授权失效：尝试重新授权一次再重试，仍失败则给出明确文案
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
        if (await reauthorize()) {
          const target = await ensureDir(dir)
          const fh = await target.getFileHandle(name, { create: true })
          const w = await fh.createWritable()
          await w.write(blob)
          await w.close()
          return
        }
      }
      throw new Error(classifyWriteError(e))
    }
  }
  if (backend === 'opfs') {
    const root = await getOpfsRoot()
    if (root) {
      try {
        const target = await ensureDir(dir)
        if (target) {
          const fh = await target.getFileHandle(name, { create: true })
          const w = await fh.createWritable()
          await w.write(blob)
          await w.close()
          return
        }
      } catch (e: any) {
        throw new Error(classifyWriteError(e))
      }
    }
  }
  // idb 兜底：整包存 Blob
  try {
    await getDb().fileBlobs.put({ id: relPath, hash: relPath, blob })
  } catch (e: any) {
    throw new Error(classifyWriteError(e))
  }
}

async function readBytes(relPath: string): Promise<Blob | null> {
  try {
    if (backend === 'dir' && dirHandle) {
      const slash = relPath.lastIndexOf('/')
      const dir = await ensureDir(relPath.slice(0, slash))
      if (!dir) return null
      const fh = await dir.getFileHandle(relPath.slice(slash + 1))
      return await fh.getFile()
    }
    if (backend === 'opfs') {
      const root = await getOpfsRoot()
      if (root) {
        const slash = relPath.lastIndexOf('/')
        let cur: any = root
        for (const p of relPath.slice(0, slash).split('/').filter(Boolean)) {
          cur = await cur.getDirectoryHandle(p)
        }
        const fh = await cur.getFileHandle(relPath.slice(slash + 1))
        return await fh.getFile()
      }
    }
  } catch {
    return null
  }
  const row: any = await getDb().fileBlobs.get(relPath)
  return row?.blob || null
}

export async function deleteBytes(relPath: string) {
  try {
    if (backend === 'dir' && dirHandle) {
      const slash = relPath.lastIndexOf('/')
      const dir = await ensureDir(relPath.slice(0, slash))
      await dir?.removeEntry(relPath.slice(slash + 1))
      return
    }
    if (backend === 'opfs') {
      const root = await getOpfsRoot()
      if (root) {
        const slash = relPath.lastIndexOf('/')
        let cur: any = root
        for (const p of relPath.slice(0, slash).split('/').filter(Boolean)) {
          cur = await cur.getDirectoryHandle(p)
        }
        await cur.removeEntry(relPath.slice(slash + 1))
        return
      }
    }
  } catch {
    /* 文件不存在视为成功 */
  }
  await getDb().fileBlobs.delete(relPath)
}

export async function restoreFile(relPath: string, data: Uint8Array) {
  await writeBytes(relPath, new Blob([data as any]))
}

export async function readAttachment(att: AttachmentRow): Promise<Blob | null> {
  return await readBytes(att.relPath)
}

export async function attachmentUrl(att: AttachmentRow): Promise<string | null> {
  const blob = await readBytes(att.relPath)
  if (!blob) return null
  return URL.createObjectURL(blob)
}

/** 上传：按 sha256 去重，重复文件只落一份，引用计数 +1 */
export async function addAttachment(
  docType: string,
  docId: string,
  file: File | Blob,
  fileName?: string,
  state: 'active' | 'temp' = 'active'
): Promise<AttachmentRow> {
  const db = getDb()
  const name = fileName || (file as File).name || 'file.bin'
  const hash = await sha256(file)
  const exist: any[] = await db.attachments.where('hash').equals(hash).toArray()
  const alive = exist.find((a) => a.state === 'active')
  if (alive) {
    const row: AttachmentRow = {
      id: uid(),
      docType,
      docId,
      fileName: name,
      ext: name.split('.').pop()?.toLowerCase() || '',
      size: file.size,
      hash,
      relPath: alive.relPath,
      state,
      refCount: 0,
      createdAt: Date.now(),
      deletedAt: null
    }
    await db.attachments.put(row)
    await db.attachments.update(alive.id, { refCount: (alive.refCount || 1) + 1 })
    return row
  }
  const month = new Date().toISOString().slice(0, 7).replace('-', '')
  const relPath = `attachments/${month}/${hash.slice(0, 8)}_${uid()}_${name.replace(/[\\/:*?"<>|]/g, '_')}`
  await writeBytes(relPath, file)
  const row: AttachmentRow = {
    id: uid(),
    docType,
    docId,
    fileName: name,
    ext: name.split('.').pop()?.toLowerCase() || '',
    size: file.size,
    hash,
    relPath,
    state,
    refCount: 1,
    createdAt: Date.now(),
    deletedAt: null
  }
  await db.attachments.put(row)
  return row
}

export async function listAttachments(docType: string, docId: string): Promise<AttachmentRow[]> {
  const db = getDb()
  const rows: any[] = await db.attachments.where('[docType+docId]').equals([docType, docId]).toArray()
  return rows.filter((r) => r.state === 'active' || r.state === 'temp')
}

export async function bindTempAttachments(docType: string, tempId: string, docId: string) {
  const db = getDb()
  const rows: any[] = await db.attachments.where('[docType+docId]').equals([docType, tempId]).toArray()
  for (const r of rows) await db.attachments.update(r.id, { docId, state: 'active' })
}

export async function discardTempAttachments(docType: string, tempId: string) {
  const db = getDb()
  const rows: any[] = await db.attachments.where('[docType+docId]').equals([docType, tempId]).toArray()
  for (const r of rows) await releaseAttachment(r.id)
}

/** 释放引用：计数归零才删物理文件（R-07） */
export async function releaseAttachment(id: string) {
  const db = getDb()
  const row: any = await db.attachments.get(id)
  if (!row) return
  const same: any[] = await db.attachments.where('hash').equals(row.hash).toArray()
  const others = same.filter((a) => a.id !== id && a.state !== 'deleted')
  if (others.length === 0) {
    await deleteBytes(row.relPath)
    for (const a of same) await db.attachments.update(a.id, { state: 'deleted', deletedAt: Date.now(), refCount: 0 })
  } else {
    await db.attachments.update(id, { state: 'deleted', deletedAt: Date.now() })
    const alive = others.filter((a) => a.state === 'active')
    if (alive.length) await db.attachments.update(alive[0].id, { refCount: alive.reduce((s, a) => s + (a.refCount || 1), 0) })
  }
}

export async function releaseDocAttachments(docType: string, docId: string) {
  const db = getDb()
  const rows: any[] = await db.attachments.where('[docType+docId]').equals([docType, docId]).toArray()
  for (const r of rows) await releaseAttachment(r.id)
}

export async function attachmentStats() {
  const db = getDb()
  const rows: any[] = await db.attachments.toArray()
  const alive = rows.filter((r) => r.state === 'active' || r.state === 'temp')
  const uniq = new Map<string, number>()
  for (const r of alive) uniq.set(r.hash, r.size)
  let used = 0
  for (const s of uniq.values()) used += s
  let quota = 0
  try {
    const g: any = globalThis
    const est = await g.navigator?.storage?.estimate?.()
    quota = est?.quota || 0
  } catch {
    /* ignore */
  }
  return { count: alive.length, used, quota, backend }
}

export interface QuotaCheck {
  ok: boolean
  level: 'ok' | 'warn' | 'block'
  ratio: number
  used: number
  quota: number
  message?: string
}

/**
 * 配额检查（R-06）：
 * - 80% 起黄条提醒（不阻断），95% 且单个文件 > 10MB 直接拦；
 * - 目录授权模式下配额来自浏览器 estimate，只作参考，不阻断大文件（用户可自己腾磁盘）。
 */
export async function checkQuota(fileSize: number): Promise<QuotaCheck> {
  const stats = await attachmentStats()
  const quota = stats.quota || 0
  const ratio = quota > 0 ? (stats.used + fileSize) / quota : 0
  const base: QuotaCheck = { ok: true, level: 'ok', ratio, used: stats.used, quota }

  if (quota <= 0) return base

  if (ratio >= 0.95) {
    if (backend !== 'dir' && fileSize > 10 * 1024 * 1024) {
      return { ...base, ok: false, level: 'block', message: '存储容量即将用尽（>' + Math.round(ratio * 100) + '%），请清理回收站或改用本地文件夹模式' }
    }
    return { ...base, level: 'warn', message: '存储容量已达 ' + Math.round(ratio * 100) + '%，建议尽快清理回收站或更换数据目录' }
  }
  if (ratio >= 0.8) {
    return { ...base, level: 'warn', message: '存储容量已用 ' + Math.round(ratio * 100) + '%，请注意清理' }
  }
  return base
}
