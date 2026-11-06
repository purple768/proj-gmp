<template>
  <div class="print-wrap">
    <div class="print-toolbar no-print">
      <el-button @click="back">返回</el-button>
      <el-button type="primary" :icon="Printer" @click="print">打印 / 另存为 PDF</el-button>
      <span class="muted">A4 纵向 · 由浏览器排版，中文与分页无需额外字体</span>
    </div>

    <div v-if="!row" class="empty">单据不存在或已删除</div>

    <div v-else class="sheet">
      <div class="sheet-org">{{ org }}</div>
      <h1 class="sheet-title">{{ cfg.title }}</h1>
      <div class="sheet-meta">
        <span>编号：{{ row.code || '—' }}</span>
        <span>打印日期：{{ fmtDate(Date.now()) }}</span>
      </div>

      <table class="sheet-table">
        <tbody>
          <tr v-for="(pair, i) in pairs" :key="i">
            <template v-for="cell in pair" :key="cell.key">
              <th :style="{ width: cell.span === 24 ? '18%' : '15%' }">{{ cell.label }}</th>
              <td :colspan="cell.span === 24 ? 3 : 1">{{ cell.value }}</td>
            </template>
          </tr>
        </tbody>
      </table>

      <div v-if="attachmentNames.length" class="sheet-attach">
        <strong>附件：</strong>{{ attachmentNames.join('、') }}
      </div>

      <div class="sign-row">
        <span>编制：____________</span>
        <span>审核：____________</span>
        <span>批准：____________</span>
        <span>日期：____________</span>
      </div>

      <div class="sheet-foot">本单据由「工程管理本地版」打印生成，数据存于本机</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Printer } from '@element-plus/icons-vue'
import { getDoc } from '@/core/docs'
import { getDoc as getRow, settingGet } from '@/core/db/repo'
import { listAttachments } from '@/core/services/attachment'
import { fmtDate } from '@/shared/date'
import { formatMoney } from '@/shared/money'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const router = useRouter()
const app = useAppStore()
const docType = String(route.params.docType || '')
const id = String(route.params.id || '')
const row = ref<any>(null)
const org = ref('')
const attachmentNames = ref<string[]>([])
const cfg = computed(() => getDoc(docType))

const pairs = computed(() => {
  if (!row.value) return []
  const cells = cfg.value.fields
    .filter((f) => f.key !== 'attachments' && !f.formHidden)
    .map((f) => {
      const v = row.value[f.key]
      let text = v
      if (f.key === 'wbsId') text = app.wbsName(v)
      else if (f.type === 'ref') text = v ? '已关联' : '—'
      else if (f.format === 'money') text = formatMoney(v)
      else if (f.format === 'date') text = fmtDate(v)
      else if (f.format === 'percent') text = `${v ?? 0}%`
      if (text === null || text === undefined || text === '') text = '—'
      return { key: f.key, label: f.label, value: text, span: f.span || 12 }
    })
  const out: any[][] = []
  let buffer: any[] = []
  let used = 0
  for (const c of cells) {
    const width = c.span === 24 ? 24 : 12
    if (used + width > 24) {
      out.push(buffer)
      buffer = []
      used = 0
    }
    buffer.push(c)
    used += width
    if (used >= 24) {
      out.push(buffer)
      buffer = []
      used = 0
    }
  }
  if (buffer.length) out.push(buffer)
  return out
})

function print() {
  window.print()
}

function back() {
  history.length > 1 ? router.back() : router.push('/dashboard')
}

onMounted(async () => {
  await app.loadProjects()
  org.value = await settingGet<string>('printOrg', '')
  row.value = await getRow(cfg.value.table, id)
  if (row.value) {
    const atts = await listAttachments(docType, id)
    attachmentNames.value = atts.map((a) => a.fileName)
  }
})
</script>

<style scoped>
.print-wrap {
  min-height: 100vh;
  background: #f0f2f5;
  padding: 16px 0 40px;
}

.print-toolbar {
  max-width: 820px;
  margin: 0 auto 12px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.sheet {
  width: 210mm;
  min-height: 297mm;
  margin: 0 auto;
  background: #fff;
  padding: 18mm 16mm;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  color: #1d2129;
}

.sheet-org {
  text-align: center;
  font-size: 14px;
  letter-spacing: 1px;
  color: #4e5969;
  min-height: 20px;
}

.sheet-title {
  text-align: center;
  font-size: 22px;
  font-weight: 500;
  margin: 10px 0 14px;
  letter-spacing: 2px;
}

.sheet-meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #4e5969;
  border-bottom: 1.5px solid #1d2129;
  padding-bottom: 6px;
}

.sheet-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
  font-size: 12.5px;
  table-layout: fixed;
}

.sheet-table th,
.sheet-table td {
  border: 1px solid #4e5969;
  padding: 8px 10px;
  vertical-align: top;
  word-break: break-word;
}

.sheet-table th {
  background: #f7f8fa;
  font-weight: 500;
  text-align: left;
  color: #1d2129;
}

.sheet-attach {
  margin-top: 12px;
  font-size: 12.5px;
}

.sign-row {
  display: flex;
  justify-content: space-between;
  margin-top: 42px;
  font-size: 12.5px;
}

.sheet-foot {
  margin-top: 24px;
  font-size: 11px;
  color: #86909c;
  text-align: center;
  border-top: 1px dashed #c9cdd4;
  padding-top: 8px;
}

@media print {
  .print-wrap {
    background: #fff;
    padding: 0;
  }

  .sheet {
    width: auto;
    min-height: auto;
    box-shadow: none;
    padding: 0;
  }

  .no-print {
    display: none !important;
  }

  @page {
    size: A4 portrait;
    margin: 16mm;
  }
}
</style>
