// src/stores/config.ts
// Pinia store for application configuration.
// Single reactive entry point: loads from file via Tauri commands,
// auto-persists on change, migrates legacy localStorage keys on first run.
// Mirrors packages/core/src/types.ts AppConfig so the GUI does not depend
// on @motrix-ai/core at runtime.

import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'

// ---------------------------------------------------------------------------
// Types — mirror of packages/core/src/types.ts AppConfig
// ---------------------------------------------------------------------------

export type AIProvider = 'opencode' | 'anthropic' | 'openai' | 'ollama' | 'custom'
export type ResourceType = 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other'
export type Quality = '4K' | '1080p' | '720p' | 'other'

/** Time-based scheduling rule for download throttling */
export interface ScheduleRule {
  name: string
  time_start: string // HH:mm
  time_end: string // HH:mm
  speed_limit: number // bytes/s, 0 = unlimited
  max_concurrent: number
  enabled?: boolean
}

/** Disk space protection thresholds */
export interface DiskThresholds {
  low_gb: number // pause low-priority
  critical_gb: number // pause all + notify
  resume_gb: number // resume paused tasks
}

/** Archive sync target (rsync / rclone destination) */
export interface ArchiveTarget {
  name: string
  host: string
  path: string
  match: { resource_type?: ResourceType }
}

/** Subtitle download configuration */
export interface SubtitlesConfig {
  enabled: boolean
  preferred_languages: string[]
  sources: { shooter: boolean; subhd: boolean; opensubtitles: boolean }
  subtitle_dir?: string
  opensubtitles_api_key?: string
  auto_search: boolean
}

/** UI configuration */
export interface UiConfig {
  theme: 'dark' | 'light' | 'system'
  language: 'en' | 'zh' | 'ja' | 'ko' | 'fr'
  log_level: 'debug' | 'info' | 'warn' | 'error'
}

/** Full application configuration */
export interface AppConfig {
  ai: { provider: AIProvider; model: string; api_key?: string; base_url?: string }
  aria2: { rpc_url: string; rpc_secret?: string }
  network: { http_proxy: string; https_proxy: string; ftp_proxy: string; no_proxy: string }
  downloads: {
    base_dir: string
    movie_dir: string
    software_dir: string
    other_dir: string
    rename_template: string
  }
  schedule: { enabled: boolean; rules: ScheduleRule[] }
  disk: { enabled: boolean; thresholds: DiskThresholds }
  subtitles: SubtitlesConfig
  archive: { enabled: boolean; targets: ArchiveTarget[] }
  nas: {
    enabled: boolean
    host: string
    port: string
    username: string
    moviePath: string
    softwarePath: string
    musicPath: string
  }
  ui: UiConfig
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Sensible defaults matching the core loader's DEFAULT_CONFIG */
export const DEFAULT_CONFIG: AppConfig = {
  ai: { provider: 'opencode', model: 'opencode/deepseek-v4-flash-free' },
  aria2: { rpc_url: 'http://127.0.0.1:6800/jsonrpc' },
  network: { http_proxy: '', https_proxy: '', ftp_proxy: '', no_proxy: '' },
  downloads: {
    base_dir: '~/Downloads/Motrix AI',
    movie_dir: '~/Downloads/Motrix AI/Movies',
    software_dir: '~/Downloads/Motrix AI/Software',
    other_dir: '~/Downloads/Motrix AI/Other',
    rename_template: '{title} ({year})/{title}.{quality}.{ext}',
  },
  schedule: {
    enabled: true,
    rules: [
      {
        name: 'Night Full Speed',
        time_start: '23:00',
        time_end: '07:00',
        speed_limit: 0,
        max_concurrent: 5,
        enabled: true,
      },
      {
        name: 'Daytime Throttle',
        time_start: '07:00',
        time_end: '18:00',
        speed_limit: 5_000_000,
        max_concurrent: 2,
        enabled: true,
      },
      {
        name: 'Evening Moderate',
        time_start: '18:00',
        time_end: '23:00',
        speed_limit: 10_000_000,
        max_concurrent: 3,
        enabled: true,
      },
    ],
  },
  disk: { enabled: true, thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 } },
  subtitles: {
    enabled: true,
    preferred_languages: ['zh', 'en'],
    sources: { shooter: true, subhd: true, opensubtitles: false },
    subtitle_dir: '~/Downloads/Motrix AI/Subtitles',
    opensubtitles_api_key: '',
    auto_search: true,
  },
  archive: { enabled: false, targets: [] },
  nas: {
    enabled: false,
    host: '192.168.1.100',
    port: '22',
    username: '',
    moviePath: '/volume1/Media/Movies',
    softwarePath: '/volume1/Software',
    musicPath: '/volume1/Music',
  },
  ui: { theme: 'dark', language: 'en', log_level: 'info' },
}

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
      config.value = deepMerge(DEFAULT_CONFIG, fileConfig)
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
    config.value = { ...config.value, [section]: { ...config.value[section], ...value } }
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
