import { allDocs } from '@/core/db/repo'
import { dayDiff, dateOnly, todayStart } from '@/shared/date'
import { buildTree, flattenTree, loadWbs, type WbsNode } from './wbs'

export interface GanttBar {
  wbsId: string
  code: string
  name: string
  level: number
  planStart: number
  planEnd: number
  actualStart: number | null
  actualEnd: number | null
  rate: number
  source: 'self' | 'children' | 'none'
  milestone: boolean
  staleDays: number
  enabled: boolean
}

export function latestByWbs(records: any[], wbsId: string): any | null {
  const list = records.filter((r) => r.wbsId === wbsId && r.deletedAt == null)
  if (!list.length) return null
  return list.sort((a, b) => {
    const d = (b.reportDate || 0) - (a.reportDate || 0)
    return d !== 0 ? d : (b.createdAt || 0) - (a.createdAt || 0)
  })[0]
}

function planRange(node: WbsNode, flat: WbsNode[], records: any[]) {
  if (!node.children.length) {
    const start = node.planStart || node.planEnd || todayStart()
    const end = node.planEnd || start
    return { start, end }
  }
  const childRanges = node.children.map((c) => planRange(c, flat, records))
  const starts = childRanges.map((r) => r.start).filter(Boolean)
  const ends = childRanges.map((r) => r.end).filter(Boolean)
  return {
    start: node.planStart || Math.min(...starts) || todayStart(),
    end: node.planEnd || Math.max(...ends) || todayStart()
  }
}

function weightedRate(node: WbsNode, records: any[], flat: WbsNode[]): { rate: number | null; source: 'self' | 'children' | 'none' } {
  const own = latestByWbs(records, node.id)
  if (own) return { rate: Number(own.actualRate) || 0, source: 'self' }
  if (!node.children.length) return { rate: null, source: 'none' }
  const items = node.children
    .map((c) => {
      const r = weightedRate(c, records, flat)
      const dur = Math.max(1, dayDiff(c.planStart || todayStart(), c.planEnd || c.planStart || todayStart()) + 1)
      return r.rate === null ? null : { rate: r.rate, dur }
    })
    .filter(Boolean) as { rate: number; dur: number }[]
  if (!items.length) return { rate: null, source: 'none' }
  const totalDur = items.reduce((s, i) => s + i.dur, 0)
  const rate = items.reduce((s, i) => s + i.rate * i.dur, 0) / totalDur
  return { rate: Math.round(rate), source: 'children' }
}

/** R-04：实际条 = 计划开始 + 完成率 × 计划工期；父节点无自身填报时按工期加权（仅展示层） */
export async function buildGantt(projectId: string): Promise<GanttBar[]> {
  const [rows, records] = await Promise.all([loadWbs(projectId), allDocs('progressRecords', projectId)])
  const tree = buildTree(rows)
  const flat = flattenTree(tree)
  const today = todayStart()
  return flat.map((node) => {
    const range = planRange(node, flat, records)
    const durationDays = Math.max(1, dayDiff(range.start, range.end) + 1)
    const { rate, source } = weightedRate(node, records, flat)
    let actualStart: number | null = null
    let actualEnd: number | null = null
    if (rate !== null && rate > 0) {
      actualStart = range.start
      const used = Math.max(1, Math.round((durationDays * Math.min(100, rate)) / 100))
      actualEnd = new Date(dateOnly(range.start)).setDate(new Date(dateOnly(range.start)).getDate() + used - 1)
    }
    const own = latestByWbs(records, node.id)
    const staleDays = own && rate !== null && rate < 100 ? dayDiff(own.reportDate || today, today) : 0
    return {
      wbsId: node.id,
      code: node.code,
      name: node.name,
      level: node.level,
      planStart: range.start,
      planEnd: range.end,
      actualStart,
      actualEnd,
      rate: rate ?? 0,
      source,
      milestone: node.milestone === '是',
      staleDays: staleDays > 14 ? staleDays : 0,
      enabled: node.enabled
    }
  })
}

export interface ProgressWarning {
  wbsId: string
  code: string
  name: string
  planDays: number
  estimatedDays: number
  deviation: number
  level: '一般' | '紧急'
}

/** 工期预警：预计工期 = 计划工期 / max(完成率,1%)，偏差 = 预计 − 计划 */
export async function progressWarnings(projectId: string): Promise<ProgressWarning[]> {
  const [rows, records] = await Promise.all([loadWbs(projectId), allDocs('progressRecords', projectId)])
  const out: ProgressWarning[] = []
  for (const row of rows) {
    const own = latestByWbs(records, row.id)
    if (!own) continue
    const rate = Number(own.actualRate) || 0
    if (rate >= 100) continue
    const planDays = Math.max(1, dayDiff(row.planStart || todayStart(), row.planEnd || row.planStart || todayStart()) + 1)
    const estimated = Math.round(planDays / Math.max(rate / 100, 0.01))
    const deviation = estimated - planDays
    if (deviation <= 0) continue
    out.push({
      wbsId: row.id,
      code: row.code,
      name: row.name,
      planDays,
      estimatedDays: estimated,
      deviation,
      level: deviation > 7 ? '紧急' : '一般'
    })
  }
  return out.sort((a, b) => b.deviation - a.deviation)
}
