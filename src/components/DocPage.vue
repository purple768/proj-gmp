<template>
  <div class="doc-page">
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="搜索编号/名称/内容" clearable style="width: 220px" @keyup.enter="reload" @clear="reload" />
      <el-select
        v-if="statusField"
        v-model="statusFilter"
        multiple
        collapse-tags
        collapse-tags-tooltip
        placeholder="全部状态"
        clearable
        style="width: 200px"
        @change="reload"
      >
        <el-option v-for="o in statusOptions" :key="o" :label="o" :value="o" />
      </el-select>
      <el-date-picker
        v-if="cfg.dateField && cfg.dateField !== 'createdAt'"
        v-model="dateRange"
        type="daterange"
        start-placeholder="开始"
        end-placeholder="结束"
        value-format="x"
        style="width: 240px"
        @change="reload"
      />
      <el-button :icon="Search" @click="reload">查询</el-button>
      <el-button :icon="Refresh" text @click="reset">重置</el-button>
      <div class="spacer"></div>
      <el-button :icon="Download" @click="exportExcel">导出 Excel</el-button>
      <el-button type="primary" :icon="Plus" @click="openCreate">新增{{ shortTitle }}</el-button>
    </div>

    <el-table :data="rows" v-loading="loading" border size="default" height="calc(100vh - 250px)" empty-text="暂无数据">
      <el-table-column type="index" width="52" align="center" />
      <el-table-column
        v-for="f in listFields"
        :key="f.key"
        :label="f.label"
        :min-width="f.listWidth || defaultWidth(f)"
        :align="isNumber(f) ? 'right' : 'left'"
        show-overflow-tooltip
      >
        <template #default="{ row }">
          <template v-if="f.format === 'status' || (f.key === statusField && f.type === 'select')">
            <el-tag size="small" :type="tagType(row[f.key])" effect="light">{{ row[f.key] || '—' }}</el-tag>
          </template>
          <template v-else-if="f.format === 'money'">{{ formatMoney(row[f.key]) }}</template>
          <template v-else-if="f.format === 'percent'">{{ row[f.key] ?? 0 }}%</template>
          <template v-else-if="f.format === 'date'">{{ fmtDate(row[f.key]) }}</template>
          <template v-else-if="f.type === 'wbs'">{{ app.wbsName(row[f.key]) }}</template>
          <template v-else-if="f.type === 'ref'">{{ refLabel(f, row[f.key]) }}</template>
          <template v-else-if="f.type === 'attachment'">
            <span class="muted">{{ attachmentCount(row.id) }} 个</span>
          </template>
          <template v-else>{{ row[f.key] ?? '—' }}</template>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="190" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openView(row)">查看</el-button>
          <el-button link type="primary" :disabled="isLocked(row)" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="cfg.key === 'inspection' && row.result === '不合格'" link type="warning" @click="makeDefect(row)">建缺陷单</el-button>
          <el-button link type="primary" @click="print(row)">打印</el-button>
          <el-button link type="danger" :disabled="isLocked(row)" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <span class="muted">共 {{ total }} 条</span>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="sizes, prev, pager, next, jumper"
        @size-change="reload"
        @current-change="load"
      />
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      :width="dialogWidth"
      top="6vh"
      destroy-on-close
      :close-on-click-modal="false"
      @closed="onDialogClosed"
    >
      <el-alert v-if="locked" type="info" :closable="false" :title="cfg.lockReason || '该单据已锁定，仅可查看'" style="margin-bottom: 12px" />
      <el-alert v-if="warnings.length" type="warning" :closable="false" style="margin-bottom: 12px">
        <div v-for="(w, i) in warnings" :key="i">{{ w }}</div>
      </el-alert>
      <el-form ref="formRef" :model="form" label-width="112px" :disabled="readonly">
        <el-row :gutter="16">
          <el-col v-for="f in formFields" :key="f.key" :span="f.span || 12">
            <el-form-item :label="f.label" :error="errorOf(f.key)" :required="f.required">
              <el-input
                v-if="f.type === 'text' && f.key !== cfg.codeField"
                v-model="form[f.key]"
                :placeholder="f.placeholder || `请输入${f.label}`"
                clearable
              />
              <el-input v-else-if="f.type === 'autoCode'" v-model="form[f.key]">
                <template #append>
                  <el-button :disabled="readonly" @click="regenCode">重新取号</el-button>
                </template>
              </el-input>
              <el-input v-else-if="f.type === 'textarea'" v-model="form[f.key]" type="textarea" :rows="f.rows || 2" :placeholder="f.placeholder" />
              <el-input-number
                v-else-if="f.type === 'number'"
                v-model="form[f.key]"
                :min="f.min ?? 0"
                :max="f.max"
                :precision="f.precision ?? 3"
                :controls="false"
                style="width: 100%"
              />
              <el-input-number
                v-else-if="f.type === 'money'"
                v-model="form[f.key]"
                :min="f.min ?? 0"
                :max="f.max"
                :precision="2"
                :controls="false"
                style="width: 100%"
              />
              <el-input-number
                v-else-if="f.type === 'percent'"
                v-model="form[f.key]"
                :min="0"
                :max="100"
                :precision="0"
                :controls="false"
                style="width: 100%"
              />
              <el-date-picker
                v-else-if="f.type === 'date'"
                :model-value="form[f.key]"
                type="date"
                value-format="x"
                placeholder="选择日期"
                style="width: 100%"
                @update:model-value="(v: any) => (form[f.key] = v ? Number(v) : null)"
              />
              <el-select v-else-if="f.type === 'select'" v-model="form[f.key]" :placeholder="`请选择${f.label}`" clearable style="width: 100%">
                <el-option v-for="o in normOptions(f)" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-radio-group v-else-if="f.type === 'radio'" v-model="form[f.key]">
                <el-radio v-for="o in normOptions(f)" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
              </el-radio-group>
              <el-checkbox-group v-else-if="f.type === 'checkbox'" v-model="form[f.key]">
                <el-checkbox v-for="o in normOptions(f)" :key="o.value" :value="o.value">{{ o.label }}</el-checkbox>
              </el-checkbox-group>
              <el-select v-else-if="f.type === 'ref'" v-model="form[f.key]" filterable clearable style="width: 100%" :placeholder="`请选择${f.label}`">
                <el-option v-for="o in refOptions[f.ref || ''] || []" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-select v-else-if="f.type === 'wbs'" v-model="form[f.key]" filterable clearable style="width: 100%" :placeholder="`请选择${f.label}`">
                <el-option v-for="o in wbsOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <div v-else-if="f.type === 'computed'" class="computed">
                {{ computedText(f) }}
                <span class="muted" style="margin-left: 6px">自动计算</span>
              </div>
              <div v-else-if="f.type === 'attachment'" class="attach">
                <el-upload :auto-upload="false" :show-file-list="false" multiple :disabled="readonly" @change="onPickFiles">
                  <el-button :disabled="readonly" :icon="Upload">选择文件</el-button>
                </el-upload>
                <div v-if="attachments.length" class="files">
                  <div v-for="a in attachments" :key="a.id" class="file-row">
                    <el-link type="primary" @click="preview(a)">{{ a.fileName }}</el-link>
                    <span class="muted">{{ (a.size / 1024).toFixed(0) }} KB</span>
                    <el-button v-if="!readonly" link type="danger" @click="removeAttachment(a)">移除</el-button>
                  </div>
                </div>
                <span v-else class="muted">支持任意大小，图片/PDF 可预览</span>
              </div>
              <div v-else class="computed">{{ form[f.key] ?? '—' }}</div>
              <div v-if="f.help" class="muted" style="font-size: 12px">{{ f.help }}</div>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">关闭</el-button>
        <el-button v-if="cfg.key === 'payroll' && !readonly" @click="fillPayroll">按已审核计量取数</el-button>
        <el-button v-if="locked && !readonly" type="warning" @click="unlock">撤销锁定</el-button>
        <el-button v-if="!readonly" type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, Download, Upload } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { getDoc } from '@/core/docs'
import { createDoc, listDocs, rawRows, softDeleteDoc, tbl, updateDoc, getDoc as getRow } from '@/core/db/repo'
import { applyComputed, defaultRow, formFields as ff, listFields as lf, normalizeNumbers } from '@/core/engine/validate'
import type { FieldDef } from '@/core/engine/types'
import { createDefectFromInspection, payrollSuggestion } from '@/core/services/quality'
import { nextCode, resolvePrefix } from '@/core/services/number'
import { addAttachment, attachmentUrl, bindTempAttachments, checkQuota, discardTempAttachments, listAttachments, readAttachment, releaseAttachment } from '@/core/services/attachment'
import { afterSave, beforeDelete, beforeSave } from '@/core/services/hooks'
import { fmtDate } from '@/shared/date'
import { formatMoney } from '@/shared/money'
import { downloadWorkbook } from '@/core/services/excel'
import { useRoute, useRouter } from 'vue-router'
import { uid } from '@/shared/id'

const props = defineProps<{ docKey: string }>()
const app = useAppStore()
const route = useRoute()
const router = useRouter()

const cfg = computed(() => getDoc(props.docKey))
const listFields = computed(() => lf(cfg.value))
const formFields = computed(() => ff(cfg.value))
const shortTitle = computed(() => cfg.value.title.replace(/单$|台账$|记录$|管理$/, ''))
const statusField = computed(() => cfg.value.statusField)
const statusOptions = computed(() => {
  const f = cfg.value.fields.find((x) => x.key === statusField.value)
  return f ? f.options?.map((o) => (typeof o === 'string' ? o : o.value)) || [] : []
})

const rows = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const keyword = ref('')
const statusFilter = ref<string[]>([])
const dateRange = ref<any>(null)
const loading = ref(false)
const saving = ref(false)
const attachmentsAll = ref<any[]>([])

const dialogVisible = ref(false)
const mode = ref<'create' | 'edit' | 'view'>('create')
const form = reactive<any>({})
const errors = ref<{ key: string; message: string }[]>([])
const warnings = ref<string[]>([])
const tempId = ref('')
const attachments = ref<any[]>([])
const refOptions = reactive<Record<string, any[]>>({})

const locked = computed(() => {
  if (mode.value === 'create') return false
  return !!cfg.value.lock?.(form)
})
const readonly = computed(() => mode.value === 'view' || locked.value)
const dialogTitle = computed(() => (mode.value === 'create' ? `新增${cfg.value.title}` : mode.value === 'edit' ? `编辑${cfg.value.title}` : `查看${cfg.value.title}`))
const dialogWidth = computed(() => (formFields.value.some((f) => (f.span || 12) === 24) ? '860px' : '700px'))
const wbsOptions = computed(() =>
  app.wbs.map((w) => ({
    value: w.id,
    label: `${'　'.repeat(depthOf(w))}${w.code} ${w.name}`
  }))
)

function depthOf(w: any): number {
  let d = 0
  let cur = w
  let guard = 0
  while (cur?.parentId && guard++ < 20) {
    cur = app.wbs.find((x) => x.id === cur.parentId)
    if (cur) d++
  }
  return d
}

function isNumber(f: FieldDef) {
  return ['money', 'number', 'percent'].includes(f.type)
}

function defaultWidth(f: FieldDef) {
  if (f.type === 'textarea') return 200
  if (f.type === 'money' || f.type === 'number' || f.type === 'percent') return 120
  if (f.type === 'date') return 120
  return 150
}

function normOptions(f: FieldDef) {
  return (f.options || []).map((o: any) => (typeof o === 'string' ? { label: o, value: o } : o))
}

function errorOf(key: string) {
  return errors.value.find((e) => e.key === key)?.message || ''
}

function tagType(v: any) {
  const s = String(v || '')
  if (['不合格', '紧急', '重大', '已过期', '退场', '驳回', '超支'].some((x) => s.includes(x))) return 'danger'
  if (['部分', '待', '中', '继续'].some((x) => s.includes(x))) return 'warning'
  if (['合格', '已结清', '已发放', '已批', '已审核', '闭环', '正常', '在用', '在岗', '在库', '是'].some((x) => s.includes(x))) return 'success'
  return 'info'
}

function refLabel(f: FieldDef, id: string) {
  if (!id) return '—'
  const list = refOptions[f.ref || ''] || []
  return list.find((o) => o.value === id)?.label || '—'
}

function computedText(f: FieldDef) {
  const v = form[f.key]
  if (v === null || v === undefined || v === '') return '—'
  if (f.format === 'money') return formatMoney(v)
  if (f.format === 'percent') return `${v}%`
  return String(v)
}

async function loadRefs() {
  for (const f of cfg.value.fields) {
    if (f.type === 'ref' && f.ref) {
      const rows = await rawRows(f.ref, app.currentProjectId || null)
      const alive = rows.filter((r: any) => r.deletedAt == null)
      refOptions[f.ref] = alive.map((r: any) => ({
        value: r.id,
        label: `${r.code ? r.code + ' ' : ''}${r[f.refLabel || 'name'] || r.name || r.title || ''}`
      }))
    }
  }
}

async function loadAttachmentsAll() {
  const all: any[] = await tbl('attachments').toArray()
  attachmentsAll.value = all.filter((a) => a.docType === props.docKey && (a.state === 'active' || a.state === 'temp'))
}

function attachmentCount(id: string) {
  return attachmentsAll.value.filter((a) => a.docId === id).length
}

async function load() {
  loading.value = true
  try {
    const ranges: Record<string, [any, any]> = {}
    if (dateRange.value?.length === 2) {
      // 日期区间含首尾日（R-17）
      const end = new Date(Number(dateRange.value[1]))
      end.setHours(23, 59, 59, 999)
      ranges[cfg.value.dateField || 'createdAt'] = [Number(dateRange.value[0]), end.getTime()]
    }
    const res = await listDocs(cfg.value.table, {
      projectId: cfg.value.key === 'project' ? null : app.currentProjectId || null,
      keyword: keyword.value,
      searchFields: cfg.value.searchFields,
      filters: statusField.value && statusFilter.value.length ? { [statusField.value]: statusFilter.value } : {},
      ranges,
      page: page.value,
      pageSize: pageSize.value,
      dateField: cfg.value.dateField
    })
    rows.value = res.rows
    total.value = res.total
    await loadAttachmentsAll()
  } finally {
    loading.value = false
  }
}

function reload() {
  page.value = 1
  load()
}

function reset() {
  keyword.value = ''
  statusFilter.value = []
  dateRange.value = null
  reload()
}

async function openCreate() {
  mode.value = 'create'
  Object.keys(form).forEach((k) => delete form[k])
  Object.assign(form, defaultRow(cfg.value, app.currentProjectId))
  errors.value = []
  warnings.value = []
  tempId.value = uid()
  attachments.value = []
  form.code = await nextCode(await resolvePrefix(cfg.value.key, cfg.value.prefix))
  // 若表单有必填的项目引用字段则预填当前项目
  await loadRefs()
  dialogVisible.value = true
}

async function openEdit(row: any) {
  mode.value = 'edit'
  Object.keys(form).forEach((k) => delete form[k])
  Object.assign(form, JSON.parse(JSON.stringify(row)))
  errors.value = []
  warnings.value = []
  tempId.value = uid()
  await loadRefs()
  attachments.value = await listAttachments(cfg.value.key, row.id)
  dialogVisible.value = true
}

async function openView(row: any) {
  mode.value = 'view'
  Object.keys(form).forEach((k) => delete form[k])
  Object.assign(form, JSON.parse(JSON.stringify(row)))
  errors.value = []
  warnings.value = []
  tempId.value = uid()
  await loadRefs()
  attachments.value = await listAttachments(cfg.value.key, row.id)
  dialogVisible.value = true
}

async function regenCode() {
  form.code = await nextCode(await resolvePrefix(cfg.value.key, cfg.value.prefix))
}

async function onPickFiles(file: any) {
  const raw: File = file.raw
  if (!raw) return
  const sizeMb = (raw.size / 1024 / 1024).toFixed(1)
  // R-06：写之前先看配额，80% 黄条提醒但不拦，接近上限才拦大文件
  const quota = await checkQuota(raw.size)
  if (quota.level === 'warn') ElMessage.warning(quota.message || '存储容量紧张')
  if (!quota.ok) {
    ElMessage.error(quota.message || '存储容量不足，无法上传')
    return
  }
  const targetId = mode.value === 'create' ? tempId.value : form.id
  try {
    await addAttachment(cfg.value.key, targetId, raw, raw.name, mode.value === 'create' ? 'temp' : 'active')
    attachments.value = await listAttachments(cfg.value.key, targetId)
    await loadAttachmentsAll()
    ElMessage.success(`已上传 ${raw.name}（${sizeMb} MB）`)
  } catch (e: any) {
    // 容量不足 / 授权失效 / 文件被占用 三种原因已在服务层分好文案
    ElMessage.error(e?.message || '上传失败，请检查存储空间或目录授权')
  }
}

async function preview(a: any) {
  const url = await attachmentUrl(a)
  if (!url) {
    ElMessage.error('文件不存在，可能已被移动或删除')
    return
  }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(a.ext)) {
    window.open(url, '_blank')
  } else if (a.ext === 'pdf') {
    window.open(url, '_blank')
  } else {
    const link = document.createElement('a')
    link.href = url
    link.download = a.fileName
    link.click()
  }
}

async function removeAttachment(a: any) {
  await releaseAttachment(a.id)
  attachments.value = await listAttachments(cfg.value.key, mode.value === 'create' ? tempId.value : form.id)
  await loadAttachmentsAll()
}

function isLocked(row: any) {
  return !!cfg.value.lock?.(row)
}

const unlockMap: Record<string, { field: string; value: any }> = {
  hazard: { field: 'status', value: '整改中' },
  defect: { field: 'checkResult', value: '继续整改' },
  safetyPlan: { field: 'status', value: '待审' },
  settlement: { field: 'status', value: '部分收款' },
  payroll: { field: 'status', value: '待发放' },
  visa: { field: 'confirmStatus', value: '待确认' }
}

async function unlock() {
  const rule = unlockMap[cfg.value.key]
  if (!rule) return
  await ElMessageBox.confirm('撤销后该单据可再次编辑，是否继续？', '撤销锁定', { type: 'warning' })
  await updateDoc(cfg.value.table, form.id, { [rule.field]: rule.value })
  form[rule.field] = rule.value
  ElMessage.success('已撤销锁定')
  await load()
}

/** 检验批不合格 → 一键建缺陷单（AC-17），幂等：同一检验批重复点不会建第二张 */
async function makeDefect(row: any) {
  try {
    const defect = await createDefectFromInspection(row.id)
    ElMessage.success(`已生成缺陷整改单 ${defect?.code || ''}（来源 ${row.code}）`)
    await load()
  } catch (e: any) {
    ElMessage.error(e?.message || '生成缺陷单失败')
  }
}

/** 工资发放「按已审核计量取数」（R-12 / AC 劳务链） */
async function fillPayroll() {
  const projectId = form.projectId || app.currentProjectId
  if (!projectId || !form.teamId) {
    ElMessage.warning('请先选择班组')
    return
  }
  const month = String(form.month || fmtDate(Date.now()).slice(0, 7))
  const res = await payrollSuggestion(projectId, form.teamId, month)
  if (!res.total) {
    ElMessage.warning(`${month} 该班组没有已审核的计量，无法取数`)
    return
  }
  form.month = month
  form.amount = res.total
  form.headCount = res.headCount
  ElMessage.success(`已取 ${month} 已审核计量 ¥${formatMoney(res.total)}，在岗 ${res.headCount} 人`)
}

async function submit() {
  errors.value = []
  warnings.value = []
  const payload = normalizeNumbers(cfg.value, applyComputed(cfg.value, { ...form }))
  if (cfg.value.key !== 'project') payload.projectId = payload.projectId || app.currentProjectId
  const check = await beforeSave(cfg.value, payload)
  if (check.fieldErrors.length || check.errors.length) {
    errors.value = [...check.fieldErrors, ...check.errors.map((m) => ({ key: '', message: m }))]
    if (!check.fieldErrors.length) ElMessage.error(check.errors[0])
    else ElMessage.error(check.fieldErrors[0].message)
    return
  }
  warnings.value = check.warnings
  saving.value = true
  try {
    let saved: any
    if (mode.value === 'create') {
      saved = await createDoc(cfg.value.table, payload)
      await bindTempAttachments(cfg.value.key, tempId.value, saved.id)
      await afterSave(cfg.value, saved, true)
    } else {
      saved = await updateDoc(cfg.value.table, form.id, payload)
      await afterSave(cfg.value, saved, false)
    }
    ElMessage.success('已保存')
    if (cfg.value.key === 'project') await app.loadProjects()
    await load()
    if (check.warnings.length) {
      ElMessage.warning(check.warnings.join('；'))
    }
    if (mode.value === 'view') dialogVisible.value = false
    else dialogVisible.value = false
  } catch (e: any) {
    ElMessage.error(e?.message || '保存失败')
  } finally {
    saving.value = false
  }
}

async function remove(row: any) {
  try {
    await beforeDelete(cfg.value, row)
  } catch (e: any) {
    ElMessage.error(e.message)
    return
  }
  await ElMessageBox.confirm(`删除后可在回收站恢复（保留 90 天），确认删除 ${row.code || ''}？`, '删除确认', {
    type: 'warning',
    confirmButtonText: '删除',
    confirmButtonClass: 'el-button--danger'
  })
  await softDeleteDoc(cfg.value.table, row.id)
  ElMessage.success('已移入回收站')
  await load()
}

function print(row: any) {
  const url = router.resolve({ path: `/print/${cfg.value.key}/${row.id}` }).href
  window.open(url, '_blank')
}

async function exportExcel() {
  const res = await listDocs(cfg.value.table, {
    projectId: cfg.value.key === 'project' ? null : app.currentProjectId || null,
    keyword: keyword.value,
    searchFields: cfg.value.searchFields,
    filters: statusField.value && statusFilter.value.length ? { [statusField.value]: statusFilter.value } : {},
    page: 1,
    pageSize: 100000
  })
  const columns = [
    ...listFields.value.map((f) => ({
      header: f.label,
      key: f.key,
      money: f.format === 'money',
      width: f.format === 'money' ? 16 : 14
    }))
  ]
  const data = res.rows.map((r) => {
    const o: any = { ...r }
    for (const f of listFields.value) {
      if (f.type === 'wbs') o[f.key] = app.wbsName(r[f.key])
      if (f.format === 'date') o[f.key] = fmtDate(r[f.key])
      if (f.type === 'ref') o[f.key] = refLabel(f, r[f.key])
    }
    return o
  })
  await downloadWorkbook([{ name: cfg.value.title, columns, rows: data }], `${cfg.value.title}_${fmtDate(Date.now())}.xlsx`)
  ElMessage.success(`已导出 ${data.length} 条`)
}

function onDialogClosed() {
  if (mode.value === 'create' && tempId.value) discardTempAttachments(cfg.value.key, tempId.value)
}

/** 首页卡片等入口可通过 ?status=A,B 预置状态筛选（AC-14 要求下钻后条数与卡片一致） */
function applyStatusQuery() {
  const raw = route.query.status
  const list = raw ? String(raw).split(',').map((s) => s.trim()).filter(Boolean) : []
  const allowed = statusOptions.value
  statusFilter.value = allowed.length ? list.filter((s) => allowed.includes(s)) : list
}

onMounted(async () => {
  await app.loadProjects()
  applyStatusQuery()
  await load()
  const tab = route.query.tab as string
  if (tab && tab === props.docKey && (route.query.action as string) === 'create') openCreate()
})

watch(() => app.currentProjectId, () => reload())
watch(() => props.docKey, () => reload())
watch(() => route.query.status, () => { applyStatusQuery(); reload() })
</script>

<style scoped>
.doc-page {
  padding: 0;
}

.pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0 0;
}

.computed {
  min-height: 32px;
  display: flex;
  align-items: center;
  color: var(--gmp-text-2);
  font-variant-numeric: tabular-nums;
}

.attach {
  width: 100%;
}

.files {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
</style>
