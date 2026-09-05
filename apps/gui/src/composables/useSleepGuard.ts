// src/composables/useSleepGuard.ts
// Keeps the OS awake while downloads are active (config.ui.prevent_sleep_while_downloading).
// Wires the previously-dead Rust commands prevent_sleep / allow_sleep.

import { computed, onUnmounted, watch } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '@/stores/config'
import { useAria2Manager } from '@/composables/useAria2Manager'
import { createLogger } from '@motrix-ai/core/browser'

const logger = createLogger('sleep-guard')

export function useSleepGuard() {
  const store = useConfigStore()
  const manager = useAria2Manager()

  const enabled = computed(() => store.config.ui.prevent_sleep_while_downloading ?? true)
  const hasActive = computed(() => manager.activeDownloads.value.length > 0)

  let currentPrevented = false

  async function apply() {
    const wanted = enabled.value && hasActive.value
    if (wanted === currentPrevented) return
    try {
      if (wanted) {
        await invoke('prevent_sleep')
      } else {
        await invoke('allow_sleep')
      }
      currentPrevented = wanted
    } catch (e) {
      logger.warn('sleep guard toggle failed:', e)
    }
  }

  watch([enabled, hasActive], () => {
    void apply()
  })
  void apply()

  onUnmounted(async () => {
    // Never leave the machine locked awake.
    if (currentPrevented) {
      currentPrevented = false
      try {
        await invoke('allow_sleep')
      } catch {
        /* best effort */
      }
    }
  })
}
