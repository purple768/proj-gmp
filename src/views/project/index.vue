<template>
  <div class="page">
    <el-tabs v-model="tab" class="page-tabs">
      <el-tab-pane label="项目" name="project">
        <DocPage doc-key="project" />
      </el-tab-pane>

      <el-tab-pane label="WBS 与甘特图" name="wbs">
        <div class="card">
          <div class="toolbar">
            <el-button type="primary" :icon="Plus" @click="openCreate">新增 WBS 节点</el-button>
            <el-button :icon="Upload" @click="pickXml">导入 MS Project XML</el-button>
            <el-button :icon="Upload" @click="pickExcel">导入 Excel 模板</el-button>
            <el-button :icon="Download" @click="downloadTemplate">下载 Excel 模板</el-button>
            <div class="spacer"></div>
            <el-switch v-model="showDisabled" active-text="显示停用节点" @change="load" />
            <el-button :icon="Printer" @click="printPage">导出 PDF</el-button>
          </div>

          <el-alert v-if="!app.currentProjectId" type="info" :closable="false" title="请先在顶部选择或新建项目" />
          <template v-else>
            <el-table
              :data="tree"
              row-key="id"
              border
              size="default"
              :tree-props="{ children: 'children' }"
              default-expand-all
              empty-text="暂无 WBS 节点，可新增或导入"
            >
              <el-table-column prop="code" label="WBS 编码" width="130" />
              <el-table-column prop="name" label="名称" min-width="180" />
              <el-table-column label="里程碑" width="90" align="center">
                <template #default="{ row }">
                  <el-tag v-if="row.milestone === '是'" size="small" type="warning">是</el-tag>
                  <span v-else class="muted">否</span>
                </template>
              </el-table-column>
              <el-table-column label="计划开始" width="120">
                <template #default="{ row }">{{ fmtDate(row.planStart) }}</template>
              </el-table-column>
              <el-table-column label="计划完成" width="120">
                <template #default="{ row }">{{ fmtDate(row.planEnd) }}</template>
              </el-table-column>
              <el-table-column label="完成率" width="100" align="right">
                <template #default="{ row }">{{ rateOf(row.id) }}%</template>
              </el-table-column>
              <el-table-column label="状态" width="90" align="center">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.enabled === false ? 'info' : 'success'">{{ row.enabled === false ? '已停用' : '启用' }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="200" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                  <el-button link type="warning" @click="toggleEnabled(row)">{{ row.enabled === false ? '启用' : '停用' }}</el-button>
                  <el-button link type="danger" @click="remove(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </template>
        </div>

        <div class="card">
          <h3 class="card-title">横道图（计划 / 实际）</h3>
          <GanttChart :bars="bars" />
        </div>

        <div v-if="progressWarn.length" class="card">
          <h3 class="card-title">工期预警</h3>
          <el-table :data="progressWarn" size="small" border>
            <el-table-column prop="code" label="WBS" width="100" />
            <el-table-column prop="name" label="名称" min-width="140" />
            <el-table-column prop="planDays" label="计划工期(天)" width="120" align="right" />
            <el-table-column prop="estimatedDays" label="预计工期(天)" width="120" align="right" />
            <el-table-column prop="deviation" label="偏差(天)" width="100" align="right" />
            <el-table-column label="等级" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.level === '紧急' ? 'danger' : 'warning'">{{ row.level }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="dialog" :title="form.id ? '编辑 WBS 节点' : '新增 WBS 节点'" width="700px" destroy-on-close>
      <el-form :model="form" label-width="110px">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="WBS 编码" required>
              <el-input v-model="form.code" placeholder="如 1.2.3" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="WBS 名称" required>
              <el-input v-model="form.name" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="父级节点">
              <el-select v-model="form.parentId" clearable placeholder="根节点" style="width: 100%">
                <el-option v-for="o in parentOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="是否里程碑">
              <el-radio-group v-model="form.milestone">
                <el-radio value="否">否</el-radio>
                <el-radio value="是">是</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="计划开始" required>
              <el-date-picker v-model="form.planStart" type="date" value-format="x" style="width: 100%" @update:model-value="(v: any) => (form.planStart = v ? Number(v) : null)" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="计划完成">
              <el-date-picker v-model="form.planEnd" type="date" value-format="x" style="width: 100%" @update:model-value="(v: any) => (form.planEnd = v ? Number(v) : null)" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="负责人">
              <el-input v-model="form.owner" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item label="描述">
              <el-input v-model="form.desc" type="textarea" :rows="2" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <input ref="xmlInput" type="file" accept=".xml" hidden @change="onXml" />
    <input ref="xlsxInput" type="file" accept=".xlsx,.xls" hidden @change="onXlsx" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload, Download, Printer } from '@element-plus/icons-vue'
import DocPage from '@/components/DocPage.vue'
import GanttChart from '@/components/GanttChart.vue'
import { useAppStore } from '@/stores/app'
import { createDoc, listDocs, softDeleteDoc, tbl, updateDoc } from '@/core/db/repo'
import { assertWbsDeletable, buildTree, setWbsEnabled } from '@/core/services/wbs'
import { buildGantt, progressWarnings } from '@/core/services/gantt'
import { importWbsRows, parseExcelWbs, parseMsProjectXml } from '@/core/services/wbsImport'
import { downloadWorkbook } from '@/core/services/excel'
import { fmtDate } from '@/shared/date'
import { useRoute } from 'vue-router'

const app = useAppStore()
const route = useRoute()
const tab = ref<'project' | 'wbs'>('project')
const rows = ref<any[]>([])
const bars = ref<any[]>([])
const progressWarn = ref<any[]>([])
const showDisabled = ref(false)
const dialog = ref(false)
const saving = ref(false)
const xmlInput = ref<HTMLInputElement>()
const xlsxInput = ref<HTMLInputElement>()

const form = reactive<any>({ parentId: null, milestone: '否' })

const tree = computed(() => {
  const list = showDisabled.value ? rows.value : rows.value.filter((r) => r.enabled !== false)
  return buildTree(list)
})

const parentOptions = computed(() =>
  rows.value
    .filter((r) => r.id !== form.id)
    .map((r) => ({ value: r.id, label: `${r.code} ${r.name}` }))
)

function rateOf(id: string) {
  const bar = bars.value.find((b) => b.wbsId === id)
  return bar ? bar.rate : 0
}

async function load() {
  if (!app.currentProjectId) {
    rows.value = []
    bars.value = []
    return
  }
  const res = await listDocs('wbs', { projectId: app.currentProjectId, pageSize: 500, sortField: 'code', sortDir: 'asc' })
  rows.value = res.rows
  bars.value = await buildGantt(app.currentProjectId)
  progressWarn.value = await progressWarnings(app.currentProjectId)
}

function openCreate() {
  Object.keys(form).forEach((k) => delete form[k])
  Object.assign(form, { parentId: null, milestone: '否', planStart: Date.now(), planEnd: Date.now(), code: '', name: '' })
  dialog.value = true
}

function openEdit(row: any) {
  Object.keys(form).forEach((k) => delete form[k])
  Object.assign(form, JSON.parse(JSON.stringify(row)))
  dialog.value = true
}

async function save() {
  if (!form.code || !form.name) {
    ElMessage.error('编码与名称必填')
    return
  }
  const dup = rows.value.find((r) => r.code === form.code && r.id !== form.id)
  if (dup) {
    ElMessage.error(`WBS 编码 ${form.code} 在项目内已存在`)
    return
  }
  saving.value = true
  try {
    if (form.id) await updateDoc('wbs', form.id, { ...form })
    else await createDoc('wbs', { ...form, projectId: app.currentProjectId, enabled: true })
    dialog.value = false
    await load()
    await app.loadWbs()
    ElMessage.success('已保存')
  } finally {
    saving.value = false
  }
}

async function remove(row: any) {
  const res = await assertWbsDeletable(row.id, app.currentProjectId)
  if (!res.ok) {
    const detail = res.blockers.map((b) => `${b.title} ${b.count}`).join('、')
    ElMessage.error(`不能删除：存在 ${detail}。可改为停用`)
    return
  }
  await ElMessageBox.confirm(`确认删除 WBS「${row.code} ${row.name}」？删除后可在回收站恢复。`, '删除确认', { type: 'warning' })
  await softDeleteDoc('wbs', row.id)
  await load()
  await app.loadWbs()
  ElMessage.success('已删除')
}

async function toggleEnabled(row: any) {
  await setWbsEnabled(row.id, row.enabled === false, app.currentProjectId)
  await load()
  await app.loadWbs()
  ElMessage.success('已更新启用状态')
}

function pickXml() {
  xmlInput.value?.click()
}

function pickExcel() {
  xlsxInput.value?.click()
}

async function onXml(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    const rowsParsed = parseMsProjectXml(text)
    const res = await importWbsRows(app.currentProjectId, rowsParsed)
    ElMessage.success(`导入完成：新增 ${res.created} 个节点${res.errors.length ? `，${res.errors.length} 条提示` : ''}`)
    if (res.errors.length) console.warn(res.errors)
    await load()
    await app.loadWbs()
  } catch (err: any) {
    ElMessage.error(err.message || '导入失败')
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function onXlsx(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const buf = await file.arrayBuffer()
    const rowsParsed = await parseExcelWbs(buf)
    const res = await importWbsRows(app.currentProjectId, rowsParsed)
    ElMessage.success(`导入完成：新增 ${res.created} 个节点`)
    await load()
    await app.loadWbs()
  } catch (err: any) {
    ElMessage.error(err.message || '导入失败')
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function downloadTemplate() {
  await downloadWorkbook(
    [
      {
        name: 'WBS导入模板',
        columns: [
          { header: 'WBS编码', key: 'code', width: 14 },
          { header: 'WBS名称', key: 'name', width: 24 },
          { header: '上级编码', key: 'parent', width: 14 },
          { header: '计划开始', key: 'start', width: 14 },
          { header: '计划完成', key: 'end', width: 14 }
        ],
        rows: [{ code: '1', name: '道路工程', parent: '', start: '2026-01-05', end: '2026-03-05' }]
      }
    ],
    'WBS导入模板.xlsx'
  )
}

function printPage() {
  window.print()
}

onMounted(async () => {
  await app.loadProjects()
  if (route.query.tab === 'wbs') tab.value = 'wbs'
  await load()
})

watch(() => app.currentProjectId, load)
</script>
