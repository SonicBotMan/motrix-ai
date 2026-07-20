// errors.ts — Structured application error hierarchy
// All domain-specific errors extend AppError, providing a stable
// `code` field for programmatic error handling and a `toJSON()`
// method for serialization in logs / API responses.

/**
 * Base application error.
 *
 * Every domain error in Motrix AI extends this class so that callers
 * can rely on the `code` field for switching behaviour and on
 * `toJSON()` for structured logging or HTTP error bodies.
 */
export class AppError extends Error {
  /** Stable machine-readable error code (e.g. `"ARIA2_ERROR"`) */
  readonly code: string
  /** Optional underlying cause */
  readonly cause?: Error

  constructor(message: string, code: string, cause?: Error) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.cause = cause
  }

  /** Serialize the error to a plain object suitable for logging or JSON responses */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      stack: this.stack,
      cause: this.cause?.message,
    }
  }
}

/**
 * Error originating from a search provider (Btdig, Mikan, DuckDuckGo, …).
 * Error code: `SEARCH_ERROR`
 */
export class SearchError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'SEARCH_ERROR', cause)
    this.name = 'SearchError'
  }
}

/**
 * Error from the aria2 JSON-RPC client.
 * Error code: `ARIA2_ERROR`
 */
export class Aria2Error extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'ARIA2_ERROR', cause)
    this.name = 'Aria2Error'
  }
}

/**
 * Error while parsing a natural-language download intent.
 * Error code: `INTENT_PARSE_ERROR`
 */
export class IntentParseError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'INTENT_PARSE_ERROR', cause)
    this.name = 'IntentParseError'
  }
}

/**
 * Error from the task queue manager.
 * Error code: `QUEUE_ERROR`
 */
export class QueueError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'QUEUE_ERROR', cause)
    this.name = 'QueueError'
  }
}

/**
 * Error from subtitle search or download.
 * Error code: `SUBTITLE_ERROR`
 */
export class SubtitleError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'SUBTITLE_ERROR', cause)
    this.name = 'SubtitleError'
  }
}

/**
 * Configuration validation or loading error.
 * Error code: `CONFIG_ERROR`
 */
export class ConfigError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause)
    this.name = 'ConfigError'
  }
}

/**
 * Error during archive (NAS) synchronisation.
 * Error code: `ARCHIVE_ERROR`
 */
export class ArchiveError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'ARCHIVE_ERROR', cause)
    this.name = 'ArchiveError'
  }
}
