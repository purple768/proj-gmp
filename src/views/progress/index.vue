<template>
  <div class="page">
    <div class="card">
      <h3 class="card-title">
        进度填报
        <span class="muted" style="font-weight: 400; font-size: 12px">实际完成率驱动甘特图实际条与挣值</span>
      </h3>
      <DocPage doc-key="progress" />
    </div>

    <div class="card">
      <div class="toolbar">
        <h3 class="card-title" style="margin: 0">挣值与进度分析</h3>
        <div class="spacer"></div>
        <el-radio-group v-model="months" size="small" @change="render">
          <el-radio-button :value="6">近 6 个月</el-radio-button>
          <el-radio-button :value="12">近 12 个月</el-radio-button>
          <el-radio-button :value="24">全部</el-radio-button>
        </el-radio-group>
      </div>
      <div class="evm-cards">
        <div class="evm-card">
          <span class="muted">BCWS 计划</span>
          <strong>¥{{ formatMoney(summary.bcws) }}</strong>
        </div>
        <div class="evm-card">
          <span class="muted">BCWP 挣值</span>
          <strong>¥{{ formatMoney(summary.bcwp) }}</strong>
        </div>
        <div class="evm-card">
          <span class="muted">ACWP 实际</span>
          <strong>¥{{ formatMoney(summary.acwp) }}</strong>
        </div>
        <div class="evm-card">
          <span class="muted">SPI 进度绩效</span>
          <strong :class="summary.spi < 1 ? 'text-danger' : 'text-success'">{{ summary.spi }}</strong>
        </div>
        <div class="evm-card">
          <span class="muted">CPI 成本绩效</span>
          <strong :class="summary.cpi < 1 && summary.cpi > 0 ? 'text-danger' : ''">{{ summary.cpi }}</strong>
        </div>
      </div>
      <div ref="evmRef" class="chart"></div>
    </div>

    <div class="card">
      <h3 class="card-title">工期预警清单</h3>
      <el-table :data="warnings" border size="small" empty-text="没有工期偏差">
        <el-table-column prop="code" label="WBS" width="110" />
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column prop="planDays" label="计划工期(天)" width="130" align="right" />
        <el-table-column prop="estimatedDays" label="预计工期(天)" width="130" align="right" />
        <el-table-column prop="deviation" label="偏差(天)" width="110" align="right" />
        <el-table-column label="预警等级" width="110" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.level === '紧急' ? 'danger' : 'warning'">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import * as echarts from 'echarts'
import DocPage from '@/components/DocPage.vue'
import { useAppStore } from '@/stores/app'
import { evmSeries, evmSummary } from '@/core/services/evm'
import { progressWarnings } from '@/core/services/gantt'
import { formatMoney } from '@/shared/money'

const app = useAppStore()
const months = ref(12)
const evmRef = ref<HTMLElement>()
const warnings = ref<any[]>([])
const summary = reactive({ bcws: 0, bcwp: 0, acwp: 0, spi: 0, cpi: 0 })
let chart: echarts.ECharts | null = null

async function render() {
  if (!app.currentProjectId) return
  const from = months.value === 24 ? undefined : Date.now() - months.value * 30 * 86400000
  const series = await evmSeries(app.currentProjectId, from as any)
  Object.assign(summary, evmSummary(series))
  warnings.value = await progressWarnings(app.currentProjectId)
  await nextTick()
  if (!evmRef.value) return
  chart = chart || echarts.init(evmRef.value, undefined, { renderer: 'svg' })
  chart.setOption({
    grid: { left: 64, right: 30, top: 36, bottom: 40 },
    tooltip: { trigger: 'axis' },
    legend: { data: ['BCWS 计划', 'BCWP 挣值', 'ACWP 实际'], top: 0 },
    xAxis: { type: 'category', data: series.map((s) => s.month) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => (v / 10000).toFixed(0) + '万' } },
    series: [
      { name: 'BCWS 计划', type: 'line', smooth: true, areaStyle: { opacity: 0.06 }, data: series.map((s) => s.bcws), itemStyle: { color: '#86909c' } },
      { name: 'BCWP 挣值', type: 'line', smooth: true, data: series.map((s) => s.bcwp), itemStyle: { color: '#165dff' } },
      { name: 'ACWP 实际', type: 'line', smooth: true, data: series.map((s) => s.acwp), itemStyle: { color: '#ff7d00' } }
    ]
  })
}

function onResize() {
  chart?.resize()
}

onMounted(async () => {
  await app.loadProjects()
  await render()
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  chart?.dispose()
})

watch(() => app.currentProjectId, render)
</script>

<style scoped>
.chart {
  height: 300px;
  width: 100%;
}

.evm-cards {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.evm-card {
  border: 1px solid var(--gmp-border);
  border-radius: 6px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.evm-card strong {
  font-size: 17px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
</style>
