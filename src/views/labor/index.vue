<template>
  <div class="page">
    <DocTabs :items="items" />
  </div>
</template>

<script setup lang="ts">
import DocTabs from '@/components/DocTabs.vue'

const items = [
  { key: 'team', label: '班组信息' },
  { key: 'worker', label: '人员实名' },
  { key: 'attendance', label: '考勤记录' },
  { key: 'teamMeasurement', label: '班组计量' },
  { key: 'payroll', label: '工资发放' }
]
</script>
