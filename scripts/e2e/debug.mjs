import puppeteer from 'puppeteer-core'
import fs from 'node:fs'

const BASE = 'http://127.0.0.1:3100'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900 })
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
})
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')))

for (const route of ['/#/settings', '/#/export', '/#/search?q=隐患']) {
  errors.length = 0
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle2' })
  await sleep(1800)
  const info = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 300).replace(/\n/g, ' | '),
    hasApp: !!document.querySelector('#app')?.children.length,
    hits: document.querySelectorAll('.hit').length
  }))
  console.log('\n=== ' + route)
  console.log('text:', info.text)
  console.log('appChildren:', info.hasApp, 'hits:', info.hits)
  console.log('errors:', errors.slice(0, 3).join('\n') || 'none')
  await page.screenshot({ path: '.shots/dbg-' + route.replace(/[^a-z]/gi, '') + '.png' })
}
await browser.close()
