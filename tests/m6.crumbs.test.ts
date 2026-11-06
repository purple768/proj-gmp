import { describe, expect, it } from 'vitest'
import { buildCrumbs, crumbText } from '@/core/docs/crumbs'

describe('R-19 / AC-01 面包屑路径（PRD §2.5）', () => {
  it('首页只有一级', () => {
    expect(crumbText(buildCrumbs('首页看板', '/dashboard'))).toBe('首页仪表盘')
  })

  it('无 tab 的页面为两级', () => {
    const c = buildCrumbs('进度管理', '/progress')
    expect(crumbText(c)).toBe('首页仪表盘 / 进度管理')
    expect(c[0].path).toBe('/dashboard')
    expect(c[1].path).toBe('/progress')
  })

  it('带 tab 的页面为三级，且末级不可点', () => {
    const c = buildCrumbs('质量安全', '/quality', 'hazard')
    expect(crumbText(c)).toBe('首页仪表盘 / 质量安全 / 隐患排查复查')
    expect(c[2].path).toBeUndefined()
  })

  it('同一 tab 名在不同菜单下解析到不同单据（plan 冲突）', () => {
    expect(crumbText(buildCrumbs('质量安全', '/quality', 'plan'))).toContain('质量计划')
    expect(crumbText(buildCrumbs('物资设备', '/material', 'plan'))).toContain('材料需求计划')
  })

  it('非单据型 tab 用别名兜底', () => {
    expect(crumbText(buildCrumbs('项目与 WBS', '/project', 'wbs'))).toContain('WBS 分解')
    expect(crumbText(buildCrumbs('成本管理', '/cost', 'four'))).toContain('四算对比')
    expect(crumbText(buildCrumbs('物资设备', '/material', 'balance'))).toContain('库存汇总')
  })

  it('未知 tab 不产生空级别', () => {
    expect(crumbText(buildCrumbs('劳务管理', '/labor', 'not-exist'))).toBe('首页仪表盘 / 劳务管理')
  })

  it('菜单与分组不匹配时不硬塞单据名（避免张冠李戴）', () => {
    // hazard 属于 safety 分组，挂在「劳务管理」下不应命中
    expect(crumbText(buildCrumbs('劳务管理', '/labor', 'hazard'))).toBe('首页仪表盘 / 劳务管理')
  })
})
