// config/schema.ts + loader.ts — 配置管理
// 对应 PRD §8.2.2 设置页 + §6.3 调度配置

import type { AppConfig } from '../types.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { migrateConfig } from './migrations.js'

const CONFIG_DIR = join(homedir(), '.motrix-ai')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export const DEFAULT_CONFIG: AppConfig = {
  ai: {
    provider: 'opencode',
    model: 'opencode/deepseek-v4-flash-free',
  },
  aria2: {
    rpc_url: 'http://127.0.0.1:6800/jsonrpc',
  },
  downloads: {
    base_dir: join(homedir(), 'Downloads', 'Motrix AI'),
    movie_dir: join(homedir(), 'Downloads', 'Motrix AI', 'Movies'),
    software_dir: join(homedir(), 'Downloads', 'Motrix AI', 'Software'),
    other_dir: join(homedir(), 'Downloads', 'Motrix AI', 'Other'),
    rename_template: '{title} ({year})/{title}.{quality}.{ext}',
  },
  schedule: {
    enabled: true,
    rules: [
      { name: 'Night Full Speed', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5 },
      { name: 'Daytime Throttle', time_start: '07:00', time_end: '18:00', speed_limit: 5_000_000, max_concurrent: 2 },
      { name: 'Evening Moderate', time_start: '18:00', time_end: '23:00', speed_limit: 10_000_000, max_concurrent: 3 },
    ],
  },
  disk: {
    enabled: true,
    thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 },
  },
  subtitles: {
    enabled: true,
    preferred_languages: ['zh', 'en'],
    sources: { shooter: true, subhd: true, opensubtitles: false },
    subtitle_dir: '~/Downloads/Motrix AI/Subtitles',
    opensubtitles_api_key: '',
    auto_search: true,
  },
  archive: {
    enabled: false,
    targets: [],
  },
  nas: {
    enabled: false,
    host: '192.168.1.100',
    port: '22',
    username: '',
    moviePath: '/volume1/Media/Movies',
    softwarePath: '/volume1/Software',
    musicPath: '/volume1/Music',
  },
  ui: {
    theme: 'dark',
    language: 'en',
    log_level: 'info',
  },
}

export function deepMerge<T>(defaults: T, override: unknown): T {
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

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_FILE)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
    const initial = deepMerge(DEFAULT_CONFIG, { schemaVersion: 3 })
    writeFileSync(CONFIG_FILE, JSON.stringify(initial, null, 2), 'utf-8')
    return initial
  }
  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
  const migrated = migrateConfig(raw)
  return deepMerge(DEFAULT_CONFIG, migrated)
}

export function saveConfig(config: AppConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}
