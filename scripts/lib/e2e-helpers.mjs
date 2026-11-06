/** E2E 公共交互工具（Puppeteer + Element Plus） */

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** 按 label 定位 el-form-item 内的输入框并写值（原生 setter + input/change，兼容 v-model） */
export async function fillByLabel(page, label, value) {
  return page.evaluate(
    ({ label, value }) => {
      const dlg = document.querySelector('.el-dialog')
      if (!dlg) return false
      const items = Array.from(dlg.querySelectorAll('.el-form-item'))
      const item = items.find((i) => (i.querySelector('.el-form-item__label')?.innerText || '').replace('*', '').includes(label))
      if (!item) return false
      const el = item.querySelector('textarea, input')
      if (!el) return false
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value))
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return true
    },
    { label, value }
  )
}

/**
 * 日期控件写值。
 * 注意：不能用 page.keyboard.type —— el-date-picker 打开面板后键盘事件不落到输入框，
 * 模型不会更新（表现为「必填日期为空」）。这里走原生 setter + Enter 提交。
 */
export async function fillDate(page, label, date) {
  return page.evaluate(
    ({ label, date }) => {
      const dlg = document.querySelector('.el-dialog')
      if (!dlg) return false
      const items = Array.from(dlg.querySelectorAll('.el-form-item'))
      const item = items.find((i) => (i.querySelector('.el-form-item__label')?.innerText || '').replace('*', '').includes(label))
      const el = item?.querySelector('input')
      if (!el) return false
      el.focus()
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, date)
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true }))
      return true
    },
    { label, date }
  )
}

/** 打开 el-select 并选第 index 个可见选项 */
export async function pickSelect(page, label, index = 0) {
  const ok = await page.evaluate((label) => {
    const dlg = document.querySelector('.el-dialog')
    const items = Array.from(dlg.querySelectorAll('.el-form-item'))
    const item = items.find((i) => (i.querySelector('.el-form-item__label')?.innerText || '').replace('*', '').includes(label))
    const input = item?.querySelector('input')
    if (!input) return false
    input.click()
    return true
  }, label)
  if (!ok) return false
  await sleep(400)
  await page.evaluate((index) => {
    const opts = Array.from(document.querySelectorAll('.el-select-dropdown__item')).filter((o) => o.offsetParent)
    if (opts[index]) opts[index].click()
  }, index)
  await sleep(300)
  return true
}

/** 点击包含指定文字的按钮 */
export async function clickButton(page, text, scope = 'body') {
  return page.evaluate(
    ({ text, scope }) => {
      const root = document.querySelector(scope) || document.body
      const btn = Array.from(root.querySelectorAll('button')).find((b) => b.innerText.trim().includes(text))
      if (btn) {
        btn.click()
        return true
      }
      return false
    },
    { text, scope }
  )
}

/** 等待弹窗真正可见且「保存」可点 */
async function waitDialogReady(page, timeout = 5000) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeout) {
    const ready = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog')
      const ov = dlg?.closest('.el-overlay')
      if (!dlg || !ov || getComputedStyle(ov).display === 'none') return false
      const btn = Array.from(document.querySelectorAll('.el-dialog__footer button')).find((b) => b.innerText.trim() === '保存')
      return !!btn && !btn.disabled
    })
    if (ready) return true
    await sleep(100)
  }
  return false
}

/**
 * 点保存并返回结果。
 * 注意：不能用固定 sleep —— 5 万条数据下保存+重载列表需要上百毫秒到数秒，
 * 固定等待会把「已保存」误判成「未关闭」。这里轮询到出现终态为止。
 */
export async function saveDialog(page, timeout = 10000) {
  await waitDialogReady(page)
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('.el-dialog__footer button')).find((b) => b.innerText.trim() === '保存')
    btn?.click()
  })
  const t0 = Date.now()
  let last = { closed: false, messages: [], fieldErrors: [] }
  while (Date.now() - t0 < timeout) {
    await sleep(120)
    last = await page.evaluate(() => {
      const dlg = document.querySelector('.el-dialog')
      const overlay = dlg?.closest('.el-overlay')
      const closed = !overlay || getComputedStyle(overlay).display === 'none'
      return {
        closed,
        messages: Array.from(document.querySelectorAll('.el-message')).map((m) => m.innerText.trim()),
        fieldErrors: Array.from(document.querySelectorAll('.el-form-item__error')).map((e) => e.innerText.trim())
      }
    })
    if (last.closed) return last
    if (last.fieldErrors.length) return last
  }
  return last
}

/** 表格所有行的文本 */
export async function rowTexts(page) {
  return page.$$eval('.el-table__body tr', (rs) => rs.map((r) => r.innerText))
}

/** 分页总数（共 N 条） */
export async function totalCount(page) {
  return page.$eval('.pager .muted', (el) => Number((el.innerText.match(/\d+/) || [0])[0])).catch(() => 0)
}
