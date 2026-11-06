import { allDocs, createDoc, getDoc, tbl, updateDoc } from '@/core/db/repo'
import { round2 } from '@/shared/money'

export function materialKey(name: string, spec: string): string {
  return `${(name || '').trim()}|${(spec || '').trim()}`
}

export async function balance(projectId: string, key: string): Promise<number> {
  const flows = await allDocs('stockFlows', projectId)
  let qty = 0
  for (const f of flows) {
    if (materialKey(f.materialName, f.spec) !== key) continue
    const n = Number(f.qty || 0)
    qty += f.direction === '入库' ? n : -n
  }
  return round2(qty)
}

export interface StockAlert {
  key: string
  materialName: string
  spec: string
  qty: number
  minStock: number
}

export async function stockAlerts(projectId: string): Promise<StockAlert[]> {
  const [flows, dictRows] = await Promise.all([allDocs('stockFlows', projectId), tbl('dictionaries').toArray()])
  const dict = new Map<string, any>(dictRows.map((d: any) => [d.key, d.value]))
  const keys = new Map<string, { name: string; spec: string }>()
  for (const f of flows) keys.set(materialKey(f.materialName, f.spec), { name: f.materialName, spec: f.spec })
  const out: StockAlert[] = []
  for (const [key, info] of keys) {
    const minStock = Number(dict.get(key)?.minStock || 0)
    if (!minStock) continue
    const qty = await balance(projectId, key)
    if (qty < minStock) out.push({ key, materialName: info.name, spec: info.spec, qty, minStock })
  }
  return out
}

/** 入库时机（R-12）：送检=否 或 结论=合格 才生成流水；不合格/待出报告不入库 */
export function shouldStockIn(receipt: any): boolean {
  if (receipt.inspectRequired === '否') return true
  return receipt.inspectResult === '合格'
}

/** 幂等：同一进场单只生成一条入库流水 */
export async function applyReceipt(receiptId: string): Promise<'created' | 'skipped'> {
  const receipt: any = await getDoc('materialReceipts', receiptId)
  if (!receipt) throw new Error('进场单不存在')
  const flows = await allDocs('stockFlows', receipt.projectId, true)
  if (flows.some((f) => f.sourceId === receipt.id)) return 'skipped'
  if (!shouldStockIn(receipt)) return 'skipped'
  await createDoc('stockFlows', {
    projectId: receipt.projectId,
    wbsId: receipt.wbsId || null,
    code: `RK-${receipt.code}`,
    materialName: receipt.materialName,
    spec: receipt.spec,
    direction: '入库',
    qty: Number(receipt.qty || 0),
    price: 0,
    occurDate: receipt.inDate || Date.now(),
    location: receipt.location || '',
    operator: '系统',
    remark: `由进场单 ${receipt.code} 自动生成`,
    sourceId: receipt.id
  })
  return 'created'
}

/** 出库不得超库存 */
export async function assertOutbound(projectId: string, name: string, spec: string, qty: number) {
  const key = materialKey(name, spec)
  const cur = await balance(projectId, key)
  if (Number(qty) > cur) throw new Error(`当前库存 ${cur}，出库数量不能超过库存`)
}

/** 回写需求计划状态（R-12） */
export async function reflowPlans(projectId: string) {
  const [plans, receipts] = await Promise.all([allDocs('materialPlans', projectId), allDocs('materialReceipts', projectId)])
  for (const plan of plans) {
    const related = receipts.filter(
      (r) =>
        (r.planCode && r.planCode === plan.code) ||
        (!r.planCode && materialKey(r.materialName, r.spec) === materialKey(plan.materialName, plan.spec))
    )
    const stocked = related.filter(shouldStockIn).reduce((s, r) => s + Number(r.qty || 0), 0)
    const need = Number(plan.qty || 0)
    const status = stocked <= 0 ? '待采购' : stocked >= need ? '全部完成' : '部分进场'
    if (plan.status !== status) await updateDoc('materialPlans', plan.id, { status })
  }
}

export async function planProgress(projectId: string, planId: string) {
  const plan: any = await getDoc('materialPlans', planId)
  const receipts = await allDocs('materialReceipts', projectId)
  const related = receipts.filter(
    (r) => (r.planCode && r.planCode === plan.code) || materialKey(r.materialName, r.spec) === materialKey(plan.materialName, plan.spec)
  )
  const stocked = related.filter(shouldStockIn).reduce((s, r) => s + Number(r.qty || 0), 0)
  return { need: Number(plan.qty || 0), stocked, status: plan.status }
}
