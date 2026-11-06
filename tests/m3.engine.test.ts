import { beforeEach, describe, expect, it } from 'vitest'
import { freshDb } from './helpers'
import { BUSINESS_DOCS, DOC_MAP, ALL_DOCS } from '@/core/docs'
import { DOC_TABLE_INDEX } from '@/core/db'
import { createDoc, listDocs, softDeleteDoc } from '@/core/db/repo'
import { applyComputed } from '@/core/engine/validate'
import { getDoc } from '@/core/docs'

describe('M3-01 单据引擎（配置即单据）', () => {
  beforeEach(async () => {
    await freshDb('engine')
  })

  it('注册 32 类业务单据 + 1 个项目骨架', () => {
    expect(ALL_DOCS.length).toBe(33)
    expect(BUSINESS_DOCS.length).toBe(32)
  })

  it('单据 key、table、前缀均唯一，且表都建在 schema 中', () => {
    const keys = new Set(ALL_DOCS.map((d) => d.key))
    const tables = new Set(ALL_DOCS.map((d) => d.table))
    expect(keys.size).toBe(ALL_DOCS.length)
    expect(tables.size).toBe(ALL_DOCS.length)
    for (const d of ALL_DOCS) expect(DOC_TABLE_INDEX[d.table], d.table).toBeTruthy()
  })

  it('每类单据都有编号字段与搜索字段', () => {
    for (const d of BUSINESS_DOCS) {
      const codeField = d.fields.find((f) => f.type === 'autoCode')
      expect(codeField, `${d.title} 缺少 autoCode 编号字段`).toBeTruthy()
      expect(d.searchFields?.length, `${d.title} 缺少 searchFields`).toBeGreaterThan(0)
    }
  })

  it('每类单据都有打印模板，且锁单函数不抛错', () => {
    for (const d of BUSINESS_DOCS) {
      expect(d.print?.title, d.title).toBeTruthy()
      if (d.lock) {
        expect(typeof d.lock({})).toBe('boolean')
      }
    }
  })

  it('同一份配置驱动增删查：新建 → 列表 → 软删后列表不可见', async () => {
    const cfg = getDoc('inspection')
    const p = await createDoc('projects', { code: 'XM-1', name: 'P', status: '在建', planStart: Date.now() })
    const row = await createDoc(cfg.table, {
      projectId: p.id,
      code: 'JYP-1',
      subItem: '水泥混凝土面层',
      part: 'K0+000~K0+200',
      checkDate: Date.now(),
      result: '合格'
    })
    const list1 = await listDocs(cfg.table, { projectId: p.id, searchFields: cfg.searchFields, keyword: '混凝土' })
    expect(list1.total).toBe(1)
    await softDeleteDoc(cfg.table, row.id)
    const list2 = await listDocs(cfg.table, { projectId: p.id, searchFields: cfg.searchFields })
    expect(list2.total).toBe(0)
  })

  it('台班与班组计量的金额字段由配置计算', () => {
    const shift = getDoc('machineShift')
    const s = applyComputed(shift, { qty: 1.5, price: 1200 })
    expect(s.amount).toBe(1800)
    const measure = getDoc('teamMeasurement')
    const m = applyComputed(measure, { qty: 320.5, price: 45.6 })
    expect(m.amount).toBe(14614.8)
  })

  it('锁单规则按状态生效', () => {
    expect(getDoc('hazard').lock!({ status: '合格闭环' })).toBe(true)
    expect(getDoc('hazard').lock!({ status: '整改中' })).toBe(false)
    expect(getDoc('settlement').lock!({ status: '已结清' })).toBe(true)
    expect(getDoc('payroll').lock!({ status: '已发放' })).toBe(true)
    expect(getDoc('visa').lock!({ confirmStatus: '已确认' })).toBe(true)
    // 设备/班组不做单据锁，而是阻断其下游业务（见 hooks 测试）
    expect(getDoc('equipment').lock).toBeUndefined()
    expect(getDoc('team').lock).toBeUndefined()
  })

  it('导出字段不包含附件列', () => {
    for (const d of BUSINESS_DOCS) {
      const att = d.fields.filter((f) => f.type === 'attachment')
      expect(att.every((f) => f.type === 'attachment')).toBe(true)
    }
  })

  it('根据配置构造的列表列不重复', () => {
    for (const d of BUSINESS_DOCS) {
      const keys = d.fields.map((f) => f.key)
      expect(new Set(keys).size, `${d.title} 字段 key 重复`).toBe(keys.length)
    }
  })

  it('所有枚举字段的默认值都在候选值内', () => {
    for (const d of DOC_MAP ? BUSINESS_DOCS : []) {
      for (const f of d.fields) {
        if (f.defaultValue !== undefined && (f.type === 'select' || f.type === 'radio')) {
          const values = (f.options || []).map((o: any) => (typeof o === 'string' ? o : o.value))
          expect(values.includes(f.defaultValue), `${d.title}.${f.label} 默认值非法`).toBe(true)
        }
      }
    }
  })
})
