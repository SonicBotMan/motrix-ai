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
let unlistenFileDrop: (() => void) | null = null
let clipboardPoller: ReturnType<typeof setInterval> | null = null
let lastClipboardUrl = ''

onMounted(async () => {
  await configStore.init()
  // Own aria2 for the whole app lifetime — do not dispose from routed views.
  tasksStore.init().catch((e) => console.warn('aria2 init failed:', e))
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

  try {
    const { listen } = await import('@tauri-apps/api/event')
    unlistenFileDrop = await listen<string[]>('tauri://file-drop', async (event) => {
      for (const path of event.payload) {
        if (path.endsWith('.torrent')) {
          try {
            const { invoke } = await import('@tauri-apps/api/core')
            await invoke<string>('add_torrent_file', { path })
          } catch {
            /* skip invalid torrent files */
          }
        }
      }
    })
  } catch {
    /* not in Tauri context */
  }

  clipboardPoller = setInterval(async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (!text || text === lastClipboardUrl) return
      if (/^(magnet:|ed2k:\/\/|https?:\/\/|ftp:\/\/)/i.test(text.trim()) && text.trim().length < 2000) {
        lastClipboardUrl = text
      }
    } catch {
      /* clipboard not accessible */
    }
  }, 5000)
})

onUnmounted(() => {
  sched.stop()
  unlistenDeepLink?.()
  unlistenFileDrop?.()
  if (clipboardPoller) clearInterval(clipboardPoller)
  tasksStore.dispose().catch((e) => console.warn('aria2 dispose failed:', e))
})
</script>
<template>
  <n-message-provider>
    <router-view />
  </n-message-provider>
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
