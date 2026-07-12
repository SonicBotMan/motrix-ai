<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
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
let unlistenHttpApi: (() => void) | null = null

const downloadBanner = ref<{ text: string } | null>(null)
let bannerTimer: ReturnType<typeof setTimeout> | null = null

function showDownloadBanner(text: string): void {
  downloadBanner.value = { text }
  if (bannerTimer) clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => {
    downloadBanner.value = null
  }, 4000)
}

onMounted(async () => {
  await configStore.init()
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
      let added = 0
      let failed = 0
      for (const path of event.payload) {
        if (path.toLowerCase().endsWith('.torrent')) {
          try {
            const { invoke } = await import('@tauri-apps/api/core')
            await invoke<string>('add_torrent_file', { path })
            added++
          } catch {
            failed++
          }
        }
      }
      if (added > 0 || failed > 0) {
        showDownloadBanner(
          failed > 0
            ? `Torrent: ${added} added, ${failed} failed`
            : `${added} torrent file${added > 1 ? 's' : ''} added`,
        )
      }
    })
  } catch {
    /* not in Tauri context */
  }

  try {
    const { listen } = await import('@tauri-apps/api/event')
    unlistenHttpApi = await listen<{ url: string; title: string | null; gid: string }>('http-api-download', (event) => {
      const { title, url } = event.payload
      const label = title || url.split('/').pop()?.split('?')[0] || url
      console.warn(`HTTP API download enqueued: ${label}`)
      showDownloadBanner(`Download added: ${label}`)
    })
  } catch {
    /* not in Tauri context */
  }
})

onUnmounted(() => {
  sched.stop()
  unlistenDeepLink?.()
  unlistenFileDrop?.()
  unlistenHttpApi?.()
  if (bannerTimer) clearTimeout(bannerTimer)
  tasksStore.dispose().catch((e) => console.warn('aria2 dispose failed:', e))
})
</script>
<template>
  <n-message-provider>
    <router-view />
  </n-message-provider>
  <div v-if="downloadBanner" class="download-banner" role="status">
    <span class="download-banner-text">{{ downloadBanner.text }}</span>
    <button
      type="button"
      class="download-banner-close"
      title="Dismiss"
      aria-label="Dismiss notification"
      @click="downloadBanner = null"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  </div>
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

/* --- Download banner (http-api-download notification) --- */

.download-banner {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 420px;
  padding: 12px 16px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  box-shadow:
    0 10px 25px rgba(0, 0, 0, 0.3),
    0 4px 10px rgba(0, 0, 0, 0.2);
  animation: downloadBannerEnter 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.download-banner-text {
  font-size: 13px;
  line-height: 1.45;
  color: var(--fg);
  word-break: break-word;
  min-width: 0;
}

.download-banner-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--fg-tertiary, var(--fg-muted));
  cursor: pointer;
  border-radius: var(--radius-xs, 6px);
  flex-shrink: 0;
}

.download-banner-close:hover {
  color: var(--fg);
  background: var(--surface-hover);
}

.download-banner-close:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
}

@keyframes downloadBannerEnter {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
