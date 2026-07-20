// logger.ts — Lightweight structured logging utility
// Provides a prefix-based, level-filtered logger that writes to
// console.error (so stdout stays clean for piped output).

/**
 * Supported log severity levels, ordered from most to least severe.
 * - `error` — failures that need attention
 * - `warn`  — recoverable issues
 * - `info`  — general operational messages
 * - `debug` — verbose diagnostic output
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/** Numeric priority for level comparison (lower = more severe) */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
}

/**
 * Prefix-based structured logger with level filtering.
 *
 * Each log line is emitted as `[LEVEL] [prefix] message ...args`,
 * making it easy to grep or parse in production.
 */
export class Logger {
  private level: LogLevel
  private prefix: string

  /**
   * @param prefix Short module / component name shown in every log line
   * @param level  Minimum severity to emit (default `"info"`)
   */
  constructor(prefix: string, level: LogLevel = 'info') {
    this.prefix = prefix
    this.level = level
  }

  /** Log an error message */
  error(message: string, ...args: unknown[]): void {
    if (LEVEL_PRIORITY[this.level] >= LEVEL_PRIORITY.error) {
      console.error(`[ERROR] [${this.prefix}] ${message}`, ...args)
    }
  }

  /** Log a warning message */
  warn(message: string, ...args: unknown[]): void {
    if (LEVEL_PRIORITY[this.level] >= LEVEL_PRIORITY.warn) {
      console.warn(`[WARN] [${this.prefix}] ${message}`, ...args)
    }
  }

  /** Log an informational message */
  info(message: string, ...args: unknown[]): void {
    if (LEVEL_PRIORITY[this.level] >= LEVEL_PRIORITY.info) {
      console.error(`[INFO] [${this.prefix}] ${message}`, ...args)
    }
  }

  /** Log a debug-level diagnostic message */
  debug(message: string, ...args: unknown[]): void {
    if (LEVEL_PRIORITY[this.level] >= LEVEL_PRIORITY.debug) {
      console.error(`[DEBUG] [${this.prefix}] ${message}`, ...args)
    }
  }
}

/**
 * Create a new {@link Logger} instance.
 *
 * @param prefix Short module / component name
 * @param level  Minimum severity to emit (default `"info"`)
 * @returns A configured Logger
 */
export function createLogger(prefix: string, level?: LogLevel): Logger {
  return new Logger(prefix, level)
}
