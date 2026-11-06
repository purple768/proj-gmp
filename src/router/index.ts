import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

/** 带左侧菜单 + 顶部栏的页面，统一挂在 Layout 下 */
const shellChildren: RouteRecordRaw[] = [
  { path: '', redirect: '/dashboard' },
  { path: 'dashboard', component: () => import('@/views/dashboard/index.vue'), meta: { title: '首页看板' } },
  { path: 'project', component: () => import('@/views/project/index.vue'), meta: { title: '项目与 WBS' } },
  { path: 'progress', component: () => import('@/views/progress/index.vue'), meta: { title: '进度管理' } },
  { path: 'contract', component: () => import('@/views/contract/index.vue'), meta: { title: '合同 · 签证 · 结算' } },
  { path: 'cost', component: () => import('@/views/cost/index.vue'), meta: { title: '成本管理' } },
  { path: 'quality', component: () => import('@/views/quality/index.vue'), meta: { title: '质量安全' } },
  { path: 'material', component: () => import('@/views/material/index.vue'), meta: { title: '物资设备' } },
  { path: 'document', component: () => import('@/views/document/index.vue'), meta: { title: '文档图纸' } },
  { path: 'labor', component: () => import('@/views/labor/index.vue'), meta: { title: '劳务管理' } },
  { path: 'warning', component: () => import('@/views/warning/index.vue'), meta: { title: '预警汇总' } },
  { path: 'trash', component: () => import('@/views/trash/index.vue'), meta: { title: '回收站' } },
  { path: 'export', component: () => import('@/views/export/index.vue'), meta: { title: '台账导出中心' } },
  { path: 'search', component: () => import('@/views/search/index.vue'), meta: { title: '全局搜索' } },
  { path: 'settings', component: () => import('@/views/settings/index.vue'), meta: { title: '系统设置' } }
]

const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('@/layout/index.vue'), children: shellChildren },
  // 打印页不带壳，只输出 A4 版式
  { path: '/print/:docType/:id', component: () => import('@/views/print/index.vue'), meta: { title: '打印', plain: true } }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

router.afterEach((to) => {
  document.title = `${to.meta.title || '工程管理'} · 工程管理本地版`
})

export default router
