import { allDocs, settingGet } from '@/core/db/repo'
import { dayDiff, todayStart } from '@/shared/date'
import { round2 } from '@/shared/money'
import { hashText } from '@/shared/id'
import { stockAlerts } from './stock'
import { fourWayCompare } from './cost'

export type Priority = '紧急' | '一般'

export interface WarningItem {
  key: string
  ruleKey: string
  type: string
  priority: Priority
  projectId: string
  docType: string
  docId: string
  code: string
  content: string
  createdAt: number
  signature: string
  read?: boolean
}

export interface WarningContext {
  projectId?: string | null
  now?: number
}

function sig(obj: any): string {
  return hashText(JSON.stringify(obj))
}

/** R-09：预警为纯派生，不落库；已读按 ruleKey + sourceId + stateSignature 记录 */
export async function computeWarnings(ctx: WarningContext = {}): Promise<WarningItem[]> {
  const now = ctx.now || todayStart()
  const pid = ctx.projectId || null
  const items: WarningItem[] = []

  const hazards = await allDocs('hazards', pid)
  for (const h of hazards) {
    if (h.status === '合格闭环') continue
    const overdue = h.deadline && dayDiff(h.deadline, now) > 0
    const near = h.deadline && !overdue && dayDiff(now, h.deadline) <= 3
    if (!overdue && !near && h.level !== '重大') continue
    const urgent = h.level === '重大' || overdue
    const days = h.deadline ? Math.abs(dayDiff(now, h.deadline)) : 0
    items.push({
      key: '',
      ruleKey: 'hazard-open',
      type: '安全隐患',
      priority: urgent ? '紧急' : '一般',
      projectId: h.projectId,
      docType: 'hazard',
      docId: h.id,
      code: h.code,
      content: `${h.code} ${h.level}隐患 · ${overdue ? `已逾期 ${days} 天` : near ? `剩 ${days} 天到期` : '重大隐患未闭环'} · ${h.location || ''}`,
      createdAt: now,
      signature: sig({ status: h.status, deadline: h.deadline, level: h.level })
    })
  }

  const certificates = await allDocs('certificates', pid)
  for (const c of certificates) {
    if (!c.expireDate) continue
    const left = dayDiff(now, c.expireDate)
    if (left > 30) continue
    items.push({
      key: '',
      ruleKey: 'cert-expire',
      type: '证件到期',
      priority: left < 0 ? '紧急' : '一般',
      projectId: c.projectId,
      docType: 'certificate',
      docId: c.id,
      code: c.code,
      content: `${c.holder}（${c.jobType}）证件${left < 0 ? `已过期 ${-left} 天` : `剩 ${left} 天到期`}`,
      createdAt: now,
      signature: sig({ expireDate: c.expireDate })
    })
  }

  const equipment = await allDocs('equipment', pid)
  for (const e of equipment) {
    if (!e.inspectExpire || e.status === '退场') continue
    const left = dayDiff(now, e.inspectExpire)
    if (left > 30) continue
    items.push({
      key: '',
      ruleKey: 'equip-inspect',
      type: '设备年检',
      priority: left < 0 ? '紧急' : '一般',
      projectId: e.projectId,
      docType: 'equipment',
      docId: e.id,
      code: e.code,
      content: `${e.name} 年检${left < 0 ? `已过期 ${-left} 天` : `剩 ${left} 天到期`}`,
      createdAt: now,
      signature: sig({ inspectExpire: e.inspectExpire })
    })
  }

  const defects = await allDocs('defects', pid)
  for (const d of defects) {
    if (d.checkResult === '合格闭环') continue
    const left = d.requireDate ? dayDiff(now, d.requireDate) : 0
    if (left >= 0) continue
    items.push({
      key: '',
      ruleKey: 'defect-overdue',
      type: '质量缺陷',
      priority: '紧急',
      projectId: d.projectId,
      docType: 'defect',
      docId: d.id,
      code: d.code,
      content: `${d.code} 缺陷整改逾期 ${-left} 天 · ${d.part || ''}`,
      createdAt: now,
      signature: sig({ checkResult: d.checkResult, requireDate: d.requireDate })
    })
  }

  for (const table of ['inspections', 'concealments', 'tests']) {
    const rows = await allDocs(table, pid)
    for (const r of rows) {
      if (r.result !== '不合格') continue
      const code = r.code
      items.push({
        key: '',
        ruleKey: 'quality-fail',
        type: '质量不合格',
        priority: '一般',
        projectId: r.projectId,
        docType: table === 'tests' ? 'testRecord' : table === 'concealments' ? 'concealment' : 'inspection',
        docId: r.id,
        code,
        content: `${code} 验收/检测不合格，需整改并复查`,
        createdAt: now,
        signature: sig({ result: r.result })
      })
    }
  }

  const projects = await allDocs('projects')
  const targets = pid ? projects.filter((p) => p.id === pid) : projects
  for (const p of targets) {
    const four = await fourWayCompare(p.id)
    for (const row of four.rows) {
      if (row.rate === null || row.rate <= 0) continue
      items.push({
        key: '',
        ruleKey: 'cost-over',
        type: '成本超支',
        priority: row.rate > 0.1 ? '紧急' : '一般',
        projectId: p.id,
        docType: 'budget',
        docId: row.wbsId,
        code: row.code,
        content: `${row.code} ${row.name} 成本超预算 ${(row.rate * 100).toFixed(1)}%（超 ¥${round2(row.deviation).toFixed(2)}）`,
        createdAt: now,
        signature: sig({ rate: Math.round(row.rate * 100) })
      })
    }
    const alerts = await stockAlerts(p.id)
    for (const a of alerts) {
      items.push({
        key: '',
        ruleKey: 'stock-low',
        type: '库存不足',
        priority: '一般',
        projectId: p.id,
        docType: 'stockFlow',
        docId: a.key,
        code: a.key,
        content: `${a.materialName} ${a.spec} 库存 ${a.qty}，低于最低库存 ${a.minStock}`,
        createdAt: now,
        signature: sig({ qty: a.qty, min: a.minStock })
      })
    }
    const settlements = await allDocs('settlements', p.id)
    for (const s of settlements) {
      if (s.status === '已结清') continue
      const un = Math.max(0, round2(Number(s.totalAmount || 0) - Number(s.receivedAmount || 0)))
      if (un <= 0) continue
      const overdue = s.settleDate && dayDiff(s.settleDate, now) > 30
      if (!overdue) continue
      items.push({
        key: '',
        ruleKey: 'ar-outstanding',
        type: '应收未收',
        priority: '一般',
        projectId: p.id,
        docType: 'settlement',
        docId: s.id,
        code: s.code,
        content: `${s.code} 结算后 30 天仍有未收 ¥${un.toFixed(2)}`,
        createdAt: now,
        signature: sig({ un })
      })
    }
  }

  const merged = new Map<string, WarningItem>()
  for (const it of items) {
    it.key = `${it.ruleKey}:${it.docId}:${it.signature}`
    merged.set(it.key, it)
  }
  return Array.from(merged.values())
}

export async function warningsWithRead(ctx: WarningContext = {}): Promise<WarningItem[]> {
  const items = await computeWarnings(ctx)
  const reads: any[] = await (await import('@/core/db/repo')).tbl('warningReads').toArray()
  const readKeys = new Set(reads.map((r) => r.key))
  return items.map((i) => ({ ...i, read: readKeys.has(i.key) }))
}

export async function markRead(keys: string[]) {
  const { tbl } = await import('@/core/db/repo')
  for (const k of keys) await tbl('warningReads').put({ id: k, key: k, ruleKey: k.split(':')[0], sourceId: k.split(':')[1], readAt: Date.now() })
}

export async function cleanupOldReads(days = 30, now = Date.now()) {
  const { tbl } = await import('@/core/db/repo')
  const rows: any[] = await tbl('warningReads').toArray()
  for (const r of rows) {
    if (now - (r.readAt || 0) > days * 86400000) await tbl('warningReads').delete(r.id)
  }
}

export async function warningSummary(ctx: WarningContext = {}) {
  const items = await warningsWithRead(ctx)
  const unread = items.filter((i) => !i.read)
  return {
    total: items.length,
    unread: unread.length,
    urgent: unread.filter((i) => i.priority === '紧急').length,
    normal: unread.filter((i) => i.priority === '一般').length
  }
}

export async function getSettingWarnings() {
  return await settingGet('warningEnabled', true)
}
