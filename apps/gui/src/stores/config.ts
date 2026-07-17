// src/stores/config.ts
// Pinia store for application configuration.
// Types and defaults are imported from @motrix-ai/core (single source of truth).

import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import type {
  AppConfig,
  AIProvider,
  ResourceType,
  Quality,
  ScheduleRule,
  DiskThresholds,
  ArchiveTarget,
  SubtitlesConfig,
  UiConfig,
} from '@motrix-ai/core'

import { DEFAULT_CONFIG as CORE_DEFAULT_CONFIG } from '@motrix-ai/core/browser'

// Re-export types for convenience — components import from here
export type {
  AppConfig,
  AIProvider,
  ResourceType,
  Quality,
  ScheduleRule,
  DiskThresholds,
  ArchiveTarget,
  SubtitlesConfig,
  UiConfig,
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// Re-export DEFAULT_CONFIG for convenience (single source of truth: @motrix-ai/core).
// Components and tests import from here as '@/stores/config'.
// NOTE: do NOT mutate this object — it is a shared singleton from @motrix-ai/core.
// Use deepClone() below if you need a locally-modifiable copy.
export const DEFAULT_CONFIG = CORE_DEFAULT_CONFIG

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepMerge<T>(defaults: T, override: unknown): T {
  if (override === null || override === undefined) return defaults
  if (Array.isArray(defaults) || Array.isArray(override)) {
    return (Array.isArray(override) ? override : defaults) as T
  }
  if (typeof defaults !== 'object' || typeof override !== 'object') {
    return (override as T) ?? defaults
  }
  const out: Record<string, unknown> = { ...(defaults as Record<string, unknown>) }
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    if (v !== undefined) {
      out[k] = k in out ? deepMerge((out as Record<string, unknown>)[k], v) : v
    }
  }
  return out as T
}

/** Deep clone a value via structured clone (with JSON fallback) */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

/**
 * Read legacy `motrix-ai:*` localStorage keys and map them into an AppConfig.
 * Best-effort: a parse failure leaves the corresponding section on defaults.
 */
function migrateFromLocalStorage(): AppConfig {
  const config = deepClone(DEFAULT_CONFIG)
  try {
    const aiConfig = localStorage.getItem('motrix-ai:ai-config')
    if (aiConfig) {
      const parsed = JSON.parse(aiConfig)
      config.ai = { ...config.ai, ...parsed }
    }
    const downloadDir = localStorage.getItem('motrix-ai:download-dir')
    if (downloadDir) config.downloads.base_dir = JSON.parse(downloadDir)
    const rpcUrl = localStorage.getItem('motrix-ai:aria2-rpc-url')
    if (rpcUrl) config.aria2.rpc_url = JSON.parse(rpcUrl)
    const rpcSecret = localStorage.getItem('motrix-ai:aria2-rpc-secret')
    if (rpcSecret) config.aria2.rpc_secret = JSON.parse(rpcSecret)
    const subLangs = localStorage.getItem('motrix-ai:subtitle-languages')
    if (subLangs) config.subtitles.preferred_languages = JSON.parse(subLangs)
    const subDir = localStorage.getItem('motrix-ai:subtitle-dir')
    if (subDir) config.subtitles.subtitle_dir = JSON.parse(subDir)
    const subApiKey = localStorage.getItem('motrix-ai:opensubtitles-api-key')
    if (subApiKey) config.subtitles.opensubtitles_api_key = subApiKey
    const autoSub = localStorage.getItem('motrix-ai:auto-search-subtitles')
    if (autoSub !== null) config.subtitles.auto_search = JSON.parse(autoSub) !== false
    const schedRules = localStorage.getItem('motrix-ai:schedule-rules')
    if (schedRules) config.schedule.rules = JSON.parse(schedRules)
    const logLevel = localStorage.getItem('motrix-ai:log-level')
    if (logLevel) config.ui.log_level = JSON.parse(logLevel)
    const theme = localStorage.getItem('motrix-ai:theme')
    if (theme) config.ui.theme = JSON.parse(theme)
    const lang = localStorage.getItem('motrix-ai:language')
    if (lang) config.ui.language = JSON.parse(lang)
  } catch {
    /* best-effort */
  }
  return config
}

/** Remove legacy localStorage config keys after a successful migration. */
function cleanupOldKeys(): void {
  const keys = [
    'motrix-ai:ai-config',
    'motrix-ai:llm-endpoint',
    'motrix-ai:llm-api-key',
    'motrix-ai:llm-model',
    'motrix-ai:llm-config',
    'motrix-ai:download-dir',
    'motrix-ai:aria2-rpc-url',
    'motrix-ai:aria2-rpc-secret',
    'motrix-ai:subtitle-languages',
    'motrix-ai:subtitle-dir',
    'motrix-ai:opensubtitles-api-key',
    'motrix-ai:auto-search-subtitles',
    'motrix-ai:schedule-rules',
    'motrix-ai:schedule-enabled',
    'motrix-ai:log-level',
    'motrix-ai:theme',
    'motrix-ai:language',
    'motrix-ai:config',
    'motrix-ai:nas-config',
  ]
  for (const key of keys) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Pinia store for application configuration.
 *
 * The store is the sole reactive entry point for config. Call `init()` once
 * on app startup: it loads from the Tauri-backed config file, falling back
 * to a one-time migration of legacy localStorage keys when the file is not
 * available (e.g. during Vite dev without Tauri). After init, deep changes
 * to `config` are auto-persisted to the file via a debounced watcher.
 */
export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>(deepClone(DEFAULT_CONFIG))
  const loaded = ref(false)
  const saving = ref(false)
  const saveError = ref<string | null>(null)

  /** Load from the config file via Tauri, falling back to localStorage migration. */
  async function init(): Promise<void> {
    try {
      const fileConfig = await invoke<AppConfig>('load_config')
      // Clone required: DEFAULT_CONFIG is a shared singleton; deepMerge shallow-copies nested arrays/objects.
      config.value = deepMerge(deepClone(DEFAULT_CONFIG), fileConfig)
    } catch {
      config.value = migrateFromLocalStorage()
      cleanupOldKeys()
    } finally {
      loaded.value = true
    }
  }

  /** Persist the current config to the file via Tauri. */
  let savePending = false
  async function save(): Promise<void> {
    if (saving.value) {
      savePending = true
      return
    }
    saving.value = true
    try {
      await invoke('save_config', { config: config.value })
    } catch (e) {
      console.error('Failed to save config:', e)
      saveError.value = e instanceof Error ? e.message : String(e)
    } finally {
      saving.value = false
      if (savePending) {
        savePending = false
        void save()
      }
    }
  }

  /** Apply a partial update to one top-level section and let the watcher persist. */
  function updateSection<K extends keyof AppConfig>(section: K, value: Partial<AppConfig[K]>): void {
    config.value = { ...config.value, [section]: deepMerge(config.value[section], value) }
  }

  /** Reset config to defaults and persist. */
  async function reset(): Promise<void> {
    config.value = deepClone(DEFAULT_CONFIG)
    await save()
  }

  // Debounced auto-persist on any deep change to config.
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    config,
    () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        void save()
      }, 500)
    },
    { deep: true },
  )

  return { config, loaded, saving, saveError, init, save, updateSection, reset }
})
