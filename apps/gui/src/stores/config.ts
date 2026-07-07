// src/stores/config.ts
// Pinia store for application configuration.
// Persists the full AppConfig to localStorage and loads on initialization.
// Mirrors the core AppConfig interface (packages/core/src/types.ts) so the
// GUI can operate without a direct workspace dependency on @motrix-ai/core.

import { ref } from 'vue'
import { defineStore } from 'pinia'

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
  ai: {
    provider: AIProvider
    model: string
    api_key?: string
    base_url?: string
  }
  aria2: {
    rpc_url: string
    rpc_secret?: string
  }
  downloads: {
    base_dir: string
    movie_dir: string
    software_dir: string
    other_dir: string
    rename_template: string
  }
  schedule: {
    enabled: boolean
    rules: ScheduleRule[]
  }
  disk: {
    enabled: boolean
    thresholds: DiskThresholds
  }
  subtitles: SubtitlesConfig
  archive: {
    enabled: boolean
    targets: ArchiveTarget[]
  }
  ui: UiConfig
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'motrix-ai:config'

/** Sensible defaults matching the core loader's DEFAULT_CONFIG */
export const DEFAULT_CONFIG: AppConfig = {
  ai: {
    provider: 'opencode',
    model: 'opencode/deepseek-v4-flash-free',
  },
  aria2: {
    rpc_url: 'http://127.0.0.1:6800/jsonrpc',
  },
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
      { name: '深夜全速', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5 },
      { name: '白天让路', time_start: '07:00', time_end: '18:00', speed_limit: 5_000_000, max_concurrent: 2 },
      { name: '晚间适度', time_start: '18:00', time_end: '23:00', speed_limit: 10_000_000, max_concurrent: 3 },
    ],
  },
  disk: {
    enabled: true,
    thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 },
  },
  subtitles: {
    enabled: true,
    preferred_languages: ['zh-Hans', 'en'],
    sources: { shooter: true, subhd: true, opensubtitles: false },
    subtitle_dir: '~/Downloads/Motrix AI/Subtitles',
    opensubtitles_api_key: '',
    auto_search: true,
  },
  archive: {
    enabled: false,
    targets: [],
  },
  ui: {
    theme: 'dark',
    language: 'en',
    log_level: 'info',
  },
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/** Deep clone a value via structured clone (with JSON fallback) */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Pinia store for application configuration.
 *
 * The config is persisted to localStorage under `motrix-ai:config`.
 * On first use the store auto-loads from storage; if no saved config
 * exists the defaults are written and used.
 *
 * Use `updateField` for targeted section updates and `save` to persist.
 */
export const useConfigStore = defineStore('config', () => {
  // -- state --------------------------------------------------------------

  /** Current in-memory configuration */
  const config = ref<AppConfig>(deepClone(DEFAULT_CONFIG))

  /** Whether the initial load from storage has completed */
  const loaded = ref(false)

  // -- persistence --------------------------------------------------------

  /**
   * Load configuration from localStorage, merging with defaults.
   * Called automatically on store initialization.
   */
  function load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        // Shallow merge top-level sections, falling back to defaults
        config.value = {
          ai: { ...DEFAULT_CONFIG.ai, ...parsed.ai },
          aria2: { ...DEFAULT_CONFIG.aria2, ...parsed.aria2 },
          downloads: { ...DEFAULT_CONFIG.downloads, ...parsed.downloads },
          schedule: { ...DEFAULT_CONFIG.schedule, ...parsed.schedule },
          disk: { ...DEFAULT_CONFIG.disk, ...parsed.disk },
          subtitles: { ...DEFAULT_CONFIG.subtitles, ...parsed.subtitles },
          archive: { ...DEFAULT_CONFIG.archive, ...parsed.archive },
          ui: { ...DEFAULT_CONFIG.ui, ...parsed.ui },
        }
      } else {
        // First run: persist defaults
        save()
      }
    } catch (e) {
      console.error('Failed to load config from localStorage:', e)
      config.value = deepClone(DEFAULT_CONFIG)
    } finally {
      loaded.value = true
    }
  }

  /**
   * Persist the current configuration to localStorage.
   */
  function save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config.value))
    } catch (e) {
      console.error('Failed to save config to localStorage:', e)
    }
  }

  /**
   * Reset configuration to defaults and persist.
   */
  function reset(): void {
    config.value = deepClone(DEFAULT_CONFIG)
    save()
  }

  /**
   * Update a top-level config section in place and persist.
   *
   * @param section - One of: 'ai' | 'aria2' | 'downloads' | 'schedule' | 'disk' | 'subtitles' | 'archive'
   * @param value - The partial or full value for that section
   */
  function updateField<K extends keyof AppConfig>(section: K, value: Partial<AppConfig[K]>): void {
    config.value = {
      ...config.value,
      [section]: { ...config.value[section], ...value },
    }
    save()
  }

  // -- auto-load on store initialization ----------------------------------

  load()

  return {
    // state
    config,
    loaded,
    // actions
    load,
    save,
    reset,
    updateField,
  }
})
