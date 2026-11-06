<template>
  <div class="page">
    <el-tabs v-model="tab" @tab-change="onChange">
      <el-tab-pane v-for="i in items" :key="i.key" :label="i.label" :name="i.key">
        <DocPage v-if="tab === i.key" :doc-key="i.key" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DocPage from '@/components/DocPage.vue'

const props = defineProps<{ items: { key: string; label: string }[] }>()
const route = useRoute()
const router = useRouter()
const tab = ref(props.items[0]?.key || '')

function onChange(name: any) {
  router.replace({ query: { ...route.query, tab: String(name) } })
}

function syncFromRoute() {
  const q = route.query.tab as string
  if (q && props.items.some((i) => i.key === q)) tab.value = q
}

onMounted(syncFromRoute)
watch(() => route.query.tab, syncFromRoute)
</script>
