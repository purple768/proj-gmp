import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb, makeFile } from './helpers'
import { allDocs, createDoc, getDoc, tbl } from '@/core/db/repo'
import { exportBackup, importBackup } from '@/core/services/backup'
import { addAttachment, readAttachment } from '@/core/services/attachment'
import { ensureCodeUnique } from '@/core/services/number'

describe('M5-07/08 / R-08 备份导出与导入恢复（AC-35~39）', () => {
  beforeEach(async () => {
    await freshDb('backup')
  })

  it('导出包含 manifest、数据表与附件字节', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const h = await createDoc('hazards', { projectId: p.id, code: 'YH-1', status: '待整改' })
    await addAttachment('hazard', h.id, makeFile('attachment-content-xyz', 'photo.jpg'), 'photo.jpg')

    const { bytes, stats } = await exportBackup()
    expect(bytes.length).toBeGreaterThan(50)
    expect(stats.rows).toBeGreaterThan(1)
    expect(stats.attachments).toBe(1)

    const { unzipSync, strFromU8 } = await import('fflate')
    const files = unzipSync(bytes)
    expect(files['manifest.json']).toBeTruthy()
    expect(files['data/projects.json']).toBeTruthy()
    expect(files['data/hazards.json']).toBeTruthy()
    const manifest = JSON.parse(strFromU8(files['manifest.json']))
    expect(manifest.version).toBe(1)
    expect(manifest.attachments).toBe(1)
    const hasFile = Object.keys(files).some((k) => k.startsWith('files/attachments/'))
    expect(hasFile).toBe(true)
  })

  it('导出的包能完整导入空库，数据与附件一致', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const h = await createDoc('hazards', { projectId: p.id, code: 'YH-1', status: '待整改', location: 'K1' })
    const att = await addAttachment('hazard', h.id, makeFile('bytes-to-restore', 'a.txt'), 'a.txt')
    const { bytes } = await exportBackup()

    await freshDb('restore')
    const { report } = await importBackup(bytes, 'skip')
    expect(report.failed.length).toBe(0)
    expect(report.added).toBeGreaterThan(0)

    const projects = await allDocs('projects')
    expect(projects.length).toBe(1)
    const hazards = await allDocs('hazards')
    expect(hazards.length).toBe(1)
    expect(hazards[0].location).toBe('K1')

    const atts: any[] = await tbl('attachments').toArray()
    expect(atts.length).toBe(1)
    const blob = await readAttachment(atts[0])
    expect(blob).toBeTruthy()
    expect(await blob!.text()).toBe('bytes-to-restore')
    void att
  })

  it('冲突策略 skip：不新增也不覆盖', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await createDoc('hazards', { projectId: p.id, code: 'YH-1', status: '待整改', location: '原值' })
    const { bytes } = await exportBackup()

    await freshDb('conflict-skip')
    const p2 = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await createDoc('hazards', { projectId: p2.id, code: 'YH-1', status: '待整改', location: '现有值' })
    const { report } = await importBackup(bytes, 'skip')
    expect(report.skipped).toBeGreaterThan(0)
    const hazards = await allDocs('hazards')
    expect(hazards.length).toBe(1)
    expect(hazards[0].location).toBe('现有值')
  })

  it('冲突策略 overwrite：保留本地 id 覆盖内容', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await createDoc('hazards', { projectId: p.id, code: 'YH-1', status: '待整改', location: '备份值' })
    const { bytes } = await exportBackup()

    await freshDb('conflict-over')
    const p2 = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const local = await createDoc('hazards', { projectId: p2.id, code: 'YH-1', status: '待整改', location: '现有值' })
    const { report } = await importBackup(bytes, 'overwrite')
    expect(report.overwritten).toBeGreaterThan(0)
    const haz = await getDoc('hazards', local.id)
    expect(haz.location).toBe('备份值')
  })

  it('冲突策略 rename：编号加 -R1，且子节点与单据引用一并迁移（R-08）', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const wbs = await createDoc('wbs', { projectId: p.id, parentId: null, code: '1', name: '道路', planStart: Date.now(), enabled: true })
    await createDoc('hazards', { projectId: p.id, wbsId: wbs.id, code: 'YH-1', status: '待整改' })
    const { bytes } = await exportBackup()

    await freshDb('conflict-rename')
    const p2 = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    await createDoc('wbs', { projectId: p2.id, parentId: null, code: '1', name: '本地道路', planStart: Date.now(), enabled: true })

    const { report } = await importBackup(bytes, 'rename')
    expect(report.renamed).toBeGreaterThan(0)

    // 项目编号冲突另存后，其下 WBS 与单据应一并挂到新项目
    const wbsRows = await allDocs('wbs')
    const renamed = wbsRows.find((w) => String(w.code).includes('-R'))
    expect(renamed).toBeTruthy()
    expect(await ensureCodeUnique('wbs', '1')).toBe(false)

    const importedProject = (await allDocs('projects')).find((x) => String(x.code).includes('-R'))
    expect(importedProject).toBeTruthy()
    expect(renamed!.projectId).toBe(importedProject!.id)

    const hazards = await allDocs('hazards')
    const importedHazard = hazards.find((h) => String(h.code).includes('YH-1') && h.projectId === importedProject!.id)
    expect(importedHazard).toBeTruthy()
    expect(importedHazard!.wbsId).toBe(renamed!.id)
    void p2
  })

  it('备份包版本高于程序时拒绝导入', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const bytes = zipSync({
      'manifest.json': strToU8(JSON.stringify({ version: 99 })),
      'data/projects.json': strToU8('[]')
    })
    await expect(importBackup(bytes, 'skip')).rejects.toThrow(/版本/)
  })

  it('缺少 manifest 时给出明确错误', async () => {
    const { zipSync, strToU8 } = await import('fflate')
    const bytes = zipSync({ 'data/projects.json': strToU8('[]') })
    await expect(importBackup(bytes, 'skip')).rejects.toThrow(/manifest/)
  })

  it('导出可中断/流式：回调收到进度', async () => {
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    void p
    const stages: string[] = []
    const chunks: Uint8Array[] = []
    const { stats } = await exportBackup(
      (prog) => stages.push(prog.stage),
      { write: (c) => { chunks.push(c) } }
    )
    expect(stages.length).toBeGreaterThan(0)
    expect(stats.bytes).toBeGreaterThan(0)
    expect(chunks.length).toBeGreaterThan(0)
  })
})
