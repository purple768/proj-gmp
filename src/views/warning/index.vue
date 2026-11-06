<template>
  <div class="page">
    <div class="card">
      <div class="toolbar">
        <el-radio-group v-model="readFilter" size="default" @change="load">
          <el-radio-button value="unread">未读 {{ unreadCount }}</el-radio-button>
          <el-radio-button value="all">全部 {{ items.length }}</el-radio-button>
        </el-radio-group>
        <el-select v-model="priority" placeholder="全部优先级" clearable style="width: 140px" @change="load">
          <el-option label="紧急" value="紧急" />
          <el-option label="一般" value="一般" />
        </el-select>
        <el-select v-model="type" placeholder="全部类型" clearable style="width: 160px" @change="load">
          <el-option v-for="t in types" :key="t" :label="t" :value="t" />
        </el-select>
        <div class="spacer"></div>
        <el-button :disabled="!unreadCount" @click="markAll">全部标记已读</el-button>
        <el-button :icon="Refresh" @click="load">刷新</el-button>
      </div>

      <el-table :data="filtered" border size="default" empty-text="暂无预警">
        <el-table-column label="优先级" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.priority === '紧急' ? 'danger' : 'warning'">{{ row.priority }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column label="项目" width="180">
          <template #default="{ row }">{{ app.projectName(row.projectId) }}</template>
        </el-table-column>
        <el-table-column prop="content" label="预警内容" min-width="320" show-overflow-tooltip />
        <el-table-column label="来源单据" width="160">
          <template #default="{ row }">
            <el-button link type="primary" @click="openSource(row)">{{ row.code }}</el-button>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.read ? 'info' : 'success'">{{ row.read ? '已读' : '未读' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" align="center">
          <template #default="{ row }">
            <el-button link type="primary" :disabled="row.read" @click="markOne(row)">标记已读</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="drawer" :title="`来源单据 ${current?.code || ''}`" size="480px">
      <template v-if="current">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="预警类型">{{ current.type }}</el-descriptions-item>
          <el-descriptions-item label="优先级">{{ current.priority }}</el-descriptions-item>
          <el-descriptions-item label="内容">{{ current.content }}</el-descriptions-item>
          <el-descriptions-item label="项目">{{ app.projectName(current.projectId) }}</el-descriptions-item>
          <el-descriptions-item label="单据类型">{{ docTitle(current.docType) }}</el-descriptions-item>
        </el-descriptions>
        <div style="margin-top: 12px; display: flex; gap: 8px">
          <el-button type="primary" @click="gotoDoc(current)">打开单据模块</el-button>
          <el-button @click="markOne(current)">标记已读</el-button>
        </div>
        <el-empty v-if="!sourceFields.length" description="该预警为计算类提醒，无独立单据" :image-size="80" />
        <el-descriptions v-else :column="1" border size="small" style="margin-top: 12px">
          <el-descriptions-item v-for="f in sourceFields" :key="f.label" :label="f.label">{{ f.value }}</el-descriptions-item>
        </el-descriptions>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'
import { markRead, warningsWithRead } from '@/core/services/warning'
import { getDoc } from '@/core/docs'
import { fmtDate } from '@/shared/date'
import { formatMoney } from '@/shared/money'
import { docTitle } from '@/core/services/search'

const app = useAppStore()
const router = useRouter()
const items = ref<any[]>([])
const readFilter = ref<'unread' | 'all'>('unread')
const priority = ref('')
const type = ref('')
const drawer = ref(false)
const current = ref<any>(null)
const sourceFields = ref<{ label: string; value: any }[]>([])

const unreadCount = computed(() => items.value.filter((i) => !i.read).length)
const types = computed(() => Array.from(new Set(items.value.map((i) => i.type))))
const filtered = computed(() =>
  items.value.filter((i) => {
    if (readFilter.value === 'unread' && i.read) return false
    if (priority.value && i.priority !== priority.value) return false
    if (type.value && i.type !== type.value) return false
    return true
  })
)

async function load() {
  await app.loadProjects()
  items.value = await warningsWithRead({ projectId: app.currentProjectId || null })
}

async function markOne(row: any) {
  await markRead([row.key])
  row.read = true
  ElMessage.success('已标记已读')
}

async function markAll() {
  const keys = items.value.filter((i) => !i.read).map((i) => i.key)
  await markRead(keys)
  items.value.forEach((i) => (i.read = true))
  ElMessage.success(`已标记 ${keys.length} 条为已读`)
}

async function openSource(row: any) {
  current.value = row
  drawer.value = true
  sourceFields.value = []
  const cfg = getDoc(row.docType)
  if (!cfg) return
  const doc: any = await (await import('@/core/db/repo')).getDoc(cfg.table, row.docId)
  if (!doc || !Object.keys(doc).length) return
  sourceFields.value = cfg.fields
    .filter((f) => f.type !== 'attachment' && doc[f.key] !== undefined && doc[f.key] !== null && doc[f.key] !== '')
    .slice(0, 12)
    .map((f) => ({
      label: f.label,
      value: f.format === 'money' ? formatMoney(doc[f.key]) : f.format === 'date' ? fmtDate(doc[f.key]) : doc[f.key]
    }))
}

function gotoDoc(row: any) {
  const map: Record<string, string> = {
    hazard: '/quality?tab=hazard',
    defect: '/quality?tab=defect',
    certificate: '/quality?tab=certificate',
    equipment: '/material?tab=ledger',
    settlement: '/contract?tab=settlement',
    budget: '/cost?tab=four',
    stockFlow: '/material?tab=balance',
    inspection: '/quality?tab=inspection',
    concealment: '/quality?tab=concealment',
    testRecord: '/quality?tab=testRecord'
  }
  router.push(map[row.docType] || '/dashboard')
}

onMounted(load)
</script>
