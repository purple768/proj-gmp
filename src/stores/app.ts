import { defineStore } from 'pinia'
import { allDocs } from '@/core/db/repo'

export const useAppStore = defineStore('app', {
  state: () => ({
    projects: [] as any[],
    currentProjectId: '' as string,
    wbs: [] as any[],
    ready: false,
    storageBackend: 'idb' as string,
    bootedAt: 0
  }),
  getters: {
    currentProject(state) {
      return state.projects.find((p) => p.id === state.currentProjectId) || null
    },
    projectName(state) {
      const map: Record<string, string> = {}
      for (const p of state.projects) map[p.id] = p.name
      return (id: string) => map[id] || '—'
    },
    wbsName(state) {
      const map: Record<string, string> = {}
      for (const w of state.wbs) map[w.id] = `${w.code} ${w.name}`
      return (id: string) => (id ? map[id] || '—' : '—')
    }
  },
  actions: {
    async loadProjects() {
      this.projects = (await allDocs('projects')).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      if (!this.currentProjectId || !this.projects.some((p) => p.id === this.currentProjectId)) {
        this.currentProjectId = this.projects[0]?.id || ''
      }
      await this.loadWbs()
    },
    async loadWbs() {
      this.wbs = this.currentProjectId ? await allDocs('wbs', this.currentProjectId) : []
    },
    async switchProject(id: string) {
      this.currentProjectId = id
      await this.loadWbs()
    }
  }
})
