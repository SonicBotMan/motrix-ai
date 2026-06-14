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

const props = defineProps<{
  /** Currently-active theme; 'dark' is the default per the design spec. */
  currentTheme?: 'dark' | 'light'
}>()

defineEmits<{
  goHome: []
  toggleTheme: []
  openSettings: []
}>()

// Default to 'dark' if the prop is not provided
const currentTheme = computed(() => props.currentTheme ?? 'dark')

const themeLabel = computed(() =>
  currentTheme.value === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
)
</script>

<template>
  <header class="chrome">
    <div
      class="chrome-logo"
      title="Back to downloads"
      @click="$emit('goHome')"
    >
      <!-- App mark (inline SVG, never emoji) -->
      <svg
        class="logo-mark"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      <span class="logo-motrix">Motrix</span>
    </div>

    <div class="chrome-center" />

    <div class="chrome-right">
      <button
        class="chrome-btn"
        type="button"
        :title="themeLabel"
        :aria-label="themeLabel"
        @click="$emit('toggleTheme')"
      >
        <!-- Sun when in dark mode (clicking switches to light) -->
        <svg
          v-if="currentTheme === 'dark'"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
        <!-- Moon when in light mode (clicking switches to dark) -->
        <svg
          v-else
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </button>
      <button
        class="chrome-btn"
        type="button"
        title="Settings"
        aria-label="Settings"
        @click="$emit('openSettings')"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
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
