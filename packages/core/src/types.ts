// types.ts — 核心类型定义
// 对应 PRD §6.2 任务队列模型

export type TaskStatus = 'pending' | 'downloading' | 'paused' | 'completed' | 'failed'
export type ResourceType = 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other'
export type Quality = '4K' | '1080p' | '720p' | 'other'

/** NL 解析后的结构化意图（对应 PRD §6.1） */
export interface DownloadIntent {
  title: string
  year?: number
  quality?: Quality
  need_subtitle: boolean
  search_keywords: string[]
  resource_type: ResourceType
}

/** 搜索结果候选 */
export interface SearchResult {
  title: string
  magnet: string
  size: number // bytes
  seeders: number
  leechers: number
  source: string
  quality?: Quality
}

/** 单个下载任务（对应 PRD §6.2） */
export interface Task {
  id: string
  source_query: string
  intent?: DownloadIntent
  uri: string
  status: TaskStatus
  priority: 1 | 2 | 3 | 4 | 5
  progress: number // 0-100
  speed: { down: number; up: number }
  files: FileEntry[]
  subtitle?: SubtitleEntry
  created_at: Date
  completed_at?: Date
  retry_count: number
  error?: string
  aria2_gid?: string
}

export interface FileEntry {
  name: string
  path: string
  size: number
  completed: number
}

export interface SubtitleEntry {
  language: string
  path: string
  downloadUrl: string
  source: string
}

/** 时段调度规则（对应 PRD §6.3.1） */
export interface ScheduleRule {
  name: string
  time_start: string // HH:mm
  time_end: string // HH:mm
  speed_limit: number // bytes/s, 0 = unlimited
  max_concurrent: number
  enabled?: boolean
}

/** 磁盘保护阈值（对应 PRD §6.3.2） */
export interface DiskThresholds {
  low_gb: number // 暂停低优先级
  critical_gb: number // 暂停全部 + 通知
  resume_gb: number // 恢复暂停任务
}

/** 应用配置（对应 PRD §5 + §8.2.2） */
export interface AppConfig {
  /** Config schema version for migration support */
  schemaVersion?: number
  ai: {
    provider: 'opencode' | 'anthropic' | 'openai' | 'ollama' | 'custom'
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

export interface ArchiveTarget {
  name: string
  host: string
  path: string
  match: { resource_type?: ResourceType }
}

/** 字幕配置（对应 PRD §5 + §8.2.2） */
export interface SubtitlesConfig {
  enabled: boolean
  preferred_languages: string[]
  sources: { shooter: boolean; subhd: boolean; opensubtitles: boolean }
  subtitle_dir?: string
  opensubtitles_api_key?: string
  auto_search: boolean
}

/** UI 配置（对应 PRD §8.2.2） */
export interface UiConfig {
  theme: 'dark' | 'light' | 'system'
  language: 'en' | 'zh' | 'ja' | 'ko' | 'fr'
  log_level: 'debug' | 'info' | 'warn' | 'error'
}
