// core/src/index.ts — 核心模块统一导出

// Errors
export { AppError, SearchError, Aria2Error, IntentParseError, QueueError, SubtitleError, ConfigError, ArchiveError } from "./errors.js";

// Logger
export { Logger, createLogger } from "./logger.js";
export type { LogLevel } from "./logger.js";

// 类型
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
  DiskThresholds,
  AppConfig,
  ArchiveTarget,
} from "./types.js";

// AI
export { IntentParser } from "./ai/intent-parser.js";
export { KeywordGenerator } from "./ai/keyword-generator.js";
export { ResultEvaluator } from "./ai/result-evaluator.js";

// Aria2
export { Aria2Client } from "./aria2/client.js";

// Search
export { searchAll, DuckDuckGoSearchProvider, MikanSearchProvider, NyaaSearchProvider, BtdigSearchProvider } from "./search/provider.js";
export type { SearchProvider } from "./search/provider.js";

// Queue
export { QueueManager } from "./queue/manager.js";
export { TaskDatabase } from "./queue/database.js";

// Subtitle
export { SubtitleFinder, ShooterSource, SubhdSource } from "./subtitle/finder.js";
export type { SubtitleSource, SubtitleResult } from "./subtitle/finder.js";

// File
export { FileRenamer } from "./file/renamer.js";
export { FileOrganizer } from "./file/organizer.js";
export { TemplateEngine, DEFAULT_TEMPLATES } from "./file/templates.js";

// Scheduler
export { TimeScheduler } from "./scheduler/time-based.js";
export { DiskScheduler } from "./scheduler/disk-based.js";
export { RetryScheduler } from "./scheduler/retry.js";

// Archive
export { ArchiveSync } from "./archive/sync.js";

// Pipeline
export { PostProcessor } from "./pipeline/post-processor.js";

// Config
export { loadConfig, saveConfig, DEFAULT_CONFIG } from "./config/loader.js";
