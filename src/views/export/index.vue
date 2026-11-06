<template>
  <div class="page">
    <div class="card">
      <h3 class="card-title">台账导出中心</h3>
      <el-form label-width="110px">
        <el-form-item label="项目">
          <el-select v-model="projectIds" multiple collapse-tags collapse-tags-tooltip placeholder="不选则导出全部项目" style="width: 100%">
            <el-option v-for="p in app.projects" :key="p.id" :label="`${p.code} ${p.name}`" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="单据类型">
          <el-select v-model="docKeys" multiple collapse-tags collapse-tags-tooltip placeholder="不选则导出全部 32 类" style="width: 100%">
            <el-option v-for="d in docs" :key="d.key" :label="d.title" :value="d.key" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围">
          <el-date-picker v-model="range" type="daterange" value-format="x" start-placeholder="开始" end-placeholder="结束" />
          <span class="muted" style="margin-left: 10px">按各单据的业务日期筛选，含首尾日</span>
        </el-form-item>
        <el-form-item label="导出字段">
          <el-radio-group v-model="fieldMode">
            <el-radio value="all">全部列表字段</el-radio>
            <el-radio value="basic">仅基础字段（编号/日期/状态/金额）</el-radio>
            <el-radio value="custom">自定义勾选</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="fieldMode === 'custom'" label="选择字段">
          <div v-if="customDoc" class="field-picker">
            <el-checkbox-group v-model="customKeys">
              <el-checkbox v-for="f in customFields" :key="f.key" :value="f.key">{{ f.label }}</el-checkbox>
            </el-checkbox-group>
            <div class="muted" style="margin-top: 6px">
              已选 {{ customKeys.length }} / {{ customFields.length }} 个字段（项目列固定导出，不占勾选）
            </div>
          </div>
          <el-tag v-else type="warning" effect="plain">自定义字段需先在「单据类型」里选中**一个**类型</el-tag>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Download" :loading="busy" @click="doExport">生成 Excel</el-button>
          <el-button @click="reset">重置</el-button>
          <span v-if="preview" class="muted" style="margin-left: 12px">{{ preview }}</span>
        </el-form-item>
      </el-form>
      <el-alert type="info" :closable="false" show-icon>
        <template #title>导出规则</template>
        一条单据一行；附件只导文件名不导文件体；金额千分位、两位小数；多类型导出为多工作表。
      </el-alert>
    </div>

    <div class="card">
      <h3 class="card-title">快捷导出</h3>
      <div style="display: flex; gap: 10px; flex-wrap: wrap">
        <el-button v-for="d in quickDocs" :key="d.key" @click="quick(d.key)">{{ d.title }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Download } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { BUSINESS_DOCS, getDoc } from '@/core/docs'
import { listDocs } from '@/core/db/repo'
import { downloadWorkbook, type SheetSpec } from '@/core/services/excel'
import { fmtDate } from '@/shared/date'

const app = useAppStore()
const docs = BUSINESS_DOCS
const quickDocs = BUSINESS_DOCS.filter((d) => ['progress', 'visa', 'hazard', 'inspection', 'materialReceipt', 'settlement'].includes(d.key))
const projectIds = ref<string[]>([])
const docKeys = ref<string[]>([])
const range = ref<any>(null)
const fieldMode = ref<'all' | 'basic' | 'custom'>('all')
const customKeys = ref<string[]>([])
const busy = ref(false)
const preview = ref('')

const BASIC_KEYS = ['code', 'name', 'title', 'status', 'amount', 'total', 'reportDate', 'occurDate', 'inDate', 'createDate']

/** 自定义字段模式只在选中单一类型时可用（不同单据字段不同，不能混着勾） */
const customDoc = computed(() => (docKeys.value.length === 1 ? getDoc(docKeys.value[0]) : null))
const customFields = computed(() => (customDoc.value ? customDoc.value.fields.filter((f) => f.type !== 'attachment') : []))

watch(customDoc, (d) => {
  // 切换单据类型时给出全部字段的默认勾选，避免用户面对空白
  customKeys.value = d ? d.fields.filter((f) => f.type !== 'attachment').map((f) => f.key) : []
})

function columnsOf(key: string) {
  const cfg = getDoc(key)
  return cfg.fields
    .filter((f) => {
      if (f.type === 'attachment') return false
      if (fieldMode.value === 'custom') return customKeys.value.includes(f.key)
      if (fieldMode.value === 'all') return true
      return BASIC_KEYS.includes(f.key) || f.format === 'money' || f.format === 'date' || f.format === 'status'
    })
    .map((f) => ({ header: f.label, key: f.key, money: f.format === 'money', width: f.format === 'money' ? 16 : 14 }))
}

async function doExport() {
  if (fieldMode.value === 'custom') {
    if (!customDoc.value) {
      ElMessage.warning('自定义字段模式请先在「单据类型」里选中一个类型')
      return
    }
    if (!customKeys.value.length) {
      ElMessage.warning('请至少勾选一个导出字段')
      return
    }
  }
  const targets = docKeys.value.length ? docKeys.value : docs.map((d) => d.key)
  const pids = projectIds.value.length ? projectIds.value : app.projects.map((p) => p.id)
  if (!pids.length) {
    ElMessage.warning('没有可导出的项目')
    return
  }
  busy.value = true
  preview.value = ''
  try {
    const sheets: SheetSpec[] = []
    let totalRows = 0
    for (const key of targets) {
      const cfg = getDoc(key)
      const allRows: any[] = []
      for (const pid of pids) {
        const res = await listDocs(cfg.table, {
          projectId: pid,
          page: 1,
          pageSize: 100000,
          from: range.value?.length ? Number(range.value[0]) : null,
          to: range.value?.length ? new Date(Number(range.value[1])).setHours(23, 59, 59, 999) : null,
          dateField: cfg.dateField
        })
        allRows.push(...res.rows)
      }
      if (!allRows.length) continue
      const columns = columnsOf(key)
      if (!columns.length) continue
      const rows = allRows.map((r) => {
        const o: any = { ...r }
        for (const f of cfg.fields) {
          if (f.format === 'date') o[f.key] = fmtDate(r[f.key])
          if (f.type === 'wbs') o[f.key] = app.wbsName(r[f.key])
        }
        o.__project = app.projectName(r.projectId)
        return o
      })
      sheets.push({
        name: cfg.title,
        columns: [{ header: '项目', key: '__project', width: 24 }, ...columns],
        rows
      })
      totalRows += rows.length
    }
    if (!sheets.length) {
      ElMessage.warning('所选条件下没有数据')
      return
    }
    await downloadWorkbook(sheets, `台账导出_${fmtDate(Date.now())}.xlsx`)
    preview.value = `已导出 ${sheets.length} 个工作表、${totalRows} 条记录`
    ElMessage.success(preview.value)
  } finally {
    busy.value = false
  }
}

async function quick(key: string) {
  docKeys.value = [key]
  await doExport()
}

async function reset() {
  projectIds.value = []
  docKeys.value = []
  range.value = null
  fieldMode.value = 'all'
  customKeys.value = []
  preview.value = ''
}

onMounted(async () => {
  await app.loadProjects()
})
</script>

<style scoped>
.field-picker {
  width: 100%;
  line-height: 2;
}
</style>
