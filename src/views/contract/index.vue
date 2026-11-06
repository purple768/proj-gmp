<template>
  <div class="page">
    <div class="summary card">
      <div class="sum-item">
        <span class="muted">应收未收</span>
        <strong class="text-warning">¥{{ formatMoney(ar.unreceived) }}</strong>
      </div>
      <div class="sum-item">
        <span class="muted">结算总额（未结清）</span>
        <strong>¥{{ formatMoney(ar.total) }}</strong>
      </div>
      <div class="sum-item">
        <span class="muted">已收金额</span>
        <strong class="text-success">¥{{ formatMoney(ar.received) }}</strong>
      </div>
      <div class="sum-item">
        <span class="muted">未结清结算单</span>
        <strong>{{ ar.count }} 张</strong>
      </div>
      <div class="spacer"></div>
      <span class="muted" style="font-size: 12px">结算总金额为手工录入，报审与签证仅作参考值</span>
    </div>
    <DocTabs :items="items" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive } from 'vue'
import DocTabs from '@/components/DocTabs.vue'
import { useAppStore } from '@/stores/app'
import { receivable } from '@/core/services/settlement'
import { formatMoney } from '@/shared/money'

const app = useAppStore()
const items = [
  { key: 'contract', label: '合同台账' },
  { key: 'change', label: '变更洽商' },
  { key: 'visa', label: '现场签证' },
  { key: 'submission', label: '进度报审' },
  { key: 'settlement', label: '结算及应收' }
]
const ar = reactive({ total: 0, received: 0, unreceived: 0, count: 0 })

onMounted(async () => {
  await app.loadProjects()
  Object.assign(ar, await receivable(app.currentProjectId || null))
})
</script>

<style scoped>
.summary {
  display: flex;
  align-items: center;
  gap: 32px;
  margin-bottom: 4px;
}

.sum-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
}

.sum-item strong {
  font-size: 18px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.spacer {
  flex: 1;
}
</style>
