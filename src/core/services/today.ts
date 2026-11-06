import { allDocs, tbl } from '@/core/db/repo'
import { dayDiff, isReportAnchorDay, todayStart } from '@/shared/date'

export interface TodayItem {
  id: string
  kind: '整改' | '证件' | '填报' | '待办'
  title: string
  docType: string | null
  docId: string | null
  route?: string
  overdue: boolean
  overdueDays: number
  done: boolean
  manual?: boolean
}

export interface TodayResult {
  items: TodayItem[]
  todoCount: number
  overdueCount: number
}

/** R-10：四类来源只读聚合；逾期单独计数，N 含逾期项 */
export async function buildToday(projectId?: string | null, now = todayStart()): Promise<TodayResult> {
  const items: TodayItem[] = []

  const hazards = await allDocs('hazards', projectId || null)
  for (const h of hazards) {
    if (h.status === '合格闭环' || !h.deadline) continue
    const diff = dayDiff(h.deadline, now)
    if (diff === 0) {
      items.push({
        id: `hazard-due-${h.id}`,
        kind: '整改',
        title: `${h.code} 隐患今日到期 · ${h.location || ''}`,
        docType: 'hazard',
        docId: h.id,
        route: '/safety?tab=hazard',
        overdue: false,
        overdueDays: 0,
        done: false
      })
    } else if (diff > 0) {
      items.push({
        id: `hazard-over-${h.id}`,
        kind: '整改',
        title: `${h.code} 隐患已逾期 ${-diff} 天 · ${h.location || ''}`,
        docType: 'hazard',
        docId: h.id,
        route: '/safety?tab=hazard',
        overdue: true,
        overdueDays: diff,
        done: false
      })
    }
  }

  const defects = await allDocs('defects', projectId || null)
  for (const d of defects) {
    if (d.checkResult === '合格闭环' || !d.requireDate) continue
    const diff = dayDiff(d.requireDate, now)
    if (diff === 0) {
      items.push({
        id: `defect-due-${d.id}`,
        kind: '整改',
        title: `${d.code} 缺陷今日到期 · ${d.part || ''}`,
        docType: 'defect',
        docId: d.id,
        route: '/quality?tab=defect',
        overdue: false,
        overdueDays: 0,
        done: false
      })
    } else if (diff > 0) {
      items.push({
        id: `defect-over-${d.id}`,
        kind: '整改',
        title: `${d.code} 缺陷整改逾期 ${-diff} 天 · ${d.part || ''}`,
        docType: 'defect',
        docId: d.id,
        route: '/quality?tab=defect',
        overdue: true,
        overdueDays: diff,
        done: false
      })
    }
  }

  const certs = await allDocs('certificates', projectId || null)
  for (const c of certs) {
    if (!c.expireDate) continue
    const diff = dayDiff(c.expireDate, now)
    if (diff === 0) {
      items.push({
        id: `cert-due-${c.id}`,
        kind: '证件',
        title: `${c.holder} 证件今日到期`,
        docType: 'certificate',
        docId: c.id,
        route: '/safety?tab=certificate',
        overdue: false,
        overdueDays: 0,
        done: false
      })
    } else if (diff > 0) {
      items.push({
        id: `cert-over-${c.id}`,
        kind: '证件',
        title: `${c.holder} 证件已过期 ${diff} 天`,
        docType: 'certificate',
        docId: c.id,
        route: '/safety?tab=certificate',
        overdue: true,
        overdueDays: diff,
        done: false
      })
    }
  }

  const equip = await allDocs('equipment', projectId || null)
  for (const e of equip) {
    if (!e.inspectExpire || e.status === '退场') continue
    const diff = dayDiff(e.inspectExpire, now)
    if (diff === 0) {
      items.push({
        id: `equip-due-${e.id}`,
        kind: '证件',
        title: `${e.name} 年检今日到期`,
        docType: 'equipment',
        docId: e.id,
        route: '/equipment?tab=ledger',
        overdue: false,
        overdueDays: 0,
        done: false
      })
    }
  }

  const projects = (await allDocs('projects')).filter((p) => !projectId || p.id === projectId)
  const progress = await allDocs('progressRecords', projectId || null)
  const wbsAll = await allDocs('wbs', projectId || null)
  for (const p of projects) {
    const cycle = p.reportCycle || '周'
    const anchor = Number(p.reportAnchor || 5)
    if (!isReportAnchorDay(now, cycle, anchor)) continue
    const projectWbs = wbsAll.filter((w) => w.projectId === p.id && w.enabled !== false)
    if (!projectWbs.length) continue
    const todayRecords = progress.filter((r) => r.projectId === p.id && dayDiff(r.reportDate || 0, now) === 0)
    const filled = new Set(todayRecords.map((r) => r.wbsId)).size
    if (filled >= projectWbs.length) continue
    items.push({
      id: `report-${p.id}`,
      kind: '填报',
      title: `${p.name} 今日应填报（已填 ${filled}/${projectWbs.length} 个 WBS）`,
      docType: 'progress',
      docId: null,
      route: '/progress',
      overdue: false,
      overdueDays: 0,
      done: false
    })
  }

  const todos: any[] = await tbl('todayTodos').toArray()
  for (const t of todos) {
    if (t.done) continue
    if (t.date && dayDiff(t.date, now) < 0) continue
    const late = t.date ? dayDiff(t.date, now) > 0 : false
    items.push({
      id: `todo-${t.id}`,
      kind: '待办',
      title: t.text,
      docType: null,
      docId: t.id,
      overdue: late,
      overdueDays: late ? dayDiff(t.date, now) : 0,
      done: false,
      manual: true
    })
  }

  const todoCount = items.length
  const overdueCount = items.filter((i) => i.overdue).length
  return { items, todoCount, overdueCount }
}

export async function addTodo(text: string, now = todayStart()) {
  const id = crypto.randomUUID()
  await tbl('todayTodos').put({ id, text, date: now, done: false, createdAt: Date.now() })
  return id
}

export async function toggleTodo(id: string, done: boolean) {
  const row: any = await tbl('todayTodos').get(id)
  if (row) await tbl('todayTodos').put({ ...row, done })
}
