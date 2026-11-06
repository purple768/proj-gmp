<template>
  <div class="gantt">
    <div class="gantt-toolbar no-print">
      <el-button-group size="small">
        <el-button :type="zoom === 0 ? 'primary' : ''" @click="zoom = 0">缩小</el-button>
        <el-button :type="zoom === 1 ? 'primary' : ''" @click="zoom = 1">适中</el-button>
        <el-button :type="zoom === 2 ? 'primary' : ''" @click="zoom = 2">放大</el-button>
      </el-button-group>
      <span class="muted">共 {{ bars.length }} 个节点 · 拖动横向滚动条查看更多</span>
      <div class="spacer"></div>
      <el-button size="small" :icon="Download" @click="exportPng">导出图片</el-button>
    </div>

    <div v-if="!bars.length" class="empty">暂无 WBS 节点</div>
    <div v-else class="gantt-scroll" ref="scrollRef">
      <svg ref="svgRef" :width="svgWidth" :height="svgHeight" :viewBox="`0 0 ${svgWidth} ${svgHeight}`" xmlns="http://www.w3.org/2000/svg">
        <g>
          <rect :x="0" :y="0" :width="labelWidth" :height="svgHeight" fill="#fafbfc" />
          <text :x="12" :y="20" font-size="12" fill="#86909c">WBS 节点</text>
          <text :x="labelWidth + 8" :y="20" font-size="12" fill="#86909c">计划 / 实际（{{ rangeText }}）</text>
        </g>
        <g v-for="(t, i) in ticks" :key="`t${i}`">
          <line :x1="labelWidth + t.x" :y1="28" :x2="labelWidth + t.x" :y2="svgHeight" stroke="#f0f1f3" stroke-width="1" />
          <text :x="labelWidth + t.x + 4" :y="18" font-size="11" fill="#a9aeb8">{{ t.label }}</text>
        </g>
        <g v-for="(row, idx) in laid" :key="row.wbsId">
          <rect :x="0" :y="34 + idx * rowHeight" :width="svgWidth" :height="rowHeight" :fill="idx % 2 ? '#fcfcfd' : '#fff'" />
          <text :x="10 + row.level * 12" :y="34 + idx * rowHeight + rowHeight / 2 + 4" font-size="12" :fill="row.enabled ? '#1d2129' : '#c9cdd4'">
            {{ row.code }} {{ row.name }}
          </text>
          <g v-if="row.milestone">
            <polygon
              :points="diamond(row, 34 + idx * rowHeight)"
              fill="#ff7d00"
              stroke="#d25f00"
              stroke-width="0.5"
            />
          </g>
          <g v-else>
            <rect
              :x="labelWidth + row.planX"
              :y="34 + idx * rowHeight + 6"
              :width="Math.max(3, row.planW)"
              height="6"
              rx="3"
              fill="#b5d4f4"
            />
            <rect
              v-if="row.actualW > 0"
              :x="labelWidth + row.actualX"
              :y="34 + idx * rowHeight + 16"
              :width="row.actualW"
              height="6"
              rx="3"
              :fill="row.source === 'children' ? '#7fb2ea' : row.stale ? '#c9cdd4' : '#165dff'"
            />
            <text
              :x="labelWidth + row.planX + Math.max(3, row.planW) + 4"
              :y="34 + idx * rowHeight + 12"
              font-size="10"
              fill="#86909c"
            >
              {{ row.rate }}%<tspan v-if="row.source === 'children'"> · 汇总</tspan>
            </text>
          </g>
        </g>
        <line :x1="labelWidth" :y1="28" :x2="labelWidth" :y2="svgHeight" stroke="#e5e6eb" />
      </svg>
    </div>
    <div class="legend">
      <span><i class="sw plan"></i>计划</span>
      <span><i class="sw actual"></i>实际</span>
      <span><i class="sw agg"></i>子节点加权</span>
      <span><i class="sw stale"></i>停滞 14 天</span>
      <span><i class="sw ms"></i>里程碑</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { dayDiff } from '@/shared/date'
import { Download } from '@element-plus/icons-vue'

const props = defineProps<{ bars: any[] }>()
const zoom = ref(1)
const rowHeight = 28
const labelWidth = 220
const dayWidth = computed(() => [4, 8, 14][zoom.value])
const scrollRef = ref<HTMLElement>()
const svgRef = ref<SVGSVGElement>()

const minTs = computed(() => Math.min(...props.bars.map((b) => b.planStart).filter(Boolean)))
const maxTs = computed(() => Math.max(...props.bars.map((b) => b.planEnd).filter(Boolean)))

const totalDays = computed(() => Math.max(1, dayDiff(minTs.value, maxTs.value) + 1))
const svgWidth = computed(() => labelWidth + totalDays.value * dayWidth.value + 40)
const svgHeight = computed(() => 34 + props.bars.length * rowHeight + 10)

const rangeText = computed(() => {
  if (!props.bars.length) return ''
  const f = (t: number) => new Date(t).toISOString().slice(0, 10)
  return `${f(minTs.value)} ~ ${f(maxTs.value)}`
})

const ticks = computed(() => {
  const out: { x: number; label: string }[] = []
  if (!props.bars.length) return out
  const start = new Date(minTs.value)
  const end = new Date(maxTs.value)
  const step = zoom.value === 2 ? 7 : 14
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const x = dayDiff(minTs.value, d.getTime()) * dayWidth.value
    if (x < 0) continue
    out.push({ x, label: `${d.getMonth() + 1}月` })
  }
  void step
  return out
})

const laid = computed(() =>
  props.bars.map((b) => {
    const planX = dayDiff(minTs.value, b.planStart) * dayWidth.value
    const planW = (dayDiff(b.planStart, b.planEnd) + 1) * dayWidth.value
    const actualX = b.actualStart ? dayDiff(minTs.value, b.actualStart) * dayWidth.value : 0
    const actualW = b.actualStart && b.actualEnd ? (dayDiff(b.actualStart, b.actualEnd) + 1) * dayWidth.value : 0
    return { ...b, planX, planW, actualX, actualW, stale: b.staleDays > 14 }
  })
)

function diamond(row: any, y: number) {
  const cx = labelWidth + row.planX + 4
  const cy = y + 14
  return `${cx},${cy - 6} ${cx + 6},${cy} ${cx},${cy + 6} ${cx - 6},${cy}`
}

function exportPng() {
  const svg = svgRef.value
  if (!svg) return
  const xml = new XMLSerializer().serializeToString(svg)
  const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = svgWidth.value
    canvas.height = svgHeight.value
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)
    const a = document.createElement('a')
    a.href = canvas.toDataURL('image/png')
    a.download = `甘特图_${new Date().toISOString().slice(0, 10)}.png`
    a.click()
  }
  img.src = url
}
</script>

<style scoped>
.gantt-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.gantt-scroll {
  overflow-x: auto;
  border: 1px solid var(--gmp-border);
  border-radius: 6px;
  background: #fff;
}

.legend {
  display: flex;
  gap: 16px;
  margin-top: 8px;
  font-size: 12px;
  color: var(--gmp-text-3);
}

.sw {
  display: inline-block;
  width: 14px;
  height: 6px;
  border-radius: 3px;
  margin-right: 4px;
}

.sw.plan { background: #b5d4f4; }
.sw.actual { background: #165dff; }
.sw.agg { background: #7fb2ea; }
.sw.stale { background: #c9cdd4; }
.sw.ms { width: 8px; height: 8px; transform: rotate(45deg); background: #ff7d00; }

.spacer { flex: 1; }
</style>
