// core/src/index.ts — 核心模块统一导出

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

// Aria2
export { Aria2Client } from "./aria2/client.js";

// Search
export { searchAll, DuckDuckGoSearchProvider, MikanSearchProvider, BtdigSearchProvider } from "./search/provider.js";
export type { SearchProvider } from "./search/provider.js";

// Queue
export { QueueManager } from "./queue/manager.js";

// Subtitle
export { SubtitleFinder, ShooterSource, SubhdSource } from "./subtitle/finder.js";
export type { SubtitleSource, SubtitleResult } from "./subtitle/finder.js";

// File
export { FileRenamer } from "./file/renamer.js";

// Scheduler
export { TimeScheduler } from "./scheduler/time-based.js";

// Config
export { loadConfig, saveConfig, DEFAULT_CONFIG } from "./config/loader.js";
