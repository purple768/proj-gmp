import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import App from './App.vue'
import router from './router'
import { openDb } from '@/core/db'
import { initStorage } from '@/core/services/attachment'
import { cleanupExpired } from '@/core/services/trash'
import { cleanupOldReads } from '@/core/services/warning'
import { ensureSeed } from '@/core/services/seed'
import './styles/main.css'

async function boot() {
  await openDb()
  await initStorage()
  try {
    await ensureSeed()
  } catch (e) {
    console.warn('初始化演示数据失败', e)
  }
  try {
    const res = await cleanupExpired()
    if (res.removed) console.info(`回收站已清理 ${res.removed} 条到期记录`)
    await cleanupOldReads()
  } catch (e) {
    console.warn('回收站清理失败', e)
  }

  if (import.meta.env.DEV) (window as any).__gmpDb = (await import('@/core/db')).db
  const app = createApp(App)
  for (const [key, comp] of Object.entries(ElementPlusIconsVue)) app.component(key, comp as any)
  app.use(createPinia())
  app.use(router)
  app.use(ElementPlus, { locale: zhCn })
  app.mount('#app')
}

boot()
