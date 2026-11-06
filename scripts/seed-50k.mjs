/**
 * 数据工厂 CLI：往本地 IndexedDB 写入大批量演示单据
 *
 *   node scripts/seed-50k.mjs                 # 默认 50000 条
 *   node scripts/seed-50k.mjs --count 20000   # 自定义条数
 *   node scripts/seed-50k.mjs --clean         # 只清理（不写入）
 *
 * 注意：无头浏览器使用临时用户目录，写入的数据在浏览器关闭后即丢弃；
 * 本脚本主要用于「压测数据 + 手动打开浏览器观察」或配合 perf.mjs 使用。
 */
import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import { cleanSeed, countTables, insertRows, makeRows, planCounts, readContext, SEED_BATCH } from './lib/perf-data.mjs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100'
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find((p) => fs.existsSync(p))

const argv = process.argv.slice(2)
const flag = (n) => argv.includes(`--${n}`)
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d
}

const total = Number(opt('count', 50000))
const cleanOnly = flag('clean')
const tables = ['hazards', 'expenses', 'inspections', 'attendances']

if (!EDGE) {
  console.error('未找到可用的 Edge/Chrome 可执行文件')
  process.exit(1)
}

const t0 = Date.now()
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle2' })
await page.waitForFunction(() => !!window.__gmpDb, { timeout: 20000 })

const before = await countTables(page, tables)
console.log('写入前:', JSON.stringify(before))

if (cleanOnly) {
  const removed = await cleanSeed(page, tables)
  console.log('已清理:', JSON.stringify(removed))
} else {
  const removed = await cleanSeed(page, tables)
  if (Object.values(removed).some((n) => n)) console.log('已清理旧压测数据:', JSON.stringify(removed))

  const ctx = await readContext(page)
  if (!ctx.projects.length) {
    console.error('数据库中没有项目，无法生成业务数据（首次启动应已自动写入演示项目）')
    await browser.close()
    process.exit(1)
  }
  console.log(`项目 ${ctx.projects.length} 个 / WBS ${ctx.wbs.length} 个 / 班组 ${ctx.teams.length} 个`)

  const counts = planCounts(total)
  let seed = 1
  for (const [table, n] of Object.entries(counts)) {
    if (!n) continue
    const rows = makeRows(table, n, ctx, seed++)
    const started = Date.now()
    await insertRows(page, table, rows)
    console.log(`  ${table.padEnd(14)} +${n} 条  ${Date.now() - started} ms`)
  }
}

const after = await countTables(page, tables)
const sum = Object.values(after).reduce((s, n) => s + n, 0)
console.log('写入后:', JSON.stringify(after), `合计 ${sum} 条`)
console.log(`标记：seedBatch="${SEED_BATCH}"，用 --clean 可整批清理`)
console.log(`总耗时 ${Date.now() - t0} ms`)

await browser.close()
