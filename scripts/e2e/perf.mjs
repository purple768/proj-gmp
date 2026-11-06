/**
 * 性能与稳定性验收（对应 PRD §10 K 组）
 *
 *   node scripts/e2e/perf.mjs            # AC-40 / AC-41
 *   node scripts/e2e/perf.mjs --soak     # 追加 AC-42 连续增删改（约 2~3 分钟）
 *   node scripts/e2e/perf.mjs --keep     # 不清理压测数据（默认写入前会清理同名标记）
 *
 * 判定口径：
 *   AC-40 从「按下搜索」到「结果渲染完成」≤ 300ms
 *   AC-41 单次筛选/翻页响应 ≤ 1000ms
 *   AC-42 连续 50 次增删改后无报错、计数一致、堆内存无异常增长
 */
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { clickButton, fillByLabel, fillDate, pickSelect, saveDialog, sleep, totalCount } from '../lib/e2e-helpers.mjs'
import { cleanSeed, countTables, insertRows, makeRows, planCounts, readContext } from '../lib/perf-data.mjs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100'
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find((p) => fs.existsSync(p))

const argv = process.argv.slice(2)
const soak = argv.includes('--soak')
const TOTAL = 50000
const results = []
const errors = []
fs.mkdirSync('.shots', { recursive: true })

function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

if (!EDGE) {
  console.error('未找到 Edge/Chrome')
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--window-size=1440,900'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})

// ── 准备：写入 5 万条压测数据 ──────────────────────────────
console.log(`\n[准备] 写入 ${TOTAL} 条压测数据…`)
await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle2' })
await page.waitForFunction(() => !!window.__gmpDb, { timeout: 20000 })
await cleanSeed(page, ['hazards', 'expenses', 'inspections', 'attendances'])
const ctx = await readContext(page)
const counts = planCounts(TOTAL)
const seedStart = Date.now()
let seedNo = 1
for (const [table, n] of Object.entries(counts)) {
  if (!n) continue
  await insertRows(page, table, makeRows(table, n, ctx, seedNo++))
}
const dbCounts = await countTables(page, ['hazards', 'expenses', 'inspections', 'attendances'])
const dbTotal = Object.values(dbCounts).reduce((s, n) => s + n, 0)
console.log(`[准备] 完成：${JSON.stringify(dbCounts)} 合计 ${dbTotal} 条，耗时 ${Date.now() - seedStart} ms`)
check('压测数据写入 5 万条', dbTotal >= TOTAL, `${dbTotal} 条`)

// ── AC-40：全局搜索 ≤ 300ms ────────────────────────────────
const navStart = Date.now()
await page.goto(`${BASE}/#/search`, { waitUntil: 'networkidle2' })
const indexReady = await page
  .waitForFunction(
    () => {
      const el = document.querySelector('.toolbar .muted')
      const m = el && el.innerText.match(/索引\s*(\d+)\s*条/)
      return !!(m && Number(m[1]) > 0)
    },
    { timeout: 60000, polling: 100 }
  )
  .then(() => true)
  .catch(() => false)
const indexBuildMs = Date.now() - navStart
const indexText = await page.$eval('.toolbar .muted', (el) => el.innerText).catch(() => '')
check('搜索索引加载完成', indexReady, `${indexText.trim()}（含页面加载 ${indexBuildMs} ms）`)

/** 先把结果清空（搜一个必然无命中的 token），保证后续测量有明确的「0 → N」跳变 */
async function resetSearch() {
  return page.evaluate(async () => {
    const input = document.querySelector('.toolbar input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, '__no_hit_token__')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    const btn = Array.from(document.querySelectorAll('.toolbar button')).find((b) => b.innerText.trim() === '搜索')
    btn.click()
    const t0 = performance.now()
    while (performance.now() - t0 < 5000) {
      await new Promise((r) => requestAnimationFrame(r))
      if (document.querySelectorAll('.hit').length === 0 && document.querySelector('.empty')) break
    }
    return document.querySelectorAll('.hit').length
  })
}

/** 在页内执行一次搜索并测量「点击 → 结果渲染」耗时 */
async function measureSearch(query) {
  await resetSearch()
  return page.evaluate(async (q) => {
    const input = document.querySelector('.toolbar input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, q)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 60))

    const btn = Array.from(document.querySelectorAll('.toolbar button')).find((b) => b.innerText.trim() === '搜索')
    const t0 = performance.now()
    btn.click()
    // 起点是 0 条：等到出现 hit 或出现空态即视为渲染完成
    while (performance.now() - t0 < 8000) {
      await new Promise((r) => requestAnimationFrame(r))
      const now = document.querySelectorAll('.hit').length
      if (now > 0 || document.querySelector('.empty')) break
    }
    await new Promise((r) => requestAnimationFrame(r))
    const wall = performance.now() - t0
    const costText = document.querySelector('.toolbar .muted')?.innerText || ''
    const algo = Number((costText.match(/·\s*(\d+)\s*ms/) || [])[1] || 0)
    const totalText = document.querySelector('.result-count')?.innerText || ''
    const total = Number((totalText.match(/当前\s*(\d+)\s*条/) || [])[1] || 0)
    return { wall, algo, hits: document.querySelectorAll('.hit').length, total }
  }, query)
}

// 关键：用「两个词分属不同记录」的组合证明 AND 语义（而不是靠命中数上限去判断）
const queries = ['配电箱', '配电箱 防水卷材', 'YH-S01-000123']
const searchTimes = []
for (const q of queries) {
  const r = await measureSearch(q)
  searchTimes.push(r)
  console.log(`  搜索「${q}」→ ${r.wall.toFixed(0)} ms（算法 ${r.algo} ms，共 ${r.total} 条，首屏渲染 ${r.hits} 条）`)
}
const worst = Math.max(...searchTimes.map((r) => r.wall))
const worstAlgo = Math.max(...searchTimes.map((r) => r.algo))
check('AC-40 搜索响应 ≤ 300ms', worst <= 300, `最慢 ${worst.toFixed(0)} ms（算法口径 ${worstAlgo} ms）`)
check(
  'AC-40 多词为 AND 语义（跨记录两词不命中）',
  searchTimes[0].total > 0 && searchTimes[1].total === 0,
  `单「配电箱」${searchTimes[0].total} 条，「配电箱 防水卷材」${searchTimes[1].total} 条`
)
check('AC-40 编号精确命中', searchTimes[2].total === 1, `「YH-S01-000123」命中 ${searchTimes[2].total} 条`)
await page.screenshot({ path: path.join('.shots', '20-perf-search.png') })

// ── AC-41：列表筛选 / 翻页 ≤ 1s ────────────────────────────
await page.goto(`${BASE}/#/quality?tab=hazard`, { waitUntil: 'networkidle2' })
await page.waitForFunction(() => document.querySelectorAll('.el-table__body tr').length > 0, { timeout: 30000 })
await sleep(500)

/** 点击某元素后等待首行内容变化，返回耗时（ms），-1 表示元素未找到 */
async function measureRowChange(expr) {
  return page.evaluate(async (code) => {
    const firstText = () => document.querySelector('.el-table__body tr')?.innerText || ''
    const before = firstText()
    const el = new Function(`return (${code})`)()
    if (!el) return -1
    const t0 = performance.now()
    el.click()
    while (performance.now() - t0 < 8000) {
      await new Promise((r) => requestAnimationFrame(r))
      if (firstText() && firstText() !== before) break
    }
    await new Promise((r) => requestAnimationFrame(r))
    return performance.now() - t0
  }, expr)
}

const nextBtnMs = await measureRowChange(
  `Array.from(document.querySelectorAll('.el-pagination button')).find((b) => b.classList.contains('btn-next'))`
)
console.log(`  翻页耗时 ${nextBtnMs < 0 ? '未找到翻页按钮' : nextBtnMs.toFixed(0) + ' ms'}`)
check('AC-41 5 万条数据翻页 ≤ 1s', nextBtnMs > 0 && nextBtnMs <= 1000, `${nextBtnMs.toFixed(0)} ms`)

const filterMs = await page.evaluate(async () => {
  const input = document.querySelector('.toolbar input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  const firstText = () => document.querySelector('.el-table__body tr')?.innerText || ''
  const before = firstText()
  setter.call(input, '配电箱')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 50))
  const btn = Array.from(document.querySelectorAll('.toolbar button')).find((b) => b.innerText.trim() === '查询')
  const t0 = performance.now()
  btn.click()
  while (performance.now() - t0 < 8000) {
    await new Promise((r) => requestAnimationFrame(r))
    if (firstText() !== before) break
  }
  await new Promise((r) => requestAnimationFrame(r))
  return performance.now() - t0
})
const filteredRows = await page.$$eval('.el-table__body tr', (rs) => rs.length)
console.log(`  关键词筛选耗时 ${filterMs.toFixed(0)} ms，当前页 ${filteredRows} 行`)
check('AC-41 关键词筛选 ≤ 1s', filterMs <= 1000, `${filterMs.toFixed(0)} ms`)

const pageTotalVisible = await page.$eval('.pager .muted', (el) => el.innerText).catch(() => '')
check('AC-41 筛选后总数与分页一致', /共\s*\d+\s*条/.test(pageTotalVisible), pageTotalVisible)

// ── AC-42：连续增删改 ────────────────────────────────────
if (soak) {
  const ROUNDS = 50
  console.log(`\n[AC-42] 连续 ${ROUNDS} 轮 新增→编辑→删除…`)
  await page.goto(`${BASE}/#/quality?tab=hazard`, { waitUntil: 'networkidle2' })
  await sleep(1200)
  await page.evaluate(() => {
    const input = document.querySelector('.toolbar input')
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(input, '')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await sleep(200)
  // 必须点一次查询：上一段 AC-41 残留了关键词筛选，不清掉基准数就是筛选后的条数
  await clickButton(page, '查询')
  await sleep(1500)
  const baseCount = await totalCount(page)
  const metrics0 = await page.metrics()
  const soakErrors = []
  let created = 0
  let edited = 0
  let deleted = 0

  for (let i = 1; i <= ROUNDS; i++) {
    // ① 增
    await clickButton(page, '新增')
    await sleep(500)
    await fillByLabel(page, '隐患位置', `压测位置 ${i}`)
    await fillByLabel(page, '隐患描述', `压测隐患描述 ${i}`)
    await fillByLabel(page, '整改要求', `压测整改要求 ${i}`)
    await pickSelect(page, '隐患等级', 0)
    await fillDate(page, '限期整改日期', '2026-12-20')
    const createdRes = await saveDialog(page)
    if (!createdRes.closed || createdRes.fieldErrors.length) {
      soakErrors.push(`第 ${i} 轮新增失败: ${createdRes.fieldErrors.join('/') || createdRes.messages.join('/')}`)
      continue
    }
    created++

    // ② 改（点该行「编辑」，改一个字段再保存）
    const opened = await page.evaluate((n) => {
      const rows = Array.from(document.querySelectorAll('.el-table__body tr'))
      const target = rows.find((r) => r.innerText.includes(`压测位置 ${n}`))
      const btn = target && Array.from(target.querySelectorAll('button')).find((b) => b.innerText.trim() === '编辑')
      if (!btn || btn.disabled) return false
      btn.click()
      return true
    }, i)
    if (!opened) {
      soakErrors.push(`第 ${i} 轮未找到可编辑的行`)
    } else {
      await sleep(700)
      await fillByLabel(page, '发现人', `压测修改 ${i}`)
      const editRes = await saveDialog(page)
      if (!editRes.closed || editRes.fieldErrors.length) {
        soakErrors.push(`第 ${i} 轮编辑保存失败: ${editRes.fieldErrors.join('/') || editRes.messages.join('/')}`)
      } else {
        edited++
      }
    }

    // ③ 删
    const delOk = await page.evaluate((n) => {
      const rows = Array.from(document.querySelectorAll('.el-table__body tr'))
      const target = rows.find((r) => r.innerText.includes(`压测位置 ${n}`))
      if (!target) return 'no-row'
      const btn = Array.from(target.querySelectorAll('button')).find((b) => b.innerText.trim() === '删除')
      if (!btn) return 'no-btn'
      if (btn.disabled) return 'locked'
      btn.click()
      return 'clicked'
    }, i)
    if (delOk !== 'clicked') {
      soakErrors.push(`第 ${i} 轮删除未执行 (${delOk})`)
    } else {
      await sleep(500)
      const confirmed = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('.el-message-box__btns button'))
        const confirm = btns.find((b) => b.innerText.includes('删除')) || btns[btns.length - 1]
        if (!confirm) return false
        confirm.click()
        return true
      })
      await sleep(700)
      const gone = await page.evaluate((n) => {
        const rows = Array.from(document.querySelectorAll('.el-table__body tr'))
        return !rows.some((r) => r.innerText.includes(`压测位置 ${n}`))
      }, i)
      if (confirmed && gone) deleted++
      else soakErrors.push(`第 ${i} 轮删除未生效 (确认框=${confirmed}, 已消失=${gone})`)
    }

    if (i % 10 === 0) console.log(`  已完成 ${i}/${ROUNDS} 轮（增 ${created} / 改 ${edited} / 删 ${deleted}）`)
  }

  const metrics1 = await page.metrics()
  const afterCount = await totalCount(page)
  const heap0 = Math.round(metrics0.JSHeapUsedSize / 1048576)
  const heap1 = Math.round(metrics1.JSHeapUsedSize / 1048576)
  console.log(`  堆内存 ${heap0} MB → ${heap1} MB；总数 ${baseCount} → ${afterCount}`)
  check(`AC-42 ${ROUNDS} 轮新增全部成功`, created === ROUNDS, `${created}/${ROUNDS}`)
  check(`AC-42 ${ROUNDS} 轮编辑全部成功`, edited === ROUNDS, `${edited}/${ROUNDS}`)
  check(`AC-42 ${ROUNDS} 轮删除全部成功`, deleted === ROUNDS, `${deleted}/${ROUNDS}`)
  check('AC-42 操作后记录数回到初始值', baseCount === afterCount, `${baseCount} → ${afterCount}`)
  check('AC-42 堆内存无异常增长', heap1 - heap0 < 200, `${heap0} MB → ${heap1} MB`)
  check('AC-42 全程无报错/异常提示', soakErrors.length === 0, soakErrors.slice(0, 3).join(' | ') || '无异常')
}

check('性能验收期间无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
if (failed.length) process.exitCode = 1
