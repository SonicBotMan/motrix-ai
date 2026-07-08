// config/schema.ts — 配置验证（手动实现，无 zod 依赖）
// 对应 PRD §8.2.2 设置页 + §6.3 调度配置

import type { AppConfig, ScheduleRule, DiskThresholds, ArchiveTarget, ResourceType } from '../types.js'
import { DEFAULT_CONFIG } from './loader.js'
import { ConfigError } from '../errors.js'

// ---------------------------------------------------------------------------
// 允许的枚举值
// ---------------------------------------------------------------------------

const VALID_PROVIDERS = ['opencode', 'anthropic', 'openai', 'ollama', 'custom'] as const
const VALID_RESOURCE_TYPES = ['movie', 'tv', 'software', 'music', 'anime', 'other'] as const
const VALID_THEMES = ['dark', 'light', 'system'] as const
const VALID_LANGS = ['en', 'zh', 'ja', 'ko', 'fr'] as const
const VALID_LEVELS = ['debug', 'info', 'warn', 'error'] as const

// ---------------------------------------------------------------------------
// 基础类型检查 & 断言
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>

function isObject(val: unknown): val is Obj {
  return typeof val === 'object' && val !== null && !Array.isArray(val)
}

function isString(val: unknown): val is string {
  return typeof val === 'string'
}

function isNumber(val: unknown): val is number {
  return typeof val === 'number' && !Number.isNaN(val)
}

function isBoolean(val: unknown): val is boolean {
  return typeof val === 'boolean'
}

function isStringArray(val: unknown): val is string[] {
  return Array.isArray(val) && val.every((v) => typeof v === 'string')
}

/** 断言辅助函数 —— 条件为假时抛出带有字段路径的描述性错误 */
function assert(condition: boolean, path: string, message: string): asserts condition {
  if (!condition) {
    throw new ConfigError(`Config validation error at "${path}": ${message}`)
  }
}

// ---------------------------------------------------------------------------
// 各 section 验证器（带默认值回退）
// ---------------------------------------------------------------------------

/**
 * 验证 AI 配置段。
 * 缺失的字段从 defaults 回退。
 */
function validateAi(raw: unknown, defaults: AppConfig['ai']): AppConfig['ai'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }

  if (raw.provider !== undefined) {
    const val = raw.provider
    assert(
      typeof val === 'string' && (VALID_PROVIDERS as readonly string[]).includes(val),
      'ai.provider',
      `must be one of: ${VALID_PROVIDERS.join(', ')}`,
    )
    result.provider = val as AppConfig['ai']['provider']
  }

  if (raw.model !== undefined) {
    assert(isString(raw.model), 'ai.model', 'must be a string')
    result.model = raw.model
  }

  if (raw.api_key !== undefined) {
    assert(isString(raw.api_key), 'ai.api_key', 'must be a string')
    result.api_key = raw.api_key
  }

  if (raw.base_url !== undefined) {
    assert(isString(raw.base_url), 'ai.base_url', 'must be a string')
    result.base_url = raw.base_url
  }

  return result
}

/**
 * 验证 aria2 配置段。
 */
function validateAria2(raw: unknown, defaults: AppConfig['aria2']): AppConfig['aria2'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }

  if (raw.rpc_url !== undefined) {
    assert(isString(raw.rpc_url), 'aria2.rpc_url', 'must be a string')
    result.rpc_url = raw.rpc_url
  }

  if (raw.rpc_secret !== undefined) {
    assert(isString(raw.rpc_secret), 'aria2.rpc_secret', 'must be a string')
    result.rpc_secret = raw.rpc_secret
  }

  return result
}

/**
 * 验证 downloads 配置段。
 */
function validateDownloads(raw: unknown, defaults: AppConfig['downloads']): AppConfig['downloads'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }

  const fields = ['base_dir', 'movie_dir', 'software_dir', 'other_dir', 'rename_template'] as const
  for (const field of fields) {
    if (raw[field] !== undefined) {
      assert(isString(raw[field]), `downloads.${field}`, 'must be a string')
      result[field] = raw[field] as string
    }
  }

  return result
}

/**
 * 验证单条调度规则。
 */
function validateScheduleRule(raw: unknown, index: number): ScheduleRule {
  assert(isObject(raw), `schedule.rules[${index}]`, 'must be an object')
  const obj: Obj = raw

  const name = obj.name
  assert(isString(name), `schedule.rules[${index}].name`, 'must be a string')

  const timeStart = obj.time_start
  assert(isString(timeStart), `schedule.rules[${index}].time_start`, 'must be a string (HH:mm)')
  assert(/^\d{2}:\d{2}$/.test(timeStart), `schedule.rules[${index}].time_start`, 'must be in HH:mm format')

  const timeEnd = obj.time_end
  assert(isString(timeEnd), `schedule.rules[${index}].time_end`, 'must be a string (HH:mm)')
  assert(/^\d{2}:\d{2}$/.test(timeEnd), `schedule.rules[${index}].time_end`, 'must be in HH:mm format')

  const speedLimit = obj.speed_limit
  assert(isNumber(speedLimit), `schedule.rules[${index}].speed_limit`, 'must be a number')
  assert(speedLimit >= 0, `schedule.rules[${index}].speed_limit`, 'must be >= 0')

  const maxConcurrent = obj.max_concurrent
  assert(isNumber(maxConcurrent), `schedule.rules[${index}].max_concurrent`, 'must be a number')
  assert(maxConcurrent >= 1, `schedule.rules[${index}].max_concurrent`, 'must be >= 1')

  const enabled = obj.enabled
  if (enabled !== undefined) {
    assert(isBoolean(enabled), `schedule.rules[${index}].enabled`, 'must be a boolean')
  }

  return {
    name,
    time_start: timeStart,
    time_end: timeEnd,
    speed_limit: speedLimit,
    max_concurrent: maxConcurrent,
    ...(enabled !== undefined ? { enabled } : {}),
  }
}

/**
 * 验证 schedule 配置段。
 */
function validateSchedule(raw: unknown, defaults: AppConfig['schedule']): AppConfig['schedule'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }

  if (raw.enabled !== undefined) {
    assert(isBoolean(raw.enabled), 'schedule.enabled', 'must be a boolean')
    result.enabled = raw.enabled
  }

  if (raw.rules !== undefined) {
    assert(Array.isArray(raw.rules), 'schedule.rules', 'must be an array')
    result.rules = (raw.rules as unknown[]).map((rule, i) => validateScheduleRule(rule, i))
  }

  return result
}

/**
 * 验证 disk 配置段。
 */
function validateDisk(raw: unknown, defaults: AppConfig['disk']): AppConfig['disk'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }

  if (raw.enabled !== undefined) {
    assert(isBoolean(raw.enabled), 'disk.enabled', 'must be a boolean')
    result.enabled = raw.enabled
  }

  if (raw.thresholds !== undefined) {
    assert(isObject(raw.thresholds), 'disk.thresholds', 'must be an object')
    const t: Obj = raw.thresholds

    const thresholds: DiskThresholds = { ...defaults.thresholds }

    if (t.low_gb !== undefined) {
      assert(isNumber(t.low_gb), 'disk.thresholds.low_gb', 'must be a number')
      assert(t.low_gb > 0, 'disk.thresholds.low_gb', 'must be > 0')
      thresholds.low_gb = t.low_gb
    }

    if (t.critical_gb !== undefined) {
      assert(isNumber(t.critical_gb), 'disk.thresholds.critical_gb', 'must be a number')
      assert(t.critical_gb >= 0, 'disk.thresholds.critical_gb', 'must be >= 0')
      thresholds.critical_gb = t.critical_gb
    }

    if (t.resume_gb !== undefined) {
      assert(isNumber(t.resume_gb), 'disk.thresholds.resume_gb', 'must be a number')
      assert(t.resume_gb > 0, 'disk.thresholds.resume_gb', 'must be > 0')
      thresholds.resume_gb = t.resume_gb
    }

    assert(thresholds.critical_gb < thresholds.low_gb, 'disk.thresholds', 'critical_gb must be less than low_gb')
    assert(thresholds.resume_gb >= thresholds.low_gb, 'disk.thresholds', 'resume_gb must be >= low_gb')

    result.thresholds = thresholds
  }

  return result
}

/**
 * 验证 subtitles 配置段。
 */
function validateSubtitles(raw: unknown, defaults: AppConfig['subtitles']): AppConfig['subtitles'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }

  if (raw.enabled !== undefined) {
    assert(isBoolean(raw.enabled), 'subtitles.enabled', 'must be a boolean')
    result.enabled = raw.enabled
  }

  if (raw.preferred_languages !== undefined) {
    assert(isStringArray(raw.preferred_languages), 'subtitles.preferred_languages', 'must be a string array')
    result.preferred_languages = raw.preferred_languages
  }

  if (raw.sources !== undefined) {
    assert(isObject(raw.sources), 'subtitles.sources', 'must be an object')
    const s: Obj = raw.sources
    const sources = { ...defaults.sources }

    if (s.shooter !== undefined) {
      assert(isBoolean(s.shooter), 'subtitles.sources.shooter', 'must be a boolean')
      sources.shooter = s.shooter
    }
    if (s.subhd !== undefined) {
      assert(isBoolean(s.subhd), 'subtitles.sources.subhd', 'must be a boolean')
      sources.subhd = s.subhd
    }
    if (s.opensubtitles !== undefined) {
      assert(isBoolean(s.opensubtitles), 'subtitles.sources.opensubtitles', 'must be a boolean')
      sources.opensubtitles = s.opensubtitles
    }

    result.sources = sources
  }

  if (raw.subtitle_dir !== undefined) {
    assert(isString(raw.subtitle_dir), 'subtitles.subtitle_dir', 'must be a string')
    result.subtitle_dir = raw.subtitle_dir
  }

  if (raw.opensubtitles_api_key !== undefined) {
    assert(isString(raw.opensubtitles_api_key), 'subtitles.opensubtitles_api_key', 'must be a string')
    result.opensubtitles_api_key = raw.opensubtitles_api_key
  }

  if (raw.auto_search !== undefined) {
    assert(isBoolean(raw.auto_search), 'subtitles.auto_search', 'must be a boolean')
    result.auto_search = raw.auto_search
  }

  return result
}

/**
 * 验证单个归档目标。
 */
function validateArchiveTarget(raw: unknown, index: number): ArchiveTarget {
  assert(isObject(raw), `archive.targets[${index}]`, 'must be an object')
  const obj: Obj = raw

  const name = obj.name
  assert(isString(name), `archive.targets[${index}].name`, 'must be a string')

  const host = obj.host
  assert(isString(host), `archive.targets[${index}].host`, 'must be a string')

  const path = obj.path
  assert(isString(path), `archive.targets[${index}].path`, 'must be a string')

  const match: ArchiveTarget['match'] = {}
  if (obj.match !== undefined) {
    assert(isObject(obj.match), `archive.targets[${index}].match`, 'must be an object')
    const m: Obj = obj.match
    if (m.resource_type !== undefined) {
      assert(
        typeof m.resource_type === 'string' && (VALID_RESOURCE_TYPES as readonly string[]).includes(m.resource_type),
        `archive.targets[${index}].match.resource_type`,
        `must be one of: ${VALID_RESOURCE_TYPES.join(', ')}`,
      )
      match.resource_type = m.resource_type as ResourceType
    }
  }

  return { name, host, path, match }
}

/**
 * 验证 archive 配置段。
 */
function validateArchive(raw: unknown, defaults: AppConfig['archive']): AppConfig['archive'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }

  if (raw.enabled !== undefined) {
    assert(isBoolean(raw.enabled), 'archive.enabled', 'must be a boolean')
    result.enabled = raw.enabled
  }

  if (raw.targets !== undefined) {
    assert(Array.isArray(raw.targets), 'archive.targets', 'must be an array')
    result.targets = (raw.targets as unknown[]).map((target, i) => validateArchiveTarget(target, i))
  }

  return result
}

function validateUi(raw: unknown, defaults: AppConfig['ui']): AppConfig['ui'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }

  if (raw.theme !== undefined) {
    assert(
      typeof raw.theme === 'string' && (VALID_THEMES as readonly string[]).includes(raw.theme),
      'ui.theme',
      `must be one of: ${VALID_THEMES.join(', ')}`,
    )
    result.theme = raw.theme as AppConfig['ui']['theme']
  }

  if (raw.language !== undefined) {
    assert(
      typeof raw.language === 'string' && (VALID_LANGS as readonly string[]).includes(raw.language),
      'ui.language',
      `must be one of: ${VALID_LANGS.join(', ')}`,
    )
    result.language = raw.language as AppConfig['ui']['language']
  }

  if (raw.log_level !== undefined) {
    assert(
      typeof raw.log_level === 'string' && (VALID_LEVELS as readonly string[]).includes(raw.log_level),
      'ui.log_level',
      `must be one of: ${VALID_LEVELS.join(', ')}`,
    )
    result.log_level = raw.log_level as AppConfig['ui']['log_level']
  }

  return result
}

// ---------------------------------------------------------------------------
// 配置 Schema 描述（供 UI / 文档使用）
// ---------------------------------------------------------------------------

/**
 * 配置 schema 的描述性元信息，可用于 UI 表单生成或文档导出。
 */
export const configSchema = {
  ai: {
    provider: {
      type: 'enum' as const,
      values: ['opencode', 'anthropic', 'openai', 'ollama', 'custom'] as const,
      required: true,
    },
    model: { type: 'string' as const, required: true },
    api_key: { type: 'string' as const, required: false },
    base_url: { type: 'string' as const, required: false },
  },
  aria2: {
    rpc_url: { type: 'string' as const, required: true },
    rpc_secret: { type: 'string' as const, required: false },
  },
  downloads: {
    base_dir: { type: 'string' as const, required: true },
    movie_dir: { type: 'string' as const, required: true },
    software_dir: { type: 'string' as const, required: true },
    other_dir: { type: 'string' as const, required: true },
    rename_template: { type: 'string' as const, required: true },
  },
  schedule: {
    enabled: { type: 'boolean' as const, required: true },
    rules: {
      type: 'array' as const,
      required: true,
      itemSchema: {
        name: { type: 'string' as const, required: true },
        time_start: { type: 'string' as const, required: true },
        time_end: { type: 'string' as const, required: true },
        speed_limit: { type: 'number' as const, required: true },
        max_concurrent: { type: 'number' as const, required: true },
        enabled: { type: 'boolean' as const, required: false },
      },
    },
  },
  disk: {
    enabled: { type: 'boolean' as const, required: true },
    thresholds: { type: 'object' as const, required: true },
  },
  subtitles: {
    enabled: { type: 'boolean' as const, required: true },
    preferred_languages: { type: 'array' as const, required: true },
    sources: { type: 'object' as const, required: true },
    subtitle_dir: { type: 'string' as const, required: false },
    opensubtitles_api_key: { type: 'string' as const, required: false },
    auto_search: { type: 'boolean' as const, required: true },
  },
  archive: {
    enabled: { type: 'boolean' as const, required: true },
    targets: { type: 'array' as const, required: true },
  },
  ui: {
    theme: { type: 'enum' as const, values: [...VALID_THEMES], required: true },
    language: { type: 'enum' as const, values: [...VALID_LANGS], required: true },
    log_level: { type: 'enum' as const, values: [...VALID_LEVELS], required: true },
  },
}

// ---------------------------------------------------------------------------
// 主验证函数
// ---------------------------------------------------------------------------

/**
 * 验证原始配置对象，返回类型安全的 AppConfig。
 * 验证失败时抛出描述性错误，错误信息包含字段路径和具体原因。
 *
 * 缺失的字段会从 DEFAULT_CONFIG 填充默认值，因此部分配置也是合法的。
 *
 * @param raw 原始配置（通常来自 JSON.parse 的结果）
 * @returns 经过验证的、完整的 AppConfig
 * @throws Error 当配置值类型或格式不符合要求时
 */
function validateNas(raw: unknown, defaults: AppConfig['nas']): AppConfig['nas'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }
  const fields: Array<keyof AppConfig['nas']> = [
    'enabled',
    'host',
    'port',
    'username',
    'moviePath',
    'softwarePath',
    'musicPath',
  ]
  for (const field of fields) {
    if (raw[field] !== undefined) {
      if (field === 'enabled') {
        assert(isBoolean(raw[field]), `nas.${field}`, 'must be a boolean')
        result[field] = raw[field] as boolean
      } else {
        assert(isString(raw[field]), `nas.${field}`, 'must be a string')
        result[field] = raw[field] as string
      }
    }
  }
  return result
}

export function validateConfig(raw: unknown): AppConfig {
  if (!isObject(raw)) {
    return { ...DEFAULT_CONFIG }
  }

  return {
    ai: validateAi(raw.ai, DEFAULT_CONFIG.ai),
    aria2: validateAria2(raw.aria2, DEFAULT_CONFIG.aria2),
    downloads: validateDownloads(raw.downloads, DEFAULT_CONFIG.downloads),
    schedule: validateSchedule(raw.schedule, DEFAULT_CONFIG.schedule),
    disk: validateDisk(raw.disk, DEFAULT_CONFIG.disk),
    subtitles: validateSubtitles(raw.subtitles, DEFAULT_CONFIG.subtitles),
    archive: validateArchive(raw.archive, DEFAULT_CONFIG.archive),
    nas: validateNas(raw.nas, DEFAULT_CONFIG.nas),
    ui: validateUi(raw.ui, DEFAULT_CONFIG.ui),
  }
}
