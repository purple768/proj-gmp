<template>
  <div class="page">
    <div class="card">
      <div class="toolbar">
        <h3 class="card-title" style="margin: 0">回收站</h3>
        <el-tag type="info" effect="plain">软删除保留 90 天，到期启动时自动清理</el-tag>
        <div class="spacer"></div>
        <el-date-picker v-model="range" type="daterange" value-format="x" start-placeholder="删除开始" end-placeholder="删除结束" style="width: 240px" @change="load" />
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button type="danger" plain @click="cleanup">立即清理到期记录</el-button>
      </div>

      <el-alert v-if="soon.length" type="warning" :closable="false" style="margin-bottom: 12px">
        有 {{ soon.length }} 条记录将在 7 天内被清理：{{ soon.slice(0, 5).map((s) => s.code).join('、') }}{{ soon.length > 5 ? ' 等' : '' }}
      </el-alert>

      <el-table :data="filtered" border size="default" empty-text="回收站是空的">
        <el-table-column label="单据类型" width="150">
          <template #default="{ row }">{{ docTitle(row.docType) }}</template>
        </el-table-column>
        <el-table-column prop="code" label="单据编号" width="170" />
        <el-table-column prop="title" label="名称/摘要" min-width="180" show-overflow-tooltip />
        <el-table-column label="项目" width="180">
          <template #default="{ row }">{{ row.projectName || '—' }}</template>
        </el-table-column>
        <el-table-column label="删除时间" width="160">
          <template #default="{ row }">{{ fmtDateTime(row.deletedAt) }}</template>
        </el-table-column>
        <el-table-column label="到期清理" width="180">
          <template #default="{ row }">
            <span :class="row.daysLeft <= 7 ? 'text-danger' : ''">{{ fmtDate(row.expireAt) }}（剩 {{ row.daysLeft }} 天）</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="restore(row)">恢复</el-button>
            <el-button link type="danger" @click="purge(row)">永久删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { cleanupExpired, expiringSoon, listTrash, purgeDoc, restoreDoc_, type TrashItem } from '@/core/services/trash'
import { fmtDate, fmtDateTime } from '@/shared/date'
import { docTitle } from '@/core/services/search'

const all = ref<TrashItem[]>([])
const range = ref<any>(null)

const filtered = computed(() =>
  all.value.filter((r) => {
    if (!range.value?.length) return true
    const end = new Date(Number(range.value[1]))
    end.setHours(23, 59, 59, 999)
    return r.deletedAt >= Number(range.value[0]) && r.deletedAt <= end.getTime()
  })
)
const soon = computed(() => expiringSoon(all.value))

async function load() {
  all.value = await listTrash()
}

async function restore(row: TrashItem) {
  const res = await restoreDoc_(row.table, row.docId)
  if (res.ok) {
    ElMessage.success(res.message || '已恢复')
    await load()
  } else {
    ElMessage.error(res.message || '恢复失败')
  }
}

async function purge(row: TrashItem) {
  await ElMessageBox.confirm('永久删除后数据无法恢复，是否继续？', '永久删除', {
    type: 'warning',
    confirmButtonText: '永久删除',
    confirmButtonClass: 'el-button--danger'
  })
  await purgeDoc(row.table, row.docId)
  ElMessage.success('已永久删除')
  await load()
}

async function cleanup() {
  const res = await cleanupExpired()
  ElMessage.success(`已清理 ${res.removed} 条到期记录${res.failed.length ? `，${res.failed.length} 条失败` : ''}`)
  await load()
}

onMounted(load)
</script>
