/**
 * 批量数据工厂（性能验收 / 压测用）
 *
 * 数据直接写进浏览器 IndexedDB 的真实表，绕过 UI，但字段结构与真实单据一致，
 * 因此搜索索引、列表筛选、分页排序走的都是真实代码路径。
 *
 * 写入的行统一带 `seedBatch: 'perf'` 标记，便于一键清理。
 */

export const SEED_BATCH = 'perf'

const LEVELS = ['一般', '重大']
const HAZARD_STATUS = ['待整改', '整改中', '合格闭环', '不合格']
const CATEGORIES = ['人工', '材料', '机械', '分包']
const LOCATIONS = ['3号楼 二层东侧', '地下室 顶板', '钢筋加工棚', '基坑南侧临边', '塔吊基础', '水稳基层 K1+200']
const ACTIONS = ['临边防护栏杆缺失', '配电箱未做二级保护', '防水卷材搭接不足', '洞口未封闭', '未佩戴安全帽', '支撑体系立杆间距超限']
const RESULTS = ['合格', '不合格']

/** 可复现的伪随机（mulberry32），保证每次压测数据一致 */
function rnd(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DAY = 86400000

/** 生成指定表的一批行 */
export function makeRows(table, count, ctx, seed = 1) {
  const R = rnd(seed)
  const pick = (arr) => arr[Math.floor(R() * arr.length)]
  const now = Date.now()
  const rows = []
  for (let i = 0; i < count; i++) {
    const p = ctx.projects[Math.floor(R() * ctx.projects.length)] || { id: 'p-demo' }
    const wbsList = ctx.wbs.filter((w) => w.projectId === p.id)
    const wbs = wbsList.length ? wbsList[Math.floor(R() * wbsList.length)] : null
    const teamList = ctx.teams.filter((t) => t.projectId === p.id)
    const team = teamList.length ? teamList[Math.floor(R() * teamList.length)] : null
    const day = now - Math.floor(R() * 720) * DAY
    const id = `seed-${table}-${seed}-${i}`
    const base = { id, projectId: p.id, createdAt: now, updatedAt: now, seedBatch: SEED_BATCH }

    if (table === 'hazards') {
      const action = pick(ACTIONS)
      rows.push({
        ...base,
        code: `YH-S${String(seed).padStart(2, '0')}-${String(i).padStart(6, '0')}`,
        wbsId: wbs?.id || null,
        level: pick(LEVELS),
        location: pick(LOCATIONS),
        desc: `现场检查发现：${pick(LOCATIONS)} ${action}（批次 ${i}）`,
        requirement: `立即整改 ${action}，整改后拍照复查`,
        deadline: day,
        finder: '安全员',
        team: team?.name || '土建一班',
        status: pick(HAZARD_STATUS)
      })
    } else if (table === 'expenses') {
      rows.push({
        ...base,
        code: `ZC-S${String(seed).padStart(2, '0')}-${String(i).padStart(6, '0')}`,
        wbsId: wbs?.id || null,
        category: pick(CATEGORIES),
        amount: Math.round(R() * 900000) / 100,
        occurDate: day,
        voucherNo: `PZ-${i}`,
        desc: `第 ${i} 笔支出：${pick(LOCATIONS)} ${pick(CATEGORIES)}费用`
      })
    } else if (table === 'inspections') {
      rows.push({
        ...base,
        code: `JYP-S${String(seed).padStart(2, '0')}-${String(i).padStart(6, '0')}`,
        wbsId: wbs?.id || null,
        subItem: pick(['钢筋工程', '模板工程', '混凝土工程', '防水工程']),
        part: pick(LOCATIONS),
        checkDate: day,
        result: pick(RESULTS),
        mainItems: '主控项目全部符合设计及规范要求',
        generalItems: '一般项目抽查合格'
      })
    } else if (table === 'attendances') {
      rows.push({
        ...base,
        code: `KQ-S${String(seed).padStart(2, '0')}-${String(i).padStart(6, '0')}`,
        teamId: team?.id || null,
        workDate: day,
        presentCount: 8 + Math.floor(R() * 20),
        absentCount: Math.floor(R() * 3),
        recorder: '施工员',
        detail: `${team?.name || '土建一班'} 出勤记录 ${i}`
      })
    } else {
      throw new Error(`未支持的表: ${table}`)
    }
  }
  return rows
}

/** 读取数据库上下文（项目 / WBS / 班组） */
export async function readContext(page) {
  return page.evaluate(async () => {
    const db = window.__gmpDb
    if (!db) throw new Error('window.__gmpDb 不存在：请确认开发服务器以 DEV 模式运行')
    const projects = (await db.table('projects').toArray()).map((p) => ({ id: p.id, code: p.code, name: p.name }))
    const wbs = (await db.table('wbs').toArray()).map((w) => ({ id: w.id, projectId: w.projectId }))
    const teams = (await db.table('teams').toArray()).map((t) => ({ id: t.id, projectId: t.projectId, name: t.name }))
    return { projects, wbs, teams }
  })
}

/** 分批 bulkPut */
export async function insertRows(page, table, rows, batch = 2000) {
  let done = 0
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch)
    await page.evaluate(
      async ({ table, chunk }) => {
        await window.__gmpDb.table(table).bulkPut(chunk)
      },
      { table, chunk }
    )
    done += chunk.length
  }
  return done
}

/** 清理本工厂写入的数据 */
export async function cleanSeed(page, tables) {
  return page.evaluate(
    async ({ tables, tag }) => {
      const db = window.__gmpDb
      const out = {}
      for (const t of tables) {
        const n = await db
          .table(t)
          .filter((r) => r.seedBatch === tag)
          .delete()
        out[t] = n
      }
      return out
    },
    { tables, tag: SEED_BATCH }
  )
}

/** 统计各表总行数 */
export async function countTables(page, tables) {
  return page.evaluate(async (tables) => {
    const out = {}
    for (const t of tables) out[t] = await window.__gmpDb.table(t).count()
    return out
  }, tables)
}

/** 默认分布：合计 50000 条，覆盖搜索/列表/成本/劳务四条高频路径 */
export function planCounts(total) {
  const plan = { hazards: 0.3, expenses: 0.3, inspections: 0.2, attendances: 0.2 }
  const out = {}
  let rest = total
  const keys = Object.keys(plan)
  keys.forEach((k, idx) => {
    const n = idx === keys.length - 1 ? rest : Math.round(total * plan[k])
    out[k] = n
    rest -= n
  })
  return out
}
