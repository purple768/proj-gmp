import { ALL_DOCS } from './index'

/** 菜单标题 → 该菜单覆盖的单据分组（一个菜单可含多个分组，如质量安全含 quality+safety） */
export const MENU_GROUPS: Record<string, string[]> = {
  '项目与 WBS': ['project'],
  进度管理: ['progress'],
  '合同 · 签证 · 结算': ['contract'],
  成本管理: ['cost'],
  质量安全: ['quality', 'safety'],
  物资设备: ['material', 'equipment'],
  文档图纸: ['document'],
  劳务管理: ['labor']
}

/** 非单据型 tab（树/汇总/图表），没有对应的 DocConfig */
export const EXTRA_TABS: Record<string, string> = {
  wbs: 'WBS 分解',
  four: '四算对比',
  balance: '库存汇总'
}

export interface Crumb {
  title: string
  /** 最后一级不带 path（当前页不可点） */
  path?: string
}

/**
 * 面包屑：首页仪表盘 / 一级菜单 / 标签页（PRD §2.5）
 * 最后一级是当前页，不带 path。
 */
export function buildCrumbs(menuTitle: string, path: string, tab?: string | null): Crumb[] {
  const items: Crumb[] = [{ title: '首页仪表盘', path: '/dashboard' }]
  if (path !== '/dashboard') items.push({ title: menuTitle, path })

  const key = String(tab || '')
  if (key) {
    const groups = MENU_GROUPS[menuTitle] || []
    const doc = ALL_DOCS.find((d) => d.tab === key && groups.includes(d.group))
    const label = doc?.title || EXTRA_TABS[key]
    if (label) items.push({ title: label })
  }
  return items
}

/** 便于断言与调试：拼成 `A / B / C` */
export function crumbText(crumbs: Crumb[]): string {
  return crumbs.map((c) => c.title).join(' / ')
}
