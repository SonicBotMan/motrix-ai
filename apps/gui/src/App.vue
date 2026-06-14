<script setup lang="ts">
/**
 * App.vue — root component.
 *
 * Renders the active route inside <router-view />. We removed the
 * Naive UI NConfigProvider because the design system is built on
 * tokens.css, not Naive's theming. See docs/design/handoff/HANDOFF.md.
 */
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
