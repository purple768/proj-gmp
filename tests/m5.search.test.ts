import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb, makeFile } from './helpers'
import { createDoc } from '@/core/db/repo'
import { addAttachment } from '@/core/services/attachment'
import { buildIndex, highlight, searchIndex, termsOf } from '@/core/services/search'
import { dayDiff } from '@/shared/date'

const D = 86400000

async function seed() {
  const p1 = await createDoc('projects', { code: 'XM-1', name: '滨江路改造', status: '在建', planStart: Date.now() })
  const p2 = await createDoc('projects', { code: 'XM-2', name: '第二实验楼', status: '在建', planStart: Date.now() })
  const w1 = await createDoc('wbs', { projectId: p1.id, code: '1.2', name: '水稳基层', planStart: Date.now(), enabled: true })
  const h1 = await createDoc('hazards', {
    projectId: p1.id,
    wbsId: w1.id,
    code: 'YH-20261106-0001',
    level: '重大',
    location: 'K1+200',
    desc: '临边防护缺失，夜间照明不足',
    requirement: '立即增设防护栏杆',
    deadline: Date.now(),
    status: '待整改'
  })
  await createDoc('visas', {
    projectId: p1.id,
    code: 'QZ-20261106-0007',
    reason: '地下障碍物清除',
    content: '废弃管线清除并外运',
    confirmStatus: '已确认'
  })
  await createDoc('hazards', {
    projectId: p2.id,
    code: 'YH-20261106-0002',
    level: '一般',
    location: '二层临边',
    desc: '安全网破损',
    requirement: '更换安全网',
    deadline: Date.now(),
    status: '待整改'
  })
  await addAttachment('hazard', h1.id, makeFile('现场照片', '临边防护照片.jpg'), '临边防护照片.jpg')
  return { p1, p2, h1 }
}

describe('M5-01 / R-18 全局搜索（AC-20~24）', () => {
  beforeEach(async () => {
    await freshDb('search')
  })

  it('多词为 AND 关系', async () => {
    await seed()
    const index = await buildIndex()
    expect(searchIndex(index, '临边 防护').length).toBeGreaterThan(0)
    expect(searchIndex(index, '临边 沥青').length).toBe(0)
  })

  it('命中编号的排序高于命中正文', async () => {
    await seed()
    const index = await buildIndex()
    const hits = searchIndex(index, 'YH-20261106-0001')
    expect(hits[0].code).toBe('YH-20261106-0001')
    expect(hits[0].score).toBeGreaterThan(0)
  })

  it('项目名与 WBS 名称可被搜索到', async () => {
    await seed()
    const index = await buildIndex()
    expect(searchIndex(index, '滨江路').length).toBeGreaterThan(0)
    expect(searchIndex(index, '水稳').length).toBeGreaterThan(0)
  })

  it('单据类型名可被搜索（输入"隐患"能命中隐患单）', async () => {
    await seed()
    const index = await buildIndex()
    const hits = searchIndex(index, '隐患')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.every((h) => h.docType === 'hazard')).toBe(true)
  })

  it('附件文件名进入索引', async () => {
    await seed()
    const index = await buildIndex()
    const hits = searchIndex(index, '临边防护照片')
    expect(hits.length).toBe(1)
    expect(hits[0].code).toBe('YH-20261106-0001')
  })

  it('按项目与类型二次筛选不重新检索', async () => {
    const { p1, p2 } = await seed()
    const index = await buildIndex()
    const all = searchIndex(index, '临边')
    expect(new Set(all.map((h) => h.projectId)).size).toBe(2)
    const onlyP1 = searchIndex(index, '临边', { projectId: p1.id })
    expect(onlyP1.every((h) => h.projectId === p1.id)).toBe(true)
    const onlyHazard = searchIndex(index, '临边', { docTypes: ['visa'] })
    expect(onlyHazard.length).toBe(0)
    void p2
  })

  it('日期区间过滤含首尾日', async () => {
    await seed()
    const index = await buildIndex()
    const today = Date.now()
    const inRange = searchIndex(index, '隐患', { from: today - D, to: today + D })
    const outRange = searchIndex(index, '隐患', { from: today + 5 * D, to: today + 9 * D })
    expect(inRange.length).toBeGreaterThan(0)
    expect(outRange.length).toBe(0)
  })

  it('摘要截取命中词前后各 30 字并高亮', async () => {
    const { h1 } = await seed()
    const index = await buildIndex()
    const hit = searchIndex(index, '照明').find((h) => h.docId === h1.id)!
    expect(hit.snippet).toContain('照明')
    expect(hit.snippet.length).toBeLessThanOrEqual(63)
    const html = highlight('临边防护缺失', '防护')
    expect(html).toContain('<mark>防护</mark>')
  })

  it('搜索词解析忽略多余空格', () => {
    expect(termsOf('  临边   防护  ')).toEqual(['临边', '防护'])
  })

  it('索引 5 万条时单次查询可控（性能基线）', async () => {
    const big: any[] = []
    for (let i = 0; i < 50000; i++) {
      big.push({
        key: `hazard:${i}`,
        docType: 'hazard',
        docId: String(i),
        projectId: 'p1',
        code: `YH-${String(i).padStart(6, '0')}`,
        title: `隐患记录 ${i}`,
        text: `隐患排查复查 | 隐患记录 ${i} | 现场临边防护缺失 ${i % 97} | 项目A`,
        date: Date.now() - (i % 300) * D
      })
    }
    const t0 = performance.now()
    const hits = searchIndex(big, '临边 防护')
    const cost = performance.now() - t0
    expect(hits.length).toBeGreaterThan(0)
    expect(cost).toBeLessThan(300)
    void dayDiff
  })
})
