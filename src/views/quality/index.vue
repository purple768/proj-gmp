<template>
  <div class="page">
    <DocTabs :items="items" />
  </div>
</template>

<script setup lang="ts">
import DocTabs from '@/components/DocTabs.vue'

const items = [
  { key: 'qualityPlan', label: '质量计划' },
  { key: 'inspection', label: '检验批记录' },
  { key: 'concealment', label: '隐蔽验收' },
  { key: 'testRecord', label: '试件试验' },
  { key: 'defect', label: '质量缺陷整改' },
  { key: 'safetyPlan', label: '安全专项方案' },
  { key: 'briefing', label: '安全技术交底' },
  { key: 'hazard', label: '隐患排查复查' },
  { key: 'riskSource', label: '危险源清单' },
  { key: 'emergencyPlan', label: '应急预案' },
  { key: 'training', label: '安全教育培训' },
  { key: 'certificate', label: '特种作业证件' }
]
</script>
