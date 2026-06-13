<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NDialogProvider, darkTheme, lightTheme } from 'naive-ui'
import { computed } from 'vue'
import { isDark } from '@/composables/useSettings'

const naiveTheme = computed(() => isDark.value ? darkTheme : lightTheme)
</script>

<template>
  <NConfigProvider :theme="naiveTheme">
    <NMessageProvider>
      <NDialogProvider>
        <router-view />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style>
/* Global theme variables — applied by useSettings.ts via JS */
:root {
  --bg: #0a0a0a;
  --bg-elevated: #141414;
  --surface: #1a1a1a;
  --surface-hover: #222222;
  --surface-elevated: #1e1e1e;
  --border: #2a2a2a;
  --fg: #e8e8e8;
  --fg-secondary: #a0a0a0;
  --fg-muted: #666666;
  --primary: #3B82F6;
  --primary-muted: rgba(59, 130, 246, 0.15);
  --danger: #EF4444;
  --success: #10B981;
  --warning: #F59E0B;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --transition-fast: 0.15s ease;
  color-scheme: dark;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--fg);
  overflow: hidden;
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
