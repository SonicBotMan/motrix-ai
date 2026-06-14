<script setup lang="ts">
/**
 * ChromeBar — top window chrome (48px sticky bar)
 *
 * Left:   macOS traffic-light dots (decorative) + "Motrix" wordmark
 * Center: intentionally empty (title context sits in the panel below)
 * Right:  theme toggle (28×28) + settings button (28×28)
 *
 * Emits:
 *   - goHome       — logo clicked, return to main view
 *   - toggleTheme  — swap light/dark
 *   - openSettings — open settings screen
 *
 * Design ref: docs/design/handoff/02-components.md §1
 */

defineEmits<{
  goHome: []
  toggleTheme: []
  openSettings: []
}>()
</script>

<template>
  <header class="chrome">
    <div class="chrome-left">
      <div class="chrome-dots">
        <span class="dot red" />
        <span class="dot yellow" />
        <span class="dot green" />
      </div>
      <div
        class="chrome-logo"
        title="Back to downloads"
        @click="$emit('goHome')"
      >
        <span class="logo-motrix">Motrix</span>
        <span class="logo-ai"> AI</span>
      </div>
    </div>

    <div class="chrome-center" />

    <div class="chrome-right">
      <button
        class="chrome-btn"
        type="button"
        title="Toggle theme"
        aria-label="Toggle theme"
        @click="$emit('toggleTheme')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <!-- Sun icon (shown in light mode) -->
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      </button>
      <button
        class="chrome-btn"
        type="button"
        title="Settings"
        aria-label="Settings"
        @click="$emit('openSettings')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <!-- Gear icon -->
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

/* --- Left zone --- */

.chrome-left {
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
}

.chrome-dots {
  display: flex;
  align-items: center;
  gap: var(--space-1, 4px);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: var(--radius-full, 9999px);
  display: inline-block;
  pointer-events: none;
}

.dot.red {
  background: #ff5f57;
}

.dot.yellow {
  background: #febc2e;
}

.dot.green {
  background: #28c840;
}

.chrome-logo {
  display: flex;
  align-items: center;
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

.logo-motrix {
  color: var(--primary);
}

.logo-ai {
  color: var(--fg);
}

/* --- Center zone (intentionally empty) --- */

.chrome-center {
  flex: 1;
}

/* --- Right zone --- */

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
  outline: none;
  box-shadow:
    0 0 0 2px var(--focus-ring, oklch(92% 0.005 255)),
    0 0 0 8px var(--focus-ring-soft, oklch(92% 0.005 255 / 0.22));
}

/* --- Reduced motion --- */

@media (prefers-reduced-motion: reduce) {
  .chrome-logo,
  .chrome-btn {
    transition-duration: 0.01ms !important;
  }
}
</style>
