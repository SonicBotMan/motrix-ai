// queue/database.ts — SQLite 任务持久化
// 对应 PRD §6.2 任务队列持久化层

import type { Task, TaskStatus, FileEntry, SubtitleEntry, DownloadIntent } from '../types.js'
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import { join, dirname } from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'
import { createLogger } from '../logger.js'

const logger = createLogger('queue:database')

/** 默认数据库路径 */
const DEFAULT_DB_PATH = join(homedir(), '.motrix-ai', 'tasks.db')

/** SQLite 行映射类型（所有字段都是可空的基础类型） */
interface TaskRow {
  id: string
  source_query: string
  intent: string | null
  uri: string
  status: string
  priority: number
  progress: number
  speed_down: number
  speed_up: number
  files: string
  subtitle: string | null
  created_at: string
  completed_at: string | null
  retry_count: number
  error: string | null
  aria2_gid: string | null
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T, field: string): T {
  if (raw == null || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    logger.warn(`corrupt JSON in ${field}: ${String(err)}`)
    return fallback
  }
}

/**
 * 将 SQLite 行转换为 Task 对象，反序列化 JSON 字段和日期。
 */
function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    source_query: row.source_query,
    intent: row.intent ? safeJsonParse<DownloadIntent | undefined>(row.intent, undefined, 'intent') : undefined,
    uri: row.uri,
    status: row.status as TaskStatus,
    priority: row.priority as Task['priority'],
    progress: row.progress,
    speed: { down: row.speed_down, up: row.speed_up },
    files: safeJsonParse<FileEntry[]>(row.files, [], 'files'),
    subtitle: row.subtitle ? safeJsonParse<SubtitleEntry | undefined>(row.subtitle, undefined, 'subtitle') : undefined,
    created_at: new Date(row.created_at),
    completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
    retry_count: row.retry_count,
    error: row.error ?? undefined,
    aria2_gid: row.aria2_gid ?? undefined,
  }
}

/**
 * 基于 better-sqlite3 的同步任务数据库。
 * 对应 PRD §6.2 任务队列持久化层。
 */
export class TaskDatabase {
  private db: DatabaseType

  /**
   * @param dbPath 数据库文件路径，默认为 ~/.motrix-ai/tasks.db
   */
  constructor(dbPath?: string) {
    const path = dbPath ?? DEFAULT_DB_PATH
    mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
  }

  /** 初始化数据库表（幂等，可安全多次调用） */
  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id          TEXT PRIMARY KEY,
        source_query TEXT NOT NULL,
        intent      TEXT,
        uri         TEXT NOT NULL,
        status      TEXT DEFAULT 'pending',
        priority    INTEGER DEFAULT 3,
        progress    REAL DEFAULT 0,
        speed_down  REAL DEFAULT 0,
        speed_up    REAL DEFAULT 0,
        files       TEXT NOT NULL,
        subtitle    TEXT,
        created_at  TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        retry_count INTEGER DEFAULT 0,
        error       TEXT,
        aria2_gid   TEXT
      );
    `)
  }

  /** 插入一个完整的 Task */
  insert(task: Task): void {
    const stmt = this.db.prepare(`
      INSERT INTO tasks
        (id, source_query, intent, uri, status, priority, progress,
         speed_down, speed_up, files, subtitle, created_at,
         completed_at, retry_count, error, aria2_gid)
      VALUES
        (@id, @source_query, @intent, @uri, @status, @priority, @progress,
         @speed_down, @speed_up, @files, @subtitle, @created_at,
         @completed_at, @retry_count, @error, @aria2_gid)
    `)
    stmt.run({
      id: task.id,
      source_query: task.source_query,
      intent: task.intent ? JSON.stringify(task.intent) : null,
      uri: task.uri,
      status: task.status,
      priority: task.priority,
      progress: task.progress,
      speed_down: task.speed.down,
      speed_up: task.speed.up,
      files: JSON.stringify(task.files),
      subtitle: task.subtitle ? JSON.stringify(task.subtitle) : null,
      created_at: task.created_at.toISOString(),
      completed_at: task.completed_at ? task.completed_at.toISOString() : null,
      retry_count: task.retry_count,
      error: task.error ?? null,
      aria2_gid: task.aria2_gid ?? null,
    })
  }

  /** 部分更新任务字段（只更新传入的字段） */
  update(id: string, partial: Partial<Task>): void {
    const sets: string[] = []
    const params: Record<string, unknown> = { id }

    // 逐字段构建 SET 子句
    if (partial.source_query !== undefined) {
      sets.push('source_query = @source_query')
      params.source_query = partial.source_query
    }
    if (partial.intent !== undefined) {
      sets.push('intent = @intent')
      params.intent = partial.intent ? JSON.stringify(partial.intent) : null
    }
    if (partial.uri !== undefined) {
      sets.push('uri = @uri')
      params.uri = partial.uri
    }
    if (partial.status !== undefined) {
      sets.push('status = @status')
      params.status = partial.status
    }
    if (partial.priority !== undefined) {
      sets.push('priority = @priority')
      params.priority = partial.priority
    }
    if (partial.progress !== undefined) {
      sets.push('progress = @progress')
      params.progress = partial.progress
    }
    if (partial.speed !== undefined) {
      sets.push('speed_down = @speed_down')
      sets.push('speed_up = @speed_up')
      params.speed_down = partial.speed.down
      params.speed_up = partial.speed.up
    }
    if (partial.files !== undefined) {
      sets.push('files = @files')
      params.files = JSON.stringify(partial.files)
    }
    if (partial.subtitle !== undefined) {
      sets.push('subtitle = @subtitle')
      params.subtitle = partial.subtitle ? JSON.stringify(partial.subtitle) : null
    }
    if (partial.created_at !== undefined) {
      sets.push('created_at = @created_at')
      params.created_at = partial.created_at.toISOString()
    }
    if (partial.completed_at !== undefined) {
      sets.push('completed_at = @completed_at')
      params.completed_at = partial.completed_at.toISOString()
    }
    if (partial.retry_count !== undefined) {
      sets.push('retry_count = @retry_count')
      params.retry_count = partial.retry_count
    }
    if (partial.error !== undefined) {
      sets.push('error = @error')
      params.error = partial.error ?? null
    }
    if (partial.aria2_gid !== undefined) {
      sets.push('aria2_gid = @aria2_gid')
      params.aria2_gid = partial.aria2_gid ?? null
    }

    if (sets.length === 0) return // 无字段需要更新

    const stmt = this.db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = @id`)
    stmt.run(params)
  }

  /** 根据 ID 查询单个任务 */
  getById(id: string): Task | null {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?')
    const row = stmt.get(id) as TaskRow | undefined
    return row ? rowToTask(row) : null
  }

  /** 查询所有任务 */
  getAll(): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks ORDER BY created_at ASC')
    const rows = stmt.all() as TaskRow[]
    return rows.map(rowToTask)
  }

  /** 按状态查询任务 */
  getByStatus(status: TaskStatus): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at ASC')
    const rows = stmt.all(status) as TaskRow[]
    return rows.map(rowToTask)
  }

  /** 删除任务 */
  delete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?')
    stmt.run(id)
  }

  /** 关闭数据库连接 */
  close(): void {
    this.db.close()
  }
}
