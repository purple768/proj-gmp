<template>
  <div class="page">
    <el-tabs v-model="tab" @tab-change="onTab">
      <el-tab-pane label="材料需求计划" name="plan"><DocPage v-if="tab === 'plan'" doc-key="materialPlan" /></el-tab-pane>
      <el-tab-pane label="材料进场送检" name="receipt"><DocPage v-if="tab === 'receipt'" doc-key="materialReceipt" /></el-tab-pane>
      <el-tab-pane label="出入库台账" name="stock"><DocPage v-if="tab === 'stock'" doc-key="stockFlow" /></el-tab-pane>
      <el-tab-pane label="库存汇总" name="balance">
        <div class="card">
          <div class="toolbar">
            <h3 class="card-title" style="margin: 0">库存汇总（Σ入库 − Σ出库）</h3>
            <div class="spacer"></div>
            <el-input v-model="kw" placeholder="筛选材料" size="small" style="width: 180px" clearable />
            <el-button size="small" :icon="Download" @click="exportBalance">导出</el-button>
            <el-button size="small" :icon="Refresh" @click="loadBalance">刷新</el-button>
          </div>
          <el-alert v-if="alerts.length" type="warning" :closable="false" style="margin-bottom: 12px">
            {{ alerts.length }} 种材料低于最低库存：{{ alerts.map((a) => `${a.materialName}(${a.qty})`).join('、') }}
          </el-alert>
          <el-table :data="filtered" border empty-text="暂无库存流水">
            <el-table-column prop="materialName" label="材料名称" min-width="160" />
            <el-table-column prop="spec" label="规格" min-width="140" />
            <el-table-column prop="qty" label="库存余量" width="120" align="right" />
            <el-table-column label="最低库存" width="150" align="right">
              <template #default="{ row }">
                <el-input-number
                  :model-value="row.minStock"
                  :min="0"
                  :precision="0"
                  :controls="false"
                  size="small"
                  style="width: 100px"
                  @change="(v: any) => saveMin(row, v)"
                />
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110" align="center">
              <template #default="{ row }">
                <el-tag v-if="row.qty < (row.minStock || 0)" size="small" type="danger">不足</el-tag>
                <el-tag v-else size="small" type="success">正常</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
      <el-tab-pane label="设备台账" name="ledger"><DocPage v-if="tab === 'ledger'" doc-key="equipment" /></el-tab-pane>
      <el-tab-pane label="台班登记" name="shift"><DocPage v-if="tab === 'shift'" doc-key="machineShift" /></el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download, Refresh } from '@element-plus/icons-vue'
import DocPage from '@/components/DocPage.vue'
import { ElMessage } from 'element-plus'
import { useAppStore } from '@/stores/app'
import { allDocs, tbl } from '@/core/db/repo'
import { balance, materialKey, stockAlerts, type StockAlert } from '@/core/services/stock'
import { downloadWorkbook } from '@/core/services/excel'
import { round2 } from '@/shared/money'

const app = useAppStore()
const route = useRoute()
const router = useRouter()
const tab = ref('plan')
const kw = ref('')
const rows = ref<any[]>([])
const alerts = ref<StockAlert[]>([])

const filtered = computed(() => rows.value.filter((r) => !kw.value || `${r.materialName}${r.spec}`.includes(kw.value)))

function onTab(name: any) {
  router.replace({ query: { ...route.query, tab: String(name) } })
  if (name === 'balance') loadBalance()
}

async function loadBalance() {
  if (!app.currentProjectId) return
  const flows = await allDocs('stockFlows', app.currentProjectId)
  const dictRows: any[] = await tbl('dictionaries').toArray()
  const dict = new Map(dictRows.map((d: any) => [d.key, d.value]))
  const keys = new Map<string, { materialName: string; spec: string }>()
  for (const f of flows) keys.set(materialKey(f.materialName, f.spec), { materialName: f.materialName, spec: f.spec })
  const out: any[] = []
  for (const [key, info] of keys) {
    const qty = await balance(app.currentProjectId, key)
    out.push({ ...info, key, qty: round2(qty), minStock: Number(dict.get(key)?.minStock || 0) })
  }
  rows.value = out.sort((a, b) => a.materialName.localeCompare(b.materialName, 'zh-CN'))
  alerts.value = await stockAlerts(app.currentProjectId)
}

async function saveMin(row: any, v: number | undefined) {
  const value = Number(v || 0)
  await tbl('dictionaries').put({ key: row.key, value: { minStock: value } })
  row.minStock = value
  alerts.value = await stockAlerts(app.currentProjectId)
  ElMessage.success('已保存最低库存')
}

async function exportBalance() {
  await downloadWorkbook(
    [
      {
        name: '库存汇总',
        columns: [
          { header: '材料名称', key: 'materialName', width: 20 },
          { header: '规格', key: 'spec', width: 16 },
          { header: '库存余量', key: 'qty', width: 14 },
          { header: '最低库存', key: 'minStock', width: 14 }
        ],
        rows: filtered.value
      }
    ],
    '库存汇总.xlsx'
  )
}

onMounted(async () => {
  await app.loadProjects()
  const q = route.query.tab as string
  if (q) tab.value = q
  if (tab.value === 'balance') await loadBalance()
})

watch(() => app.currentProjectId, loadBalance)
</script>
