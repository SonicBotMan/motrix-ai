// core/src/browser.ts — Browser-safe entry point for WebView environments.
//
// Re-exports only modules that do NOT transitively import Node.js APIs.
// The GUI (Tauri WebView) imports from this entry point via
// `@motrix-ai/core/browser` to avoid pulling in node:fs, node:child_process,
// better-sqlite3, etc.
//
// Node.js-only modules (archive/sync, file/organizer, pipeline/post-processor,
// queue/database, scheduler/disk-based, config/loader) are excluded. CLI and
// MCP Server continue to use the main entry point (index.ts) for full access.

export {
  AppError,
  SearchError,
  Aria2Error,
  IntentParseError,
  QueueError,
  SubtitleError,
  ConfigError,
  ArchiveError,
} from './errors.js'
export { Logger, createLogger } from './logger.js'
export type { LogLevel } from './logger.js'

export type {
  DownloadIntent,
  SearchResult,
  Task,
  TaskStatus,
  ResourceType,
  Quality,
  FileEntry,
  SubtitleEntry,
  ScheduleRule,
  AppConfig,
} from './types.js'

export { KeywordGenerator } from './ai/keyword-generator.js'
export { ResultEvaluator } from './ai/result-evaluator.js'

export { Aria2Client } from './aria2/client.js'

export {
  searchAll,
  DuckDuckGoSearchProvider,
  MikanSearchProvider,
  NyaaSearchProvider,
  BtdigSearchProvider,
} from './search/provider.js'
export type { SearchProvider } from './search/provider.js'

export { QueueManager } from './queue/manager.js'

export { SubtitleFinder, ShooterSource, SubhdSource } from './subtitle/finder.js'
export type { SubtitleSource, SubtitleResult } from './subtitle/finder.js'

export { FileRenamer } from './file/renamer.js'
export { TemplateEngine, DEFAULT_TEMPLATES } from './file/templates.js'

export { TimeScheduler } from './scheduler/time-based.js'
export { RetryScheduler } from './scheduler/retry.js'

// Default config values (browser-safe — no Node.js APIs).
// Path fields use `~/` prefix; Rust side expands at use sites.
export { DEFAULT_CONFIG } from './config/defaults.js'
