import { allDocs, createDoc, getDoc } from '@/core/db/repo'
import { round2, sumMoney } from '@/shared/money'
import { dayDiff, todayStart, fmtDate } from '@/shared/date'

/** 不合格 → 一键建缺陷单，带上来源单号（AC-17） */
export async function createDefectFromInspection(inspectionId: string): Promise<any> {
  const src: any = await getDoc('inspections', inspectionId)
  if (!src) throw new Error('检验批记录不存在')
  if (src.result !== '不合格') throw new Error('只有验收结果=不合格的检验批才能生成缺陷单')
  const existing = await allDocs('defects', src.projectId)
  const dup = existing.find((d) => d.sourceCode === src.code)
  if (dup) return dup
  return await createDoc('defects', {
    projectId: src.projectId,
    wbsId: src.wbsId || null,
    code: `QX-${src.code.replace(/^JYP-/, '')}`,
    sourceCode: src.code,
    part: src.part,
    desc: `${src.subItem} 验收不合格：${src.mainItems || src.generalItems || '详见检验批记录'}`,
    requireDate: todayStart() + 7 * 86400000,
    finder: src.inspector || '',
    checkResult: '待复查'
  })
}

/** 证件/年检剩余天数与状态标签（R-13） */
export function remainDays(expireDate: number | null, now = todayStart()): number | null {
  if (!expireDate) return null
  return dayDiff(now, expireDate)
}

export function expireStatus(expireDate: number | null, now = todayStart()): { label: string; type: 'danger' | 'warning' | 'success' | 'info' } {
  const left = remainDays(expireDate, now)
  if (left === null) return { label: '未填有效期', type: 'info' }
  if (left < 0) return { label: `已过期 ${-left} 天`, type: 'danger' }
  if (left === 0) return { label: '今天到期', type: 'warning' }
  if (left <= 30) return { label: `剩 ${left} 天`, type: 'warning' }
  return { label: `剩 ${left} 天`, type: 'success' }
}

/** 已审核班组计量合计，作为工资台账取数来源（5.8） */
export async function approvedMeasurementTotal(projectId: string, teamId: string, month?: string): Promise<number> {
  const rows = await allDocs('teamMeasurements', projectId)
  const filtered = rows.filter((r) => {
    if (r.teamId !== teamId) return false
    if (r.auditStatus !== '已审核') return false
    if (month) {
      const m = fmtDate(r.periodEnd || r.createdAt).slice(0, 7)
      if (m !== month) return false
    }
    return true
  })
  return round2(sumMoney(filtered.map((r) => r.amount)))
}

export async function payrollSuggestion(projectId: string, teamId: string, month: string) {
  const total = await approvedMeasurementTotal(projectId, teamId, month)
  const workers = (await allDocs('workers', projectId)).filter((w) => w.teamId === teamId && w.status !== '退场')
  return { total, headCount: workers.length, workers }
}

/** 资料借出是否逾期（P1 提醒，仅计算） */
export function isOverdueBorrow(row: any, days = 30, now = todayStart()): boolean {
  if (!row.borrower || row.returnDate || !row.borrowDate) return false
  return dayDiff(row.borrowDate, now) > days
}
