import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100'
const OUT = path.resolve('.shots')
fs.mkdirSync(OUT, { recursive: true })

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
]

function findBrowser() {
  for (const p of EDGE_CANDIDATES) if (fs.existsSync(p)) return p
  throw new Error('未找到 Edge/Chrome')
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const consoleErrors = []

const run = async () => {
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900']
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message))

  await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle2' })
  await sleep(1500)

  const title = await page.title()
  check('应用启动并渲染标题', /工程管理/.test(title), title)

  const cards = await page.$$eval('.stat', (els) => els.length)
  check('首页 8 张指标卡渲染', cards === 8, `实际 ${cards}`)

  const charts = await page.$$eval('.chart svg', (els) => els.length)
  check('首页两个图表渲染为 SVG', charts >= 2, `SVG ${charts} 个`)

  const todayText = await page.$eval('.today-head', (el) => el.innerText)
  check('今日计划横幅显示计数', /今日待办/.test(todayText), todayText.replace(/\n/g, ' '))

  await page.screenshot({ path: path.join(OUT, '01-dashboard.png'), fullPage: false })

  const routes = [
    ['/#/project', '项目'],
    ['/#/project?tab=wbs', 'WBS'],
    ['/#/progress', '进度'],
    ['/#/contract?tab=visa', '签证'],
    ['/#/cost?tab=four', '四算'],
    ['/#/quality?tab=hazard', '隐患'],
    ['/#/material?tab=balance', '库存'],
    ['/#/document?tab=drawing', '图纸'],
    ['/#/labor?tab=team', '班组'],
    ['/#/warning', '预警'],
    ['/#/trash', '回收站'],
    ['/#/export', '台账导出中心'],
    ['/#/settings', '数据目录']
  ]

  for (const [route, keyword] of routes) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2' })
    await sleep(700)
    const text = await page.evaluate(() => document.body.innerText)
    const ok = text.includes(keyword) && text.length > 50
    check(`页面可打开 ${route}`, ok, ok ? '' : `未见「${keyword}」`)
  }

  // 面包屑：首页仪表盘 / 一级菜单 / 标签页（PRD §2.5、AC-01）
  const crumbCases = [
    ['/#/quality?tab=hazard', '首页仪表盘 / 质量安全 / 隐患排查复查'],
    ['/#/material?tab=balance', '首页仪表盘 / 物资设备 / 库存汇总'],
    ['/#/progress', '首页仪表盘 / 进度管理']
  ]
  for (const [route, expect] of crumbCases) {
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2' })
    await sleep(700)
    const crumb = await page.$eval('.crumb', (el) => el.innerText.replace(/\s*\/\s*/g, ' / ').trim()).catch(() => '')
    check(`面包屑正确 ${route}`, crumb === expect, JSON.stringify(crumb))
  }

  await page.goto(`${BASE}/#/quality?tab=hazard`, { waitUntil: 'networkidle2' })
  await sleep(900)
  const beforeRows = await page.$$eval('.el-table__body tr', (r) => r.length)
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'))
    const b = btns.find((x) => x.innerText.includes('新增'))
    if (b) b.click()
  })
  await sleep(800)

  const filled = await page.evaluate(() => {
    const dlg = document.querySelector('.el-dialog')
    if (!dlg) return { ok: false, reason: 'no dialog' }
    const items = Array.from(dlg.querySelectorAll('.el-form-item'))
    const setVal = (el, v) => {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const byLabel = (t) =>
      items.find((i) => (i.querySelector('.el-form-item__label')?.innerText || '').includes(t))
    const fill = (label, value) => {
      const item = byLabel(label)
      if (!item) return false
      const el = item.querySelector('textarea, input')
      if (!el) return false
      setVal(el, value)
      return true
    }
    const a = fill('隐患位置', 'K1+300 基坑东侧')
    const b = fill('隐患描述', '基坑东侧未设置防护栏杆，夜间照明不足')
    const c = fill('整改要求', '立即设置防护栏杆并挂设警示标牌，班前教育后复查')
    return { ok: a && b && c, reason: `位置${a} 描述${b} 要求${c}` }
  })
  check('新增隐患弹窗可打开并填写', filled.ok, filled.reason || '')

  if (filled.ok) {
    await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog')
      const items = Array.from(dlg.querySelectorAll('.el-form-item'))
      const item = items.find((i) => (i.querySelector('.el-form-item__label')?.innerText || '').includes('限期整改日期'))
      const input = item?.querySelector('input')
      if (input) {
        input.focus()
        input.click()
      }
    })
    await sleep(300)
    await page.keyboard.type('2026-12-20')
    await page.keyboard.press('Enter')
    await sleep(300)
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('.el-dialog__footer button'))
      const b = btns.find((x) => x.innerText.includes('保存'))
      if (b) b.click()
    })
    await sleep(1200)
    const msg = await page.evaluate(() => {
      const m = document.querySelector('.el-message')
      return m ? m.innerText : ''
    })
    const afterRows = await page.$$eval('.el-table__body tr', (r) => r.length)
    check('保存隐患单成功（表格行数增加）', afterRows >= beforeRows, `前 ${beforeRows} 后 ${afterRows} ${msg}`)
    await page.screenshot({ path: path.join(OUT, '02-hazard-saved.png') })
  }

  await page.goto(`${BASE}/#/search?q=${encodeURIComponent('隐患')}`, { waitUntil: 'networkidle2' })
  await sleep(1200)
  const hits = await page.$$eval('.hit', (els) => els.length)
  check('全局搜索返回结果', hits > 0, `命中 ${hits} 条`)
  await page.screenshot({ path: path.join(OUT, '03-search.png') })

  await page.goto(`${BASE}/#/print/hazard/${await firstHazardId(page)}`, { waitUntil: 'networkidle2' })
  await sleep(900)
  const printTitle = await page.$eval('.sheet-title', (el) => el.innerText).catch(() => '')
  check('单据打印页渲染 A4 版式', printTitle.includes('隐患'), printTitle)
  await page.screenshot({ path: path.join(OUT, '04-print.png'), fullPage: true })

  check('控制台无报错', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '))

  await browser.close()

  const failed = results.filter((r) => !r.ok)
  console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
  if (failed.length) process.exitCode = 1
}

async function firstHazardId(page) {
  return await page.evaluate(async () => {
    const db = window.__gmpDb
    if (db) {
      const rows = await db.table('hazards').toArray()
      if (rows.length) return rows[0].id
    }
    return 'missing'
  })
}

run().catch((e) => {
  console.error('E2E 运行失败：', e)
  process.exit(1)
})
