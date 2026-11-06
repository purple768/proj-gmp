import puppeteer from 'puppeteer-core'
import fs from 'node:fs'
import path from 'node:path'
import { clickButton, fillByLabel, fillDate, pickSelect, rowTexts, saveDialog, sleep } from '../lib/e2e-helpers.mjs'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:3100'
const EDGE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
].find((p) => fs.existsSync(p))

const DOWNLOAD_DIR = path.resolve('.downloads')
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })
// 清空上次残留：否则「文件存在」会被旧文件误判为本次导出成功
for (const f of fs.readdirSync(DOWNLOAD_DIR)) fs.unlinkSync(path.join(DOWNLOAD_DIR, f))
fs.mkdirSync('.shots', { recursive: true })

/** 轮询等待下载目录出现指定后缀的文件，返回文件名或 null */
async function waitFile(ext, timeout = 15000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const hit = fs.readdirSync(DOWNLOAD_DIR).find((f) => f.endsWith(ext) && !f.endsWith('.crdownload'))
    if (hit) return hit
    await sleep(250)
  }
  return null
}

const results = []
const errors = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox', '--window-size=1440,900'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
const client = await page.target().createCDPSession()
await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOAD_DIR })

// 1. 新建签证单，验证合价自动计算
await page.goto(`${BASE}/#/contract?tab=visa`, { waitUntil: 'networkidle2' })
await sleep(1200)
const beforeVisa = await page.$$eval('.el-table__body tr', (r) => r.length)
const codesBefore = await page.$$eval('.el-table__body tr', (rs) => rs.map((r) => (r.innerText.match(/QZ-\d{8}-\d+/) || [''])[0]))
await clickButton(page, '新增')
await sleep(800)
await pickSelect(page, '合同', 0)
await pickSelect(page, 'WBS', 0)
const reasonOk = await fillByLabel(page, '签证事由', '夜间施工增加费')
const contentOk = await fillByLabel(page, '工作内容', '因交通导改需夜间施工，增加照明与人工看护')
const qtyOk = await fillByLabel(page, '工程量', '2')
const priceOk = await fillByLabel(page, '单价', '100')
await fillDate(page, '签证日期', '2026-12-01')
check('签证单必填项可填写', reasonOk && contentOk && qtyOk && priceOk, `${reasonOk}/${contentOk}/${qtyOk}/${priceOk}`)
const saved = await saveDialog(page)
const msg = saved.messages.join('；')
const afterVisa = await page.$$eval('.el-table__body tr', (r) => r.length)
check('签证单保存成功', saved.closed && afterVisa > beforeVisa, `前 ${beforeVisa} 后 ${afterVisa} ${msg}`)

const hasTotal = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.el-table__body tr'))
  return rows.some((r) => r.innerText.includes('200.00'))
})
check('合价按 工程量×单价 自动算出 200.00', hasTotal)
await page.screenshot({ path: path.join('.shots', '10-visa.png') })

// 2. 锁单矩阵：种子签证单为「已确认」，删除按钮应被禁用（不可绕过锁定）
const lockState = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.el-table__body tr'))
  const seeded = rows.find((r) => !r.innerText.includes('夜间施工增加费'))
  if (!seeded) return null
  const del = Array.from(seeded.querySelectorAll('button')).find((b) => b.innerText.trim() === '删除')
  return { disabled: !!del?.disabled }
})
check('已确认签证单删除按钮被锁定', !!lockState?.disabled, JSON.stringify(lockState))

// 3. 删除 → 回收站 → 恢复（只针对本次新建的「待确认」单据，按编号精确定位）
const codesAfterCreate = await page.$$eval('.el-table__body tr', (rs) => rs.map((r) => (r.innerText.match(/QZ-\d{8}-\d+/) || [''])[0]))
const newCode = codesAfterCreate.find((c) => c && !codesBefore.includes(c))
check('新建签证单已取号', !!newCode, newCode || '未找到新编号')

const newRowText = (await rowTexts(page)).find((t) => newCode && t.includes(newCode)) || ''
check('签证日期按输入保存（日期控件已写入模型）', newRowText.includes('2026-12-01'), newRowText.split('\n').filter(Boolean).slice(0, 6).join(' | '))

const clickedDelete = await page.evaluate((code) => {
  const rows = Array.from(document.querySelectorAll('.el-table__body tr'))
  const target = rows.find((r) => code && r.innerText.includes(code))
  if (!target) return false
  const btn = Array.from(target.querySelectorAll('button')).find((b) => b.innerText.trim() === '删除')
  if (btn) {
    btn.click()
    return true
  }
  return false
}, newCode)
await sleep(700)
const boxAppeared = await page.evaluate(() => !!document.querySelector('.el-message-box'))
check('删除前弹出确认框', clickedDelete && boxAppeared, `clicked=${clickedDelete} box=${boxAppeared}`)
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('.el-message-box__btns button'))
  const confirm = btns.find((b) => b.innerText.includes('删除')) || btns[btns.length - 1]
  confirm?.click()
})
await sleep(1400)
const listAfterDelete = await page.$$eval('.el-table__body tr', (rs) => rs.map((r) => r.innerText))
check('删除后从列表移除（软删除）', !listAfterDelete.some((t) => t.includes(newCode)), `${afterVisa} → ${listAfterDelete.length} 行`)

await page.goto(`${BASE}/#/trash`, { waitUntil: 'networkidle2' })
await sleep(1000)
const trashRows = await page.$$eval('.el-table__body tr', (rs) => rs.map((r) => r.innerText))
check('回收站可见被删单据', trashRows.some((t) => t.includes(newCode)), `${trashRows.length} 条`)

const restoredClick = await page.evaluate((code) => {
  const rows = Array.from(document.querySelectorAll('.el-table__body tr'))
  const target = rows.find((r) => r.innerText.includes(code))
  if (!target) return false
  const btn = Array.from(target.querySelectorAll('button')).find((b) => b.innerText.includes('恢复'))
  if (!btn) return false
  btn.click()
  return true
}, newCode)
await sleep(1400)
const trashAfter = await page.$$eval('.el-table__body tr', (rs) => rs.map((r) => r.innerText))
check('回收站恢复成功', restoredClick && !trashAfter.some((t) => t.includes(newCode)), `${trashRows.length} → ${trashAfter.length} 条`)

await page.goto(`${BASE}/#/contract?tab=visa`, { waitUntil: 'networkidle2' })
await sleep(1000)
const listRestored = await page.$$eval('.el-table__body tr', (rs) => rs.map((r) => r.innerText))
check('恢复后回到原模块列表且编号不变', listRestored.some((t) => t.includes(newCode)), `${listRestored.length} 行，编号 ${newCode}`)

// 3. AC-06：刷新页面后数据仍在（IndexedDB 持久化）
await page.reload({ waitUntil: 'networkidle2' })
await sleep(1400)
const afterReload = await page.$$eval('.el-table__body tr', (rs) => rs.map((r) => r.innerText))
check('刷新后单据仍在（数据持久化）', afterReload.some((t) => t.includes(newCode)), `${afterReload.length} 行`)

// 4. AC-12 / AC-14：首页卡片数值与下钻后列表条数一致
await page.goto(`${BASE}/#/dashboard`, { waitUntil: 'networkidle2' })
await sleep(1500)
const cardInfo = await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll('.stat')).find((el) => el.innerText.includes('未闭环隐患'))
  if (!card) return null
  return { value: Number((card.innerText.match(/(\d+)/) || [0, 0])[1]) }
})
check('首页「未闭环隐患」卡片有数值', !!cardInfo, JSON.stringify(cardInfo))
await page.evaluate(() => {
  const card = Array.from(document.querySelectorAll('.stat')).find((el) => el.innerText.includes('未闭环隐患'))
  card?.click()
})
await sleep(1600)
const drill = await page.evaluate(() => ({
  total: Number((document.querySelector('.pager .muted')?.innerText.match(/\d+/) || [0])[0]),
  chips: Array.from(document.querySelectorAll('.toolbar .el-tag')).map((t) => t.innerText.trim()),
  url: location.hash
}))
check('下钻后列表条数与卡片一致（AC-14）', cardInfo && drill.total === cardInfo.value, `卡片 ${cardInfo?.value} / 列表 ${drill.total}，${drill.url}`)
check('下钻自动带上「未闭环」状态筛选', drill.chips.length > 0 && !drill.chips.includes('合格闭环'), drill.chips.join('、') || '无筛选')

// 5. AC-23：搜索结果点击先确认是否跳转
await page.goto(`${BASE}/#/search?q=%E9%9A%90%E6%82%A3`, { waitUntil: 'networkidle2' })
await sleep(1800)
const hits = await page.$$eval('.hit', (rs) => rs.length)
if (hits > 0) {
  await page.evaluate(() => document.querySelector('.hit .el-button')?.click())
  await sleep(700)
  const boxText = await page.$eval('.el-message-box', (el) => el.innerText).catch(() => '')
  check('搜索点开先询问是否跳转（AC-23）', boxText.includes('是否跳转'), boxText.replace(/\n/g, ' ').slice(0, 60))
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.el-message-box__btns button')).find((b) => b.innerText.includes('留在本页'))
    btn?.click()
  })
  await sleep(500)
  const stayed = await page.evaluate(() => location.hash.includes('/search'))
  check('选「留在本页」不跳转', stayed, await page.evaluate(() => location.hash))
} else {
  check('搜索点开先询问是否跳转（AC-23）', false, '搜索无结果，无法验证')
  check('选「留在本页」不跳转', false, '搜索无结果')
}

// 6. AC-17：不合格检验批 → 一键建缺陷单
await page.goto(`${BASE}/#/quality?tab=inspection`, { waitUntil: 'networkidle2' })
await sleep(1200)
await clickButton(page, '新增')
await sleep(700)
await pickSelect(page, 'WBS', 0)
await fillByLabel(page, '分项工程', '钢筋工程')
await fillByLabel(page, '验收部位', '3号楼 二层顶板')
await fillDate(page, '验收日期', '2026-11-08')
await pickSelect(page, '验收结果', 1) // 合格 / 不合格 → 选第 2 个
const savedInsp = await saveDialog(page)
check('不合格检验批保存成功', savedInsp.closed, savedInsp.fieldErrors.join('/') || savedInsp.messages.join('/') || '已保存')
await sleep(600)
const defectClick = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('.el-table__body tr'))
  const target = rows.find((r) => r.innerText.includes('不合格'))
  if (!target) return 'no-row'
  const btn = Array.from(target.querySelectorAll('button')).find((b) => b.innerText.includes('建缺陷单'))
  if (!btn) return 'no-btn'
  btn.click()
  return 'clicked'
})
await sleep(1600)
const defectMsg = await page.evaluate(() => Array.from(document.querySelectorAll('.el-message')).map((m) => m.innerText).join('；'))
check('一键建缺陷单成功', defectClick === 'clicked' && /已生成缺陷整改单/.test(defectMsg), `${defectClick} / ${defectMsg}`)
await page.goto(`${BASE}/#/quality?tab=defect`, { waitUntil: 'networkidle2' })
await sleep(1200)
const defectRows = await page.$$eval('.el-table__body tr', (rs) => rs.map((r) => r.innerText))
check('缺陷单出现在质量缺陷列表且带来源单号', defectRows.some((t) => t.includes('JYP-')), `${defectRows.length} 行`)

// 7. 台账导出中心生成 Excel
await page.goto(`${BASE}/#/export`, { waitUntil: 'networkidle2' })
await sleep(1000)
await clickButton(page, '生成 Excel')
const xlsx = await waitFile('.xlsx')
const exportMsg = await page.evaluate(() => Array.from(document.querySelectorAll('.el-message')).map((m) => m.innerText).join('；'))
check('台账导出成功并落盘 xlsx', !!xlsx, `${exportMsg || '无提示'} / ${xlsx || '未生成文件'}`)

// 8. 备份导出
await page.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle2' })
await sleep(1400)
await clickButton(page, '导出整包备份')
const zip = await waitFile('.zip', 30000)
const backupMsg = await page.evaluate(() => Array.from(document.querySelectorAll('.el-message')).map((m) => m.innerText).join('；'))
check('备份导出生成 zip', !!zip, `${backupMsg || '无提示'} / ${zip || '未生成文件'}`)

// 5. 预警页打开来源单据抽屉
await page.goto(`${BASE}/#/warning`, { waitUntil: 'networkidle2' })
await sleep(1200)
const warnRows = await page.$$eval('.el-table__body tr', (r) => r.length)
if (warnRows > 0) {
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.el-table__body button')).find((b) => b.innerText.includes('YH'))
    if (btn) btn.click()
  })
  await sleep(900)
  const drawer = await page.$eval('.el-drawer', (el) => el.innerText).catch(() => '')
  check('预警可打开来源单据', drawer.length > 0, drawer.slice(0, 40).replace(/\n/g, ' '))
} else {
  check('预警可打开来源单据', true, '当前无预警，跳过')
}

check('关键流程无控制台错误', errors.length === 0, errors.slice(0, 2).join(' | '))

await browser.close()
const failed = results.filter((r) => !r.ok)
console.log(`\n合计 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length}`)
if (failed.length) process.exitCode = 1
