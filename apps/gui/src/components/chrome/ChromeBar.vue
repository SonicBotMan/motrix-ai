<script setup lang="ts">
/**
 * ChromeBar — top window chrome (48px sticky bar)
 *
 * Left:   MotrixAI wordmark + download-arrow mark
 * Right:  theme toggle (28×28) + settings button (28×28)
 *
 * Emits:
 *   - goHome       — logo clicked, return to main view
 *   - toggleTheme  — swap light/dark
 *   - openSettings — open settings screen
 *
 * Design ref: docs/design/handoff/02-components.md §1
 */

import { computed } from 'vue'
import { NIcon } from 'naive-ui'
import { DownloadOutline, SunnyOutline, MoonOutline, SettingsOutline } from '@vicons/ionicons5'

const props = defineProps<{
  currentTheme?: 'dark' | 'light'
  downloadSpeed?: string
  uploadSpeed?: string
}>()

defineEmits<{
  goHome: []
  toggleTheme: []
  openSettings: []
}>()

// Default to 'dark' if the prop is not provided
const currentTheme = computed(() => props.currentTheme ?? 'dark')

const themeLabel = computed(() => (currentTheme.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'))
</script>

<template>
  <header class="chrome">
    <div class="chrome-logo" title="Back to downloads" @click="$emit('goHome')">
      <!-- App mark (icon, never emoji) -->
      <NIcon class="logo-mark" :component="DownloadOutline" :size="20" aria-hidden="true" />
      <span class="logo-motrix">Motrix</span>
      <span class="logo-ai">AI</span>
    </div>

    <div class="chrome-center">
      <span v-if="props.downloadSpeed && props.downloadSpeed !== '0 B/s'" class="speed-display">
        ↓ {{ props.downloadSpeed }}
        <span v-if="props.uploadSpeed && props.uploadSpeed !== '0 B/s'" class="speed-upload"
          >↑ {{ props.uploadSpeed }}</span
        >
      </span>
    </div>

    <div class="chrome-right">
      <button
        class="chrome-btn"
        type="button"
        :title="themeLabel"
        :aria-label="themeLabel"
        @click="$emit('toggleTheme')"
      >
        <!-- Sun when in dark mode (clicking switches to light) -->
        <NIcon v-if="currentTheme === 'dark'" :component="SunnyOutline" :size="16" aria-hidden="true" />
        <!-- Moon when in light mode (clicking switches to dark) -->
        <NIcon v-else :component="MoonOutline" :size="16" aria-hidden="true" />
      </button>
      <button class="chrome-btn" type="button" title="Settings" aria-label="Settings" @click="$emit('openSettings')">
        <NIcon :component="SettingsOutline" :size="16" aria-hidden="true" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--chrome-height, 48px);
  padding: 0 var(--space-4, 16px);
  position: sticky;
  top: 0;
  z-index: 50;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.chrome-logo {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  cursor: pointer;
  font-family: var(--font-ui);
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  padding: var(--space-1, 4px) var(--space-2, 8px);
  border-radius: var(--radius-xs, 6px);
  transition: background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.chrome-logo:hover {
  background: var(--surface-hover);
}

.logo-mark {
  color: var(--primary);
  flex-shrink: 0;
}

.logo-motrix {
  color: var(--primary);
}

.logo-ai {
  color: var(--fg);
}

.chrome-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.speed-display {
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 500;
  color: var(--fg-secondary, #a0a0a8);
  white-space: nowrap;
}

.speed-upload {
  margin-left: 8px;
  color: var(--fg-tertiary, #6b7280);
}

.chrome-right {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
}

.chrome-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--fg-tertiary);
  border-radius: var(--radius-xs, 6px);
  cursor: pointer;
  transition:
    color var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.chrome-btn:hover {
  color: var(--fg);
  background: var(--surface-hover);
}

.chrome-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

@media (prefers-reduced-motion: reduce) {
  .chrome-logo,
  .chrome-btn {
    transition-duration: 0.01ms !important;
  }
}
</style>
