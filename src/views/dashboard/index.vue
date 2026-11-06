<template>
  <div class="page">
    <div class="today card" v-loading="loading">
      <div class="today-head">
        <div class="today-title">
          <el-icon color="#165dff"><Calendar /></el-icon>
          <strong>今日计划</strong>
          <span class="today-count">今日待办 {{ today.todoCount }} 项 · 逾期 <b :class="{ 'text-danger': today.overdueCount > 0 }">{{ today.overdueCount }}</b> 项</span>
        </div>
        <div class="today-actions">
          <el-input v-model="newTodo" size="small" placeholder="添加临时待办（回车保存）" style="width: 220px" @keyup.enter="addTodoItem" />
          <el-button size="small" text type="primary" @click="expand = !expand">{{ expand ? '收起' : '展开' }}</el-button>
        </div>
      </div>
      <div v-if="expand" class="today-list">
        <div v-for="it in today.items" :key="it.id" class="today-row" :class="{ overdue: it.overdue }">
          <el-tag size="small" :type="it.overdue ? 'danger' : 'info'">{{ it.kind }}</el-tag>
          <span class="row-text" @click="goto(it)">{{ it.title }}</span>
          <span v-if="it.manual">
            <el-button link type="primary" size="small" @click="doneTodo(it)">完成</el-button>
          </span>
          <span v-if="it.overdue" class="text-danger">逾期 {{ it.overdueDays }} 天</span>
        </div>
        <div v-if="!today.items.length" class="muted">今天没有待办，保持！</div>
      </div>
    </div>

    <div class="card">
      <div class="toolbar">
        <h3 class="card-title" style="margin: 0">关键指标</h3>
        <div class="spacer"></div>
        <el-popover placement="bottom-end" width="260" trigger="click">
          <template #reference>
            <el-button size="small" :icon="Setting">卡片配置</el-button>
          </template>
          <div class="cfg-list">
            <div v-for="c in cardConfig" :key="c.key" class="cfg-row">
              <el-checkbox v-model="c.visible">{{ cardMeta[c.key].label }}</el-checkbox>
            </div>
            <el-button size="small" text type="primary" @click="resetConfig">恢复默认布局</el-button>
          </div>
        </el-popover>
      </div>
      <div class="stat-grid">
        <div
          v-for="c in visibleCards"
          :key="c.key"
          class="stat"
          draggable="true"
          @dragstart="dragKey = c.key"
          @dragover.prevent
          @drop="onDrop(c.key)"
          @click="drill(c.key)"
        >
          <div class="label">
            <span>{{ cardMeta[c.key].label }}</span>
            <el-icon class="muted"><TopRight /></el-icon>
          </div>
          <div class="value" :class="cardMeta[c.key].cls?.(stats)">
            {{ cardMeta[c.key].value(stats) }}
            <span class="unit">{{ cardMeta[c.key].unit || '' }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="grid-2" style="margin-top: 12px">
      <div class="card">
        <h3 class="card-title">
          进度 S 曲线（挣值）
          <span class="muted" style="font-weight: 400; font-size: 12px">BCWS / BCWP / ACWP</span>
        </h3>
        <div ref="evmRef" class="chart"></div>
      </div>
      <div class="card">
        <h3 class="card-title">
          四算对比偏差
          <span class="muted" style="font-weight: 400; font-size: 12px">已发生成本 vs 预算</span>
        </h3>
        <div ref="costRef" class="chart"></div>
      </div>
    </div>

    <div class="grid-2" style="margin-top: 12px">
      <div class="card">
        <h3 class="card-title">待处理预警（前 8 条）</h3>
        <div v-if="!warnings.length" class="empty">暂无未读预警</div>
        <div v-for="w in warnings.slice(0, 8)" :key="w.key" class="warn-row">
          <el-tag size="small" :type="w.priority === '紧急' ? 'danger' : 'warning'">{{ w.type }}</el-tag>
          <span class="warn-text">{{ w.content }}</span>
          <el-button link type="primary" size="small" @click="gotoWarn(w)">查看</el-button>
        </div>
      </div>
      <div class="card">
        <h3 class="card-title">最近进度填报</h3>
        <el-table :data="recentProgress" size="small" border empty-text="暂无填报">
          <el-table-column label="WBS" min-width="150">
            <template #default="{ row }">{{ app.wbsName(row.wbsId) }}</template>
          </el-table-column>
          <el-table-column label="日期" width="110">
            <template #default="{ row }">{{ fmtDate(row.reportDate) }}</template>
          </el-table-column>
          <el-table-column prop="actualRate" label="实际%" width="80" align="right" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Calendar, Setting, TopRight } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { useAppStore } from '@/stores/app'
import { allDocs, settingGet, settingSet, tbl } from '@/core/db/repo'
import { receivable } from '@/core/services/settlement'
import { fourWayCompare, overBudgetProjectCount } from '@/core/services/cost'
import { stockAlerts } from '@/core/services/stock'
import { warningSummary, warningsWithRead } from '@/core/services/warning'
import { buildToday, addTodo, toggleTodo } from '@/core/services/today'
import { evmSeries } from '@/core/services/evm'
import { dayDiff, fmtDate, monthStart, todayStart, monthEnd } from '@/shared/date'
import { round2 } from '@/shared/money'

const app = useAppStore()
const router = useRouter()

const loading = ref(false)
const expand = ref(false)
const newTodo = ref('')
const today = reactive({ items: [] as any[], todoCount: 0, overdueCount: 0 })
const warnings = ref<any[]>([])
const recentProgress = ref<any[]>([])
const stats = reactive({
  inProgress: 0,
  overBudget: 0,
  hazards: 0,
  warnings: 0,
  output: 0,
  receivable: 0,
  certExpiring: 0,
  stockAlerts: 0
})

const evmRef = ref<HTMLElement>()
const costRef = ref<HTMLElement>()
let evmChart: echarts.ECharts | null = null
let costChart: echarts.ECharts | null = null

const ALL_CARDS = ['inProgress', 'overBudget', 'hazards', 'warnings', 'output', 'receivable', 'certExpiring', 'stockAlerts']
const cardMeta: Record<string, any> = {
  inProgress: { label: '在建项目数', unit: '个', value: (s: any) => s.inProgress, route: '/project' },
  overBudget: { label: '超预算项目数', unit: '个', value: (s: any) => s.overBudget, cls: (s: any) => (s.overBudget > 0 ? 'text-danger' : ''), route: '/cost?tab=four' },
  // AC-14：下钻必须带上「未闭环」口径（= 全部状态去掉「合格闭环」），否则列表条数与卡片对不上
  hazards: {
    label: '未闭环隐患',
    unit: '条',
    value: (s: any) => s.hazards,
    cls: (s: any) => (s.hazards > 0 ? 'text-warning' : ''),
    route: '/quality?tab=hazard&status=' + encodeURIComponent('待整改,整改中,不合格')
  },
  warnings: { label: '待处理预警', unit: '条', value: (s: any) => s.warnings, cls: (s: any) => (s.warnings > 0 ? 'text-danger' : ''), route: '/warning' },
  output: { label: '本月产值', unit: '万元', value: (s: any) => (s.output / 10000).toFixed(1), route: '/contract?tab=submission' },
  receivable: { label: '应收未收', unit: '万元', value: (s: any) => (s.receivable / 10000).toFixed(1), route: '/contract?tab=settlement' },
  certExpiring: { label: '证件将到期', unit: '个', value: (s: any) => s.certExpiring, cls: (s: any) => (s.certExpiring > 0 ? 'text-warning' : ''), route: '/quality?tab=certificate' },
  stockAlerts: { label: '库存告警', unit: '条', value: (s: any) => s.stockAlerts, cls: (s: any) => (s.stockAlerts > 0 ? 'text-warning' : ''), route: '/material?tab=stock' }
}

const cardConfig = ref<{ key: string; visible: boolean }[]>(ALL_CARDS.map((k) => ({ key: k, visible: true })))
const visibleCards = computed(() => cardConfig.value.filter((c) => c.visible))
const dragKey = ref('')

async function loadStats() {
  loading.value = true
  try {
    const projects = await allDocs('projects')
    stats.inProgress = projects.filter((p) => p.status === '在建').length
    stats.overBudget = await overBudgetProjectCount(projects.map((p) => p.id))

    const hazards = await allDocs('hazards', app.currentProjectId || null)
    stats.hazards = hazards.filter((h) => h.status !== '合格闭环').length

    const ws = await warningSummary({ projectId: app.currentProjectId || null })
    stats.warnings = ws.unread

    const submissions = await allDocs('submissions', app.currentProjectId || null)
    const mStart = monthStart()
    const mEnd = monthEnd()
    stats.output = round2(
      submissions
        .filter((s) => s.auditStatus === '已审核' && s.periodEnd >= mStart && s.periodEnd <= mEnd)
        .reduce((sum, s) => sum + Number(s.amount || 0), 0)
    )

    const ar = await receivable(app.currentProjectId || null)
    stats.receivable = ar.unreceived

    const certs = await allDocs('certificates', app.currentProjectId || null)
    const today = todayStart()
    stats.certExpiring = certs.filter((c) => {
      if (!c.expireDate) return false
      const left = dayDiff(today, c.expireDate)
      return left >= 0 && left <= 30
    }).length

    const alerts = app.currentProjectId ? await stockAlerts(app.currentProjectId) : []
    stats.stockAlerts = alerts.length

    const t = await buildToday(app.currentProjectId || null)
    Object.assign(today, t)

    warnings.value = (await warningsWithRead({ projectId: app.currentProjectId || null })).filter((w) => !w.read)

    const prog = await allDocs('progressRecords', app.currentProjectId || null)
    recentProgress.value = prog.sort((a, b) => (b.reportDate || 0) - (a.reportDate || 0)).slice(0, 6)
  } finally {
    loading.value = false
  }
}

async function renderCharts() {
  await nextTick()
  if (app.currentProjectId) {
    const series = await evmSeries(app.currentProjectId)
    if (evmRef.value) {
      evmChart = evmChart || echarts.init(evmRef.value, undefined, { renderer: 'svg' })
      evmChart.setOption({
        grid: { left: 56, right: 24, top: 30, bottom: 32 },
        tooltip: { trigger: 'axis' },
        legend: { data: ['BCWS 计划', 'BCWP 挣值', 'ACWP 实际'], top: 0, textStyle: { fontSize: 11 } },
        xAxis: { type: 'category', data: series.map((s) => s.month), axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: (v: number) => (v / 10000).toFixed(0) + '万' } },
        series: [
          { name: 'BCWS 计划', type: 'line', smooth: true, data: series.map((s) => s.bcws), itemStyle: { color: '#86909c' } },
          { name: 'BCWP 挣值', type: 'line', smooth: true, data: series.map((s) => s.bcwp), itemStyle: { color: '#165dff' } },
          { name: 'ACWP 实际', type: 'line', smooth: true, data: series.map((s) => s.acwp), itemStyle: { color: '#ff7d00' } }
        ]
      })
    }
    const four = await fourWayCompare(app.currentProjectId)
    const rows = four.rows.filter((r) => r.budget > 0).slice(0, 8)
    if (costRef.value) {
      costChart = costChart || echarts.init(costRef.value, undefined, { renderer: 'svg' })
      costChart.setOption({
        grid: { left: 56, right: 24, top: 30, bottom: 32 },
        tooltip: { trigger: 'axis' },
        legend: { data: ['预算', '已发生'], top: 0, textStyle: { fontSize: 11 } },
        xAxis: { type: 'category', data: rows.map((r) => r.code), axisLabel: { fontSize: 10 } },
        yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: (v: number) => (v / 10000).toFixed(0) + '万' } },
        series: [
          { name: '预算', type: 'bar', data: rows.map((r) => r.budget), itemStyle: { color: '#b5d4f4' } },
          { name: '已发生', type: 'bar', data: rows.map((r) => r.actual), itemStyle: { color: '#1657b8' } }
        ]
      })
    }
  }
}

function drill(key: string) {
  const route = cardMeta[key].route
  if (route) router.push(route)
}

function goto(it: any) {
  if (it.route) router.push(it.route)
}

function gotoWarn(w: any) {
  router.push('/warning')
}

async function addTodoItem() {
  const text = newTodo.value.trim()
  if (!text) return
  await addTodo(text)
  newTodo.value = ''
  const t = await buildToday(app.currentProjectId || null)
  Object.assign(today, t)
}

async function doneTodo(it: any) {
  if (!it.docId) return
  await toggleTodo(it.docId, true)
  const t = await buildToday(app.currentProjectId || null)
  Object.assign(today, t)
  ElMessage.success('已完成')
}

function onDrop(target: string) {
  if (!dragKey.value || dragKey.value === target) return
  const list = [...cardConfig.value]
  const from = list.findIndex((c) => c.key === dragKey.value)
  const to = list.findIndex((c) => c.key === target)
  const [moved] = list.splice(from, 1)
  list.splice(to, 0, moved)
  cardConfig.value = list
  persistConfig()
}

async function persistConfig() {
  await settingSet('dashboardCards', cardConfig.value)
}

async function resetConfig() {
  cardConfig.value = ALL_CARDS.map((k) => ({ key: k, visible: true }))
  await persistConfig()
}

async function loadConfig() {
  const saved = await settingGet<any>('dashboardCards', null)
  if (Array.isArray(saved) && saved.length) {
    const merged = ALL_CARDS.map((k) => saved.find((s: any) => s.key === k) || { key: k, visible: true })
    cardConfig.value = merged
  }
}

function onResize() {
  evmChart?.resize()
  costChart?.resize()
}

onMounted(async () => {
  await app.loadProjects()
  await loadConfig()
  await loadStats()
  await renderCharts()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  evmChart?.dispose()
  costChart?.dispose()
})
</script>

<style scoped>
.today {
  margin-bottom: 12px;
  padding: 12px 16px;
}

.today-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.today-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.today-count {
  color: var(--gmp-text-2);
  font-size: 13px;
}

.today-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.today-list {
  margin-top: 10px;
  border-top: 1px dashed var(--gmp-border);
  padding-top: 8px;
  max-height: 220px;
  overflow-y: auto;
}

.today-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 0;
  font-size: 13px;
}

.today-row.overdue .row-text {
  color: var(--gmp-danger);
}

.row-text {
  flex: 1;
  cursor: pointer;
}

.row-text:hover {
  color: var(--gmp-primary);
}

.stat {
  cursor: pointer;
  transition: border-color 0.15s;
}

.stat:hover {
  border-color: var(--gmp-primary);
}

.cfg-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chart {
  height: 240px;
  width: 100%;
}

.warn-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 0;
  border-bottom: 1px dashed #f0f1f3;
  font-size: 13px;
}

.warn-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
