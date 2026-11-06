<template>
  <div class="page">
    <div class="card">
      <h3 class="card-title">数据目录与存储</h3>
      <el-descriptions :column="3" border size="small">
        <el-descriptions-item label="存储模式">{{ backendText }}</el-descriptions-item>
        <el-descriptions-item label="附件占用">{{ (usage.used / 1024 / 1024).toFixed(1) }} MB</el-descriptions-item>
        <el-descriptions-item label="附件数量">{{ usage.count }} 个</el-descriptions-item>
      </el-descriptions>
      <el-progress
        v-if="usage.quota > 0"
        :percentage="Math.min(100, Math.round((usage.used / usage.quota) * 100))"
        :status="usedRatio >= 95 ? 'exception' : usedRatio >= 80 ? 'warning' : 'success'"
        :stroke-width="10"
        style="margin-top: 12px"
      />
      <el-alert v-if="usedRatio >= 80" :type="usedRatio >= 95 ? 'error' : 'warning'" :closable="false" show-icon style="margin-top: 10px">
        <template #title>存储容量已用 {{ usedRatio }}%</template>
        {{ usedRatio >= 95 ? '即将用尽：请尽快到回收站永久删除无用单据，或更换一个空间更大的数据目录。' : '建议清理回收站中不再需要的单据，或把附件目录换到更大的磁盘。' }}
      </el-alert>
      <div style="margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap">
        <el-button type="primary" :disabled="!supported.dir" @click="chooseDir">选择本地文件夹</el-button>
        <el-button @click="refreshStats">重新统计</el-button>
        <el-tag v-if="!supported.dir" type="warning" effect="plain">当前浏览器不支持目录授权，已使用浏览器内置存储</el-tag>
      </div>
      <el-alert type="info" :closable="false" show-icon style="margin-top: 12px">
        <template #title>为什么需要选一个文件夹</template>
        附件（图纸、照片、扫描件）直接存到你选的本地目录，不占浏览器配额、不受单文件大小限制。浏览器重启后可能需要点一次「重新授权」，数据不会丢。
      </el-alert>
    </div>

    <div class="card">
      <h3 class="card-title">
        单据编号前缀
        <span class="muted" style="font-weight: 400; font-size: 12px">仅影响之后新建的单据，旧编号不变</span>
      </h3>
      <div class="prefix-grid">
        <div v-for="d in docs" :key="d.key" class="prefix-item">
          <span class="prefix-label">{{ d.title }}</span>
          <el-input v-model="prefixes[d.key]" size="small" style="width: 110px" @change="savePrefix(d.key)" />
        </div>
      </div>
    </div>

    <div class="card">
      <h3 class="card-title">打印与抬头</h3>
      <el-form label-width="120px">
        <el-form-item label="单位名称">
          <el-input v-model="printOrg" style="width: 320px" placeholder="打印单据顶部显示的施工单位" @change="saveOrg" />
        </el-form-item>
        <el-form-item label="打印说明">
          <span class="muted">单据打印走浏览器打印（Ctrl+P 另存为 PDF），中文与分页由浏览器排版引擎保证</span>
        </el-form-item>
      </el-form>
    </div>

    <div class="card">
      <h3 class="card-title">备份与恢复</h3>
      <div class="toolbar">
        <el-button type="primary" :icon="Download" :loading="exporting" @click="doExport">导出整包备份</el-button>
        <el-button :icon="Upload" @click="pickImport">导入备份</el-button>
        <el-select v-model="policy" style="width: 180px">
          <el-option label="冲突时跳过" value="skip" />
          <el-option label="冲突时覆盖" value="overwrite" />
          <el-option label="冲突时另存 -R1" value="rename" />
        </el-select>
        <el-button type="danger" plain @click="pickRestoreAll">清空后整体恢复</el-button>
        <span v-if="lastExport" class="muted">{{ lastExport }}</span>
      </div>
      <el-alert type="warning" :closable="false" show-icon>
        备份包含全部表数据与附件文件；导入前建议先导出一份当前数据。「清空后整体恢复」用于换机迁移：先清空本地，再导入包内内容。
      </el-alert>
      <input ref="fileInput" type="file" accept=".zip" hidden @change="onImport" />
      <input ref="restoreInput" type="file" accept=".zip" hidden @change="onRestoreAll" />
    </div>

    <div class="card danger-zone">
      <h3 class="card-title">危险操作</h3>
      <el-button type="danger" plain @click="clearData">清空全部数据</el-button>
      <span class="muted" style="margin-left: 12px">会删除全部项目、单据与附件，不可恢复，建议先导出备份</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Upload } from '@element-plus/icons-vue'
import { BUSINESS_DOCS } from '@/core/docs'
import { allDocs, clearAllData, getDb, settingGet, settingSet } from '@/core/db/repo'
import { attachmentStats, currentBackend, dirAuthorized, pickDirectory, storageSupported } from '@/core/services/attachment'
import { exportBackup, importBackup } from '@/core/services/backup'
import { downloadBytes } from '@/core/services/download'
import { fmtDate } from '@/shared/date'
import { useAppStore } from '@/stores/app'

const app = useAppStore()
const docs = BUSINESS_DOCS
const supported = storageSupported()
const backend = ref(currentBackend())
const usage = reactive({ used: 0, count: 0, quota: 0 })
const prefixes = reactive<Record<string, string>>({})
const printOrg = ref('')
const policy = ref<'skip' | 'overwrite' | 'rename'>('skip')
const exporting = ref(false)
const lastExport = ref('')
const fileInput = ref<HTMLInputElement>()
const restoreInput = ref<HTMLInputElement>()

const backendText = ref('')
/** 已用比例（%），驱动进度条与黄条/红条提示（R-06） */
const usedRatio = computed(() => (usage.quota > 0 ? Math.round((usage.used / usage.quota) * 100) : 0))

async function refreshStats() {
  Object.assign(usage, await attachmentStats())
  backend.value = currentBackend()
  backendText.value = backend.value === 'dir' ? '本地文件夹（已授权）' : backend.value === 'opfs' ? '浏览器内置存储（OPFS）' : '内置存储（IndexedDB）'
}

async function chooseDir() {
  try {
    await pickDirectory()
    await refreshStats()
    ElMessage.success('已切换为本地文件夹存储')
  } catch (e: any) {
    ElMessage.error(e?.message || '选择目录失败')
  }
}

async function savePrefix(key: string) {
  const v = (prefixes[key] || '').trim().toUpperCase()
  await settingSet(`prefix:${key}`, v)
  ElMessage.success('已保存前缀')
}

async function saveOrg() {
  await settingSet('printOrg', printOrg.value)
  ElMessage.success('已保存')
}

async function doExport() {
  exporting.value = true
  try {
    const { bytes, stats } = await exportBackup()
    downloadBytes(bytes, `工程管理备份_${fmtDate(Date.now())}.zip`)
    lastExport.value = `已导出 ${stats.rows} 条记录、${stats.attachments} 个附件（${(stats.bytes / 1024 / 1024).toFixed(1)} MB）`
    await settingSet('lastBackupAt', Date.now())
    ElMessage.success('备份已生成')
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败')
  } finally {
    exporting.value = false
  }
}

function pickImport() {
  fileInput.value?.click()
}

/** AC-38：清空后整体恢复（换机迁移），必须先过红色二次确认 */
function pickRestoreAll() {
  restoreInput.value?.click()
}

async function onRestoreAll(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await ElMessageBox.confirm(
      '「清空后整体恢复」会先删除本机全部项目、单据与附件，再导入备份包内容。此操作不可撤销，确定继续？',
      '清空后整体恢复',
      { type: 'error', confirmButtonText: '清空并恢复', confirmButtonClass: 'el-button--danger' }
    )
    await ElMessageBox.confirm('请再次确认：本机现有数据将被完全替换。', '二次确认', {
      type: 'error',
      confirmButtonText: '确认替换'
    })
    const buf = new Uint8Array(await file.arrayBuffer())
    await clearAllData(false)
    const { report } = await importBackup(buf, 'overwrite')
    await ElMessageBox.alert(
      `恢复完成：新增 ${report.added}、覆盖 ${report.overwritten}、跳过 ${report.skipped}。页面将刷新。`,
      '完成',
      { type: 'success' }
    )
    location.hash = '#/dashboard'
    location.reload()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.message || '恢复失败')
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function onImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    await ElMessageBox.confirm(`将按「${policy.value === 'skip' ? '跳过' : policy.value === 'overwrite' ? '覆盖' : '另存'}」策略导入，是否继续？`, '导入备份', { type: 'warning' })
    const buf = new Uint8Array(await file.arrayBuffer())
    const { report } = await importBackup(buf, policy.value)
    ElMessage.success(`导入完成：新增 ${report.added}、覆盖 ${report.overwritten}、另存 ${report.renamed}、跳过 ${report.skipped}`)
    if (report.failed.length) console.warn(report.failed)
    await app.loadProjects()
    await refreshStats()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error(err?.message || '导入失败')
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function clearData() {
  await ElMessageBox.confirm('此操作会删除全部项目、单据与附件，且不可恢复。建议先导出备份。是否继续？', '清空全部数据', {
    type: 'error',
    confirmButtonText: '我已备份，继续清空',
    confirmButtonClass: 'el-button--danger'
  })
  await ElMessageBox.confirm('请再次确认：清空后无法找回。', '二次确认', { type: 'error', confirmButtonText: '确认清空' })
  await clearAllData(false)
  await ElMessageBox.alert('数据已清空，页面即将刷新', '完成', { type: 'success' })
  location.hash = '#/dashboard'
  location.reload()
}

onMounted(async () => {
  await app.loadProjects()
  await refreshStats()
  for (const d of docs) prefixes[d.key] = await settingGet<string>(`prefix:${d.key}`, d.prefix)
  printOrg.value = await settingGet<string>('printOrg', '')
  void allDocs('attachments')
  void dirAuthorized()
  void getDb()
})
</script>

<style scoped>
.prefix-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px 16px;
}

.prefix-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px dashed #f0f1f3;
  padding-bottom: 6px;
}

.prefix-label {
  font-size: 13px;
  color: var(--gmp-text-2);
}

.danger-zone {
  border-color: #ffd2d2;
  background: #fffafa;
}

@media (max-width: 1200px) {
  .prefix-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
