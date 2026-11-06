<template>
  <div class="page">
    <div class="card">
      <div class="toolbar">
        <el-input v-model="q" placeholder="输入关键词，空格分隔多个条件（AND）" clearable style="width: 420px" @keyup.enter="run" @clear="run">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
        <el-button type="primary" :loading="busy" @click="run">搜索</el-button>
        <el-button :icon="Download" :disabled="!hits.length" @click="exportHits">导出结果</el-button>
        <div class="spacer"></div>
        <span class="muted">索引 {{ indexSize }} 条 · {{ cost }} ms</span>
      </div>

      <div class="filters">
        <el-select v-model="pid" placeholder="全部项目" clearable style="width: 200px" @change="run">
          <el-option v-for="p in app.projects" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
        <el-select v-model="types" multiple collapse-tags placeholder="全部类型" style="width: 260px" @change="run">
          <el-option v-for="d in docs" :key="d.key" :label="d.title" :value="d.key" />
        </el-select>
        <el-date-picker v-model="range" type="daterange" value-format="x" start-placeholder="开始" end-placeholder="结束" style="width: 240px" @change="run" />
        <el-button text @click="clearFilters">清空筛选</el-button>
      </div>

      <div v-if="!q.trim()" class="empty">输入关键词开始搜索（例如：隐患、水稳、HT-2026）</div>
      <div v-else-if="!hits.length && !busy" class="empty">没有匹配的记录</div>

      <div v-if="hits.length" class="result-count">
        当前 {{ hits.length }} 条结果<span v-if="hits.length > shown">（已显示前 {{ shown }} 条）</span>
        <span v-if="truncated" class="muted">· 已达单次返回上限，请增加关键词缩小范围</span>
      </div>

      <div v-for="h in visibleHits" :key="`${h.docType}:${h.docId}`" class="hit">
        <div class="hit-head">
          <el-tag size="small" type="info">{{ docTitle(h.docType) }}</el-tag>
          <span class="hit-code" v-html="highlight(h.code, q)"></span>
          <span class="hit-title" v-html="highlight(h.title, q)"></span>
          <span class="muted">{{ app.projectName(h.projectId) }}</span>
          <span class="muted">{{ fmtDate(h.date) }}</span>
          <div class="spacer"></div>
          <el-button link type="primary" @click="open(h)">打开</el-button>
        </div>
        <div class="hit-snippet" v-html="highlight(h.snippet, q)"></div>
      </div>

      <div v-if="hits.length > shown" class="more">
        <el-button @click="shown += 50">加载更多（{{ hits.length - shown }} 条）</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Search } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { BUSINESS_DOCS } from '@/core/docs'
import { buildIndex, docTitle, highlight, searchIndex, type SearchDoc, type SearchHit } from '@/core/services/search'
import { fmtDate } from '@/shared/date'
import { downloadWorkbook } from '@/core/services/excel'

const app = useAppStore()
const route = useRoute()
const router = useRouter()
const docs = BUSINESS_DOCS
const q = ref(String(route.query.q || ''))
const pid = ref('')
const types = ref<string[]>([])
const range = ref<any>(null)
const hits = ref<SearchHit[]>([])
const busy = ref(false)
const indexSize = ref(0)
const cost = ref(0)
/** 分批渲染：命中可能上百条，首屏只渲染 50 条，避免一次性 v-html 拖慢首帧 */
const PAGE = 50
const shown = ref(PAGE)
const visibleHits = computed(() => hits.value.slice(0, shown.value))
const LIMIT = 200
const truncated = computed(() => hits.value.length >= LIMIT)
let index: SearchDoc[] = []

async function ensureIndex() {
  if (!index.length) {
    index = await buildIndex()
    indexSize.value = index.length
  }
}

async function run() {
  const term = q.value.trim()
  router.replace({ query: term ? { q: term } : {} })
  if (!term) {
    hits.value = []
    return
  }
  busy.value = true
  const t0 = performance.now()
  try {
    await ensureIndex()
    shown.value = PAGE
    hits.value = searchIndex(index, term, {
      projectId: pid.value || null,
      docTypes: types.value,
      from: range.value?.length ? Number(range.value[0]) : null,
      to: range.value?.length ? new Date(Number(range.value[1])).setHours(23, 59, 59, 999) : null,
      limit: LIMIT
    })
    cost.value = Math.round(performance.now() - t0)
  } finally {
    busy.value = false
  }
}

function clearFilters() {
  pid.value = ''
  types.value = []
  range.value = null
  run()
}

const routeMap: Record<string, string> = {
  progress: '/progress',
  contract: '/contract?tab=contract',
  change: '/contract?tab=change',
  visa: '/contract?tab=visa',
  submission: '/contract?tab=submission',
  settlement: '/contract?tab=settlement',
  budget: '/cost?tab=budget',
  expense: '/cost?tab=expense',
  qualityPlan: '/quality?tab=qualityPlan',
  inspection: '/quality?tab=inspection',
  concealment: '/quality?tab=concealment',
  testRecord: '/quality?tab=testRecord',
  defect: '/quality?tab=defect',
  safetyPlan: '/quality?tab=safetyPlan',
  briefing: '/quality?tab=briefing',
  hazard: '/quality?tab=hazard',
  riskSource: '/quality?tab=riskSource',
  emergencyPlan: '/quality?tab=emergencyPlan',
  training: '/quality?tab=training',
  certificate: '/quality?tab=certificate',
  materialPlan: '/material?tab=plan',
  materialReceipt: '/material?tab=receipt',
  stockFlow: '/material?tab=stock',
  equipment: '/material?tab=ledger',
  machineShift: '/material?tab=shift',
  drawing: '/document?tab=drawing',
  archive: '/document?tab=archive',
  team: '/labor?tab=team',
  worker: '/labor?tab=worker',
  attendance: '/labor?tab=attendance',
  teamMeasurement: '/labor?tab=teamMeasurement',
  payroll: '/labor?tab=payroll'
}

async function open(h: SearchHit) {
  // PRD 5.12 / AC-23：点击条目先问「是否跳转到该记录详情」，由用户决定
  try {
    await ElMessageBox.confirm(`是否跳转到该记录详情？\n${docTitle(h.docType)} ${h.code}`, '查看详情', {
      confirmButtonText: '跳转',
      cancelButtonText: '留在本页',
      type: 'info'
    })
  } catch {
    return
  }
  router.push(routeMap[h.docType] || '/dashboard')
}

async function exportHits() {
  await downloadWorkbook(
    [
      {
        name: '搜索结果',
        columns: [
          { header: '单据类型', key: 'type', width: 16 },
          { header: '编号', key: 'code', width: 20 },
          { header: '名称', key: 'title', width: 26 },
          { header: '项目', key: 'project', width: 24 },
          { header: '日期', key: 'date', width: 14 },
          { header: '摘要', key: 'snippet', width: 50 }
        ],
        rows: hits.value.map((h) => ({
          type: docTitle(h.docType),
          code: h.code,
          title: h.title,
          project: app.projectName(h.projectId),
          date: fmtDate(h.date),
          snippet: h.snippet
        }))
      }
    ],
    '搜索结果.xlsx'
  )
  ElMessage.success(`已导出 ${hits.value.length} 条`)
}

onMounted(async () => {
  await app.loadProjects()
  await ensureIndex()
  if (q.value) await run()
})
</script>

<style scoped>
.filters {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.hit {
  border-bottom: 1px solid #f0f1f3;
  padding: 10px 0;
}

.result-count {
  font-size: 13px;
  color: var(--gmp-text-2);
  padding: 4px 0 8px;
}

.more {
  text-align: center;
  padding: 14px 0 4px;
}

.hit-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}

.hit-code {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  color: var(--gmp-text-2);
}

.hit-title {
  font-weight: 500;
}

.hit-snippet {
  margin-top: 4px;
  color: var(--gmp-text-2);
  font-size: 13px;
  line-height: 1.6;
}

:deep(mark) {
  background: #fff099;
  padding: 0 1px;
}

.spacer {
  flex: 1;
}
</style>
