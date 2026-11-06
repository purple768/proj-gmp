import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { createDoc, softDeleteDoc } from '@/core/db/repo'
import { assertWbsDeletable, buildTree, descendantIds, flattenTree, setWbsEnabled, wbsPath } from '@/core/services/wbs'

async function seedTree() {
  const p = await createDoc('projects', { code: 'XM-1', name: '项目一', status: '在建', planStart: Date.now() })
  const root = await createDoc('wbs', { projectId: p.id, parentId: null, code: '1', name: '道路', planStart: Date.now(), enabled: true })
  const a = await createDoc('wbs', { projectId: p.id, parentId: root.id, code: '1.1', name: '路基', planStart: Date.now(), enabled: true })
  const b = await createDoc('wbs', { projectId: p.id, parentId: root.id, code: '1.2', name: '基层', planStart: Date.now(), enabled: true })
  return { p, root, a, b }
}

describe('M2-02 WBS 树与删除保护（R-05）', () => {
  beforeEach(async () => {
    await freshDb('wbs')
  })

  it('按 parentId 建树并计算层级', async () => {
    const { root } = await seedTree()
    const rows = await (await import('@/core/db/repo')).allDocs('wbs', 'x')
    const all = await (await import('@/core/db/repo')).tbl('wbs').toArray()
    const tree = buildTree(all)
    expect(tree.length).toBe(1)
    expect(tree[0].id).toBe(root.id)
    expect(tree[0].children.length).toBe(2)
    expect(flattenTree(tree).map((n) => n.level)).toEqual([0, 1, 1])
  })

  it('descendantIds 返回全部后代', async () => {
    const { root, a } = await seedTree()
    const all = await (await import('@/core/db/repo')).tbl('wbs').toArray()
    const ids = descendantIds(root.id, all)
    expect(ids).toContain(a.id)
    expect(ids.length).toBe(2)
  })

  it('有子节点时禁止删除，并给出子节点条数', async () => {
    const { p, root } = await seedTree()
    const res = await assertWbsDeletable(root.id, p.id)
    expect(res.ok).toBe(false)
    expect(res.blockers[0]).toMatchObject({ table: 'wbs', count: 2 })
  })

  it('被单据引用时禁止删除，并按单据类型给出条数（含回收站）', async () => {
    const { p, a } = await seedTree()
    await createDoc('hazards', { projectId: p.id, wbsId: a.id, code: 'YH-1', status: '待整改' })
    const h2 = await createDoc('hazards', { projectId: p.id, wbsId: a.id, code: 'YH-2', status: '待整改' })
    await softDeleteDoc('hazards', h2.id)
    await createDoc('visas', { projectId: p.id, wbsId: a.id, code: 'QZ-1', confirmStatus: '待确认' })
    const res = await assertWbsDeletable(a.id, p.id)
    expect(res.ok).toBe(false)
    expect(res.blockers.find((b) => b.table === 'hazards')?.count).toBe(2)
    expect(res.blockers.find((b) => b.table === 'visas')?.count).toBe(1)
  })

  it('无子节点无引用允许删除', async () => {
    const { p, b } = await seedTree()
    const res = await assertWbsDeletable(b.id, p.id)
    expect(res.ok).toBe(true)
  })

  it('停用父节点递归停用子节点；启用父节点不自动放开子节点', async () => {
    const { p, root, a, b } = await seedTree()
    await setWbsEnabled(root.id, false, p.id)
    let all = await (await import('@/core/db/repo')).tbl('wbs').toArray()
    expect(all.filter((w: any) => !w.enabled).length).toBe(3)

    await setWbsEnabled(root.id, true, p.id)
    all = await (await import('@/core/db/repo')).tbl('wbs').toArray()
    expect(all.find((w: any) => w.id === root.id).enabled).toBe(true)
    expect(all.find((w: any) => w.id === a.id).enabled).toBe(false)
    expect(all.find((w: any) => w.id === b.id).enabled).toBe(false)
  })

  it('路径拼接可读', async () => {
    const { a } = await seedTree()
    const all = await (await import('@/core/db/repo')).tbl('wbs').toArray()
    expect(wbsPath(all, a.id)).toBe('1 道路 / 1.1 路基')
  })
})
