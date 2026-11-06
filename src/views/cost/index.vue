<template>
  <div class="page">
    <el-tabs v-model="tab" @tab-change="onTab">
      <el-tab-pane label="预算录入" name="budget"><DocPage v-if="tab === 'budget'" doc-key="budget" /></el-tab-pane>
      <el-tab-pane label="成本支出" name="expense"><DocPage v-if="tab === 'expense'" doc-key="expense" /></el-tab-pane>
      <el-tab-pane label="四算对比与预警" name="four">
        <div class="card">
          <div class="toolbar">
            <h3 class="card-title" style="margin: 0">
              四算对比
              <el-tag size="small" type="info" effect="plain">预估最终成本为简化估算 max(已发生, 预算)</el-tag>
            </h3>
            <div class="spacer"></div>
            <el-button :icon="Download" @click="exportFour">导出 Excel</el-button>
            <el-button :icon="Refresh" @click="load">刷新</el-button>
          </div>
          <el-alert v-if="!four.hasBudget" type="warning" :closable="false" title="当前项目还没有预算数据，合同价无法按预算占比分摊，将显示为 —" style="margin-bottom: 12px" />
          <el-table :data="four.rows" border size="default" show-summary :summary-method="summaryMethod" empty-text="暂无数据">
            <el-table-column prop="code" label="WBS" width="110" />
            <el-table-column prop="name" label="名称" min-width="160" />
            <el-table-column label="预算" width="140" align="right">
              <template #default="{ row }">{{ row.budget ? formatMoney(row.budget) : '—' }}</template>
            </el-table-column>
            <el-table-column label="合同价" width="140" align="right">
              <template #default="{ row }">{{ row.budget ? formatMoney(row.contractPrice) : '—' }}</template>
            </el-table-column>
            <el-table-column label="已发生成本" width="140" align="right">
              <template #default="{ row }">{{ formatMoney(row.actual) }}</template>
            </el-table-column>
            <el-table-column label="预估最终成本" width="140" align="right">
              <template #default="{ row }">{{ formatMoney(row.estimate) }}</template>
            </el-table-column>
            <el-table-column label="偏差值" width="130" align="right">
              <template #default="{ row }">
                <span :class="row.deviation > 0 ? 'text-danger' : ''">{{ formatMoney(row.deviation) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="偏差率" width="100" align="right">
              <template #default="{ row }">{{ row.rate === null ? '—' : (row.rate * 100).toFixed(1) + '%' }}</template>
            </el-table-column>
            <el-table-column label="预警等级" width="100" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.level" size="small" :type="row.level === '紧急' ? 'danger' : 'warning'">{{ row.level }}</el-tag>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download, Refresh } from '@element-plus/icons-vue'
import DocPage from '@/components/DocPage.vue'
import { useAppStore } from '@/stores/app'
import { fourWayCompare, type FourResult } from '@/core/services/cost'
import { formatMoney } from '@/shared/money'
import { downloadWorkbook } from '@/core/services/excel'

const app = useAppStore()
const route = useRoute()
const router = useRouter()
const tab = ref('budget')
const four = reactive<FourResult>({ rows: [], totals: { budget: 0, contractPrice: 0, actual: 0, deviation: 0, rate: null }, hasBudget: false })

async function load() {
  if (!app.currentProjectId) return
  Object.assign(four, await fourWayCompare(app.currentProjectId))
}

function onTab(name: any) {
  router.replace({ query: { ...route.query, tab: String(name) } })
  if (name === 'four') load()
}

function summaryMethod({ columns }: any) {
  return columns.map((c: any, i: number) => {
    if (i === 0) return '合计'
    const key = ['', 'budget', 'contractPrice', 'actual', 'estimate', 'deviation'][i]
    if (!key) return ''
    return formatMoney((four.totals as any)[key])
  })
}

async function exportFour() {
  await downloadWorkbook(
    [
      {
        name: '四算对比',
        columns: [
          { header: 'WBS', key: 'code', width: 12 },
          { header: '名称', key: 'name', width: 22 },
          { header: '预算', key: 'budget', money: true },
          { header: '合同价', key: 'contractPrice', money: true },
          { header: '已发生成本', key: 'actual', money: true },
          { header: '预估最终成本', key: 'estimate', money: true },
          { header: '偏差值', key: 'deviation', money: true },
          { header: '偏差率', key: 'rateText', width: 12 },
          { header: '预警等级', key: 'level', width: 12 }
        ],
        rows: four.rows.map((r) => ({ ...r, rateText: r.rate === null ? '—' : (r.rate * 100).toFixed(1) + '%' }))
      }
    ],
    '四算对比.xlsx'
  )
}

onMounted(async () => {
  await app.loadProjects()
  const q = route.query.tab as string
  if (q) tab.value = q
  if (tab.value === 'four') await load()
})

watch(() => app.currentProjectId, load)
</script>
