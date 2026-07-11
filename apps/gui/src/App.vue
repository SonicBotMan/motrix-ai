<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useSchedule, type ScheduleRule } from '@/composables/useSchedule'
import { useTasksStore } from '@/stores/tasks'

const configStore = useConfigStore()
const tasksStore = useTasksStore()

const activeRules = (): ScheduleRule[] => (configStore.config.schedule.rules ?? []).filter((r) => r.enabled !== false)

const sched = useSchedule(activeRules())

watch(
  () => configStore.config.schedule.rules,
  () => sched.setRules(activeRules()),
  { deep: true },
)

let unlistenDeepLink: (() => void) | null = null

onMounted(async () => {
  await configStore.init()
  sched.start()

  try {
    const { listen } = await import('@tauri-apps/api/event')
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    unlistenDeepLink = await listen<string>('deep-link-download', async (event) => {
      const url = event.payload
      const accepted = await confirm(`Add this download?\n\n${url.slice(0, 200)}`, {
        title: 'Download Request',
        kind: 'info',
      })
      if (accepted) {
        await tasksStore.addTask(url)
      }
    })
  } catch {
    /* not in Tauri context */
  }
})

onUnmounted(() => {
  sched.stop()
  unlistenDeepLink?.()
})
</script>
<template>
  <router-view />
</template>

<style>
/* Design tokens live in styles/tokens.css (imported in main.ts). */

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: var(--font-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
  background: var(--bg);
  color: var(--fg);
  overflow: hidden;
  transition:
    background var(--transition-base, 200ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    color var(--transition-base, 200ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: var(--fg-muted);
}
</style>
