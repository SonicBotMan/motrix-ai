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

export function loadConfig(): AppConfig {
  if (!existsSync(CONFIG_FILE)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
    const initial = { ...DEFAULT_CONFIG, schemaVersion: 2 }
    writeFileSync(CONFIG_FILE, JSON.stringify(initial, null, 2), 'utf-8')
    return initial
  }
  const raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
  const migrated = migrateConfig(raw)
  return { ...DEFAULT_CONFIG, ...migrated }
}

export function saveConfig(config: AppConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}
