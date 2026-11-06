<template>
  <div class="layout">
    <aside class="side">
      <div class="brand">
        <div class="logo">工</div>
        <div class="brand-text">
          <strong>工程管理本地版</strong>
          <span>单机 · 数据不外传</span>
        </div>
      </div>
      <nav class="menu">
        <router-link v-for="m in menus" :key="m.path" :to="m.path" class="menu-item" :class="{ active: isActive(m.path) }">
          <el-icon><component :is="m.icon" /></el-icon>
          <span>{{ m.title }}</span>
          <em v-if="m.path === '/warning' && unread" class="badge">{{ unread > 99 ? '99+' : unread }}</em>
        </router-link>
      </nav>
      <div class="side-foot">
        <span class="dot" :class="storageOk ? 'ok' : 'warn'"></span>
        {{ storageText }}
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="crumb">
          <template v-for="(c, i) in crumbs" :key="c.title + i">
            <span v-if="i" class="crumb-sep">/</span>
            <router-link v-if="c.path && i < crumbs.length - 1" :to="c.path" class="crumb-link">{{ c.title }}</router-link>
            <span v-else class="crumb-cur">{{ c.title }}</span>
          </template>
        </div>
        <el-select v-model="projectId" placeholder="选择项目" size="default" style="width: 220px" @change="onProjectChange">
          <el-option v-for="p in app.projects" :key="p.id" :label="`${p.code} ${p.name}`" :value="p.id" />
        </el-select>
        <div class="search-box">
          <el-input v-model="keyword" placeholder="搜索全系统单据（回车）" clearable @keyup.enter="doSearch">
            <template #prefix><el-icon><Search /></el-icon></template>
          </el-input>
        </div>
        <div class="spacer"></div>
        <el-tooltip content="预警中心" placement="bottom">
          <el-badge :value="unread" :hidden="!unread" :max="99">
            <el-button :icon="Bell" circle @click="router.push('/warning')" />
          </el-badge>
        </el-tooltip>
        <el-dropdown @command="onCommand">
          <el-button text>
            <el-icon><Setting /></el-icon>
            <span style="margin-left: 4px">设置</span>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="settings">系统设置</el-dropdown-item>
              <el-dropdown-item command="export">台账导出中心</el-dropdown-item>
              <el-dropdown-item command="trash">回收站</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </header>

      <div v-if="!storageOk" class="banner">
        <el-icon><Warning /></el-icon>
        数据目录尚未授权，附件无法写入（台账数据仍可查看）。请点击
        <el-link type="primary" @click="reauth">重新授权</el-link>
        或到设置页选择本地文件夹。
      </div>

      <main class="content">
        <!-- 不做 keep-alive：列表/看板都是聚合数据，任何页面改动后返回都应看到最新值 -->
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Bell, Search, Setting, Warning, House, Files, TrendCharts, Tickets, Money, CircleCheck, Box, Document, User, AlarmClock, Delete, Download } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { warningSummary } from '@/core/services/warning'
import { currentBackend, dirAuthorized, reauthorize, storageSupported } from '@/core/services/attachment'
import { settingGet } from '@/core/db/repo'
import { buildCrumbs } from '@/core/docs/crumbs'

const route = useRoute()
const router = useRouter()
const app = useAppStore()

const menus = [
  { path: '/dashboard', title: '首页看板', icon: House },
  { path: '/project', title: '项目与 WBS', icon: Files },
  { path: '/progress', title: '进度管理', icon: TrendCharts },
  { path: '/contract', title: '合同 · 签证 · 结算', icon: Tickets },
  { path: '/cost', title: '成本管理', icon: Money },
  { path: '/quality', title: '质量安全', icon: CircleCheck },
  { path: '/material', title: '物资设备', icon: Box },
  { path: '/document', title: '文档图纸', icon: Document },
  { path: '/labor', title: '劳务管理', icon: User },
  { path: '/warning', title: '预警汇总', icon: AlarmClock },
  { path: '/trash', title: '回收站', icon: Delete },
  { path: '/export', title: '台账导出中心', icon: Download }
]

const keyword = ref('')
const unread = ref(0)
const projectId = ref(app.currentProjectId)
const storageOk = ref(true)

/** 面包屑：首页仪表盘 / 一级菜单 / 标签页（PRD §2.5） */
const crumbs = computed(() => buildCrumbs(String(route.meta.title || ''), route.path, route.query.tab as string | undefined))

const storageText = computed(() => {
  const b = currentBackend()
  return b === 'dir' ? '本地文件夹模式' : b === 'opfs' ? '浏览器存储模式' : '内置存储模式'
})

function isActive(path: string) {
  return route.path === path
}

function onProjectChange(id: string) {
  app.switchProject(id)
  router.go(0)
}

function doSearch() {
  const q = keyword.value.trim()
  router.push({ path: '/search', query: q ? { q } : {} })
}

function onCommand(cmd: string) {
  router.push(`/${cmd}`)
}

async function reauth() {
  const ok = await reauthorize()
  storageOk.value = ok || !storageSupported().dir || true
  if (!ok) router.push('/settings')
}

async function refreshBadge() {
  try {
    const s = await warningSummary({ projectId: app.currentProjectId || null })
    unread.value = s.unread
  } catch {
    unread.value = 0
  }
}

onMounted(async () => {
  await app.loadProjects()
  projectId.value = app.currentProjectId
  try {
    await settingGet('storageAck', false)
    storageOk.value = currentBackend() === 'dir' || !storageSupported().dir || dirAuthorized() || (await settingGet('storageAck', false))
  } catch {
    storageOk.value = true
  }
  await refreshBadge()
})

watch(() => app.currentProjectId, (v) => (projectId.value = v))
watch(() => route.path, refreshBadge)
</script>

<style scoped>
.layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.side {
  width: 208px;
  flex: 0 0 208px;
  background: #fff;
  border-right: 1px solid var(--gmp-border);
  display: flex;
  flex-direction: column;
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--gmp-border);
}

.logo {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--gmp-primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 500;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.brand-text strong {
  font-size: 14px;
  font-weight: 500;
}

.brand-text span {
  font-size: 11px;
  color: var(--gmp-text-3);
}

.menu {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 6px;
  color: var(--gmp-text-2);
  font-size: 13px;
  margin-bottom: 2px;
  position: relative;
}

.menu-item:hover {
  background: #f2f3f5;
}

.menu-item.active {
  background: var(--gmp-primary-light);
  color: var(--gmp-primary);
  font-weight: 500;
}

.badge {
  margin-left: auto;
  background: var(--gmp-danger);
  color: #fff;
  font-size: 11px;
  font-style: normal;
  border-radius: 9px;
  padding: 0 5px;
  line-height: 16px;
}

.side-foot {
  padding: 10px 16px;
  border-top: 1px solid var(--gmp-border);
  font-size: 12px;
  color: var(--gmp-text-3);
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--gmp-success);
}

.dot.warn {
  background: var(--gmp-warning);
}

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.topbar {
  height: 56px;
  flex: 0 0 56px;
  background: #fff;
  border-bottom: 1px solid var(--gmp-border);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
}

.crumb {
  font-size: 14px;
  font-weight: 500;
  min-width: 130px;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.crumb-sep {
  color: var(--gmp-text-3, #c0c4cc);
}

.crumb-link {
  color: var(--gmp-text-2, #606266);
  text-decoration: none;
}

.crumb-link:hover {
  color: var(--el-color-primary);
}

.crumb-cur {
  color: var(--gmp-text-1, #303133);
  font-weight: 600;
}

.search-box {
  width: 320px;
}

.spacer {
  flex: 1;
}

.banner {
  background: #fff7e8;
  border-bottom: 1px solid #ffd591;
  color: #ad4e00;
  padding: 8px 16px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}
</style>
