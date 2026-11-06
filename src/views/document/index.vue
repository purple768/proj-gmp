<template>
  <div class="page">
    <DocTabs :items="items" />
  </div>
</template>

<script setup lang="ts">
import DocTabs from '@/components/DocTabs.vue'

const items = [
  { key: 'drawing', label: '图纸版本' },
  { key: 'archive', label: '资料归档借阅' }
]
</script>
