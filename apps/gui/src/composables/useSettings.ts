// src/composables/useSettings.ts
// Global settings — reactive, backed by the Pinia config store.
//
// `theme` and `language` are writable computeds that read from / write to
// `useConfigStore().config.ui`. The store owns persistence (file-backed via
// Tauri); this composable only mirrors the values and applies DOM side
// effects (the `data-theme` attribute on <html>). The dark/light CSS
// variables live in styles/tokens.css.

import { ref, watch, computed } from 'vue'
import { useConfigStore } from '@/stores/config'
import strings from '@/locales/strings'
import type { Language } from '@/locales/strings'

type Theme = 'dark' | 'light' | 'system'

// ---- Reactive settings (backed by the config store) ----
// `useConfigStore()` is called inside the accessors so it resolves lazily,
// after Pinia is installed via `app.use(createPinia())`.
export const theme = computed<Theme>({
  get: () => useConfigStore().config.ui.theme,
  set: (v) => useConfigStore().updateSection('ui', { theme: v }),
})
export const language = computed<Language>({
  get: () => useConfigStore().config.ui.language,
  set: (v) => useConfigStore().updateSection('ui', { language: v }),
})

// System theme detection
const _mql = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null
const systemDark = ref(_mql?.matches ?? false)

const _darkListener = () => {
  if (_mql) systemDark.value = _mql.matches
}
if (_mql) {
  _mql.addEventListener('change', _darkListener)
}

export function cleanupThemeListeners(): void {
  if (_mql) {
    _mql.removeEventListener('change', _darkListener)
  }
}

// Resolved theme: 'system' → actual value
export const resolvedTheme = computed<'dark' | 'light'>(() => {
  if (theme.value === 'system') return systemDark.value ? 'dark' : 'light'
  return theme.value
})

// Is dark mode active
export const isDark = computed(() => resolvedTheme.value === 'dark')

// Apply data-theme attribute whenever the resolved theme changes.
watch(resolvedTheme, (v) => applyThemeAttribute(v))

// ---- Apply data-theme attribute ----
//
// tokens.css defines :root for dark and [data-theme="light"] for light.
// We just flip the attribute; CSS handles the rest.
function applyThemeAttribute(value: 'dark' | 'light'): void {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  if (value === 'light') {
    html.setAttribute('data-theme', 'light')
  } else {
    html.removeAttribute('data-theme')
  }
}

// Apply on initial load so the first paint matches the saved preference.
// Resolving `resolvedTheme.value` reads through the config store, which
// requires an active Pinia instance. This module is imported transitively
// during the app's module-graph load (router → views → composables), which
// can happen before `app.use(createPinia())` runs; if so, defer to the
// watcher above — it fires once `configStore.init()` swaps the config in.
try {
  applyThemeAttribute(resolvedTheme.value)
} catch {
  // Pinia not yet active; watcher will apply the attribute on first change.
}

// ---- i18n strings ----

export function t(key: string, params?: Record<string, unknown>): string {
  const template = strings[key]?.[language.value] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))
}

// Toggle helper so callers don't have to know about the data-theme attribute.
export function toggleTheme(): void {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}
