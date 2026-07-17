// config/schema.ts + loader.ts — 配置管理
// 对应 PRD §8.2.2 设置页 + §6.3 调度配置

import type { AppConfig } from '../types.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { migrateConfig } from './migrations.js'
import { DEFAULT_CONFIG as DEFAULTS_WITH_TILDE } from './defaults.js'

const CONFIG_DIR = join(homedir(), '.motrix-ai')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

/** Expand a `~/...` (or `~\...` on Windows) path to an absolute path. */
function expandTilde(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  if (p.startsWith('~\\')) return join(homedir(), p.slice(2))
  return p
}

/** Apply tilde expansion to all path-bearing fields of an AppConfig. */
function expandPaths<T extends AppConfig>(config: T): T {
  return {
    ...config,
    downloads: {
      ...config.downloads,
      base_dir: expandTilde(config.downloads.base_dir),
      movie_dir: expandTilde(config.downloads.movie_dir),
      software_dir: expandTilde(config.downloads.software_dir),
      other_dir: expandTilde(config.downloads.other_dir),
    },
    subtitles: {
      ...config.subtitles,
      subtitle_dir: config.subtitles.subtitle_dir ? expandTilde(config.subtitles.subtitle_dir) : undefined,
    },
  }
}

/**
 * DEFAULT_CONFIG for Node contexts (CLI, MCP server). Path fields are
 * tilde-expanded via os.homedir() so CLI/MCP consumers can use them
 * directly without re-expanding. Browser contexts (GUI) should import
 * from @motrix-ai/core/browser instead, which exports the raw `~/` form.
 */
export const DEFAULT_CONFIG: AppConfig = expandPaths(DEFAULTS_WITH_TILDE)

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
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'))
  } catch {
    const backupPath = `${CONFIG_FILE}.corrupt.${Date.now()}`
    try {
      renameSync(CONFIG_FILE, backupPath)
    } catch {
      /* best effort */
    }
    const fresh = deepMerge(DEFAULT_CONFIG, { schemaVersion: 3 })
    writeFileSync(CONFIG_FILE, JSON.stringify(fresh, null, 2), 'utf-8')
    return fresh
  }
  const migrated = migrateConfig(raw as Record<string, unknown>)
  return deepMerge(DEFAULT_CONFIG, migrated)
}

export function saveConfig(config: AppConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true })
  const tmp = `${CONFIG_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8')
  renameSync(tmp, CONFIG_FILE)
}
