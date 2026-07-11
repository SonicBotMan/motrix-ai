// queue/manager.ts — 任务队列管理
// 对应 PRD §6.2 任务队列与调度

import type { Task } from '../types.js'
import { Aria2Client } from '../aria2/client.js'
import type { TaskDatabase } from './database.js'
import { createLogger } from '../logger.js'

const logger = createLogger('queue:manager')

export class QueueManager {
  private aria2: Aria2Client
  private db?: TaskDatabase

  constructor(aria2: Aria2Client, db?: TaskDatabase) {
    this.aria2 = aria2
    this.db = db
  }

  /** Persist (insert or update) a task when a database is attached. */
  private persist(task: Task): void {
    if (!this.db) return
    try {
      if (this.db.getById(task.id)) {
        this.db.update(task.id, {
          source_query: task.source_query,
          intent: task.intent,
          uri: task.uri,
          status: task.status,
          priority: task.priority,
          progress: task.progress,
          speed: task.speed,
          files: task.files,
          subtitle: task.subtitle,
          completed_at: task.completed_at,
          retry_count: task.retry_count,
          error: task.error,
          aria2_gid: task.aria2_gid,
        })
      } else {
        this.db.insert(task)
      }
    } catch (err) {
      logger.warn(`failed to persist task ${task.id}: ${String(err)}`)
    }
  }

  /** 添加任务 */
  async add(uri: string, sourceQuery?: string, options?: { dir?: string; intent?: Task['intent'] }): Promise<Task> {
    const gid = await this.aria2.addUri(uri, options?.dir ? { dir: options.dir } : undefined)
    const status = await this.aria2.tellStatus(gid)
    const task = this.aria2.mapToTask(status, sourceQuery)
    // Persist the enqueue URI even if aria2 has not yet reported file.uris.
    const withUri = {
      ...task,
      uri: task.uri || uri,
      intent: options?.intent ?? task.intent,
    }
    this.persist(withUri)
    return withUri
  }

  /** 暂停任务 */
  async pause(gid: string): Promise<void> {
    await this.aria2.pause(gid)
    if (this.db?.getById(gid)) {
      this.db.update(gid, { status: 'paused' })
    }
  }

  /** 恢复任务 */
  async resume(gid: string): Promise<void> {
    await this.aria2.unpause(gid)
    if (this.db?.getById(gid)) {
      this.db.update(gid, { status: 'downloading' })
    }
  }

  /** 删除任务 */
  async remove(gid: string): Promise<void> {
    await this.aria2.remove(gid)
    try {
      this.db?.delete(gid)
    } catch (err) {
      logger.warn(`failed to delete task ${gid} from db: ${String(err)}`)
    }
  }

  /** 查询所有任务（分页拉取 waiting/stopped，避免 100 条截断） */
  async listAll(): Promise<Task[]> {
    const pageSize = 100
    const paginate = async (fetchPage: (offset: number, num: number) => Promise<unknown[]>) => {
      const all: unknown[] = []
      let offset = 0
      for (;;) {
        const batch = await fetchPage(offset, pageSize)
        all.push(...batch)
        if (batch.length < pageSize) break
        offset += pageSize
      }
      return all
    }

    const [active, waiting, stopped] = await Promise.all([
      this.aria2.tellActive(),
      paginate((o, n) => this.aria2.tellWaiting(o, n)),
      paginate((o, n) => this.aria2.tellStopped(o, n)),
    ])
    const tasks = [...active, ...waiting, ...stopped].map((s) =>
      this.aria2.mapToTask(s as Parameters<Aria2Client['mapToTask']>[0]),
    )

    // Enrich from DB (source_query / uri / intent) and sync live status back.
    if (this.db) {
      for (const task of tasks) {
        const stored = this.db.getById(task.id)
        if (stored) {
          if (!task.uri && stored.uri) task.uri = stored.uri
          if (!task.source_query && stored.source_query) task.source_query = stored.source_query
          if (!task.intent && stored.intent) task.intent = stored.intent
          this.persist(task)
        } else {
          this.persist(task)
        }
      }
    }

    return tasks
  }

  /** 查询单个任务状态 */
  async getStatus(gid: string): Promise<Task> {
    const status = await this.aria2.tellStatus(gid)
    const task = this.aria2.mapToTask(status)
    if (this.db) {
      const stored = this.db.getById(gid)
      if (stored) {
        if (!task.uri && stored.uri) task.uri = stored.uri
        if (!task.source_query && stored.source_query) task.source_query = stored.source_query
        if (!task.intent && stored.intent) task.intent = stored.intent
      }
      this.persist(task)
    }
    return task
  }

  /** 获取全局统计 */
  async getStats() {
    return this.aria2.getGlobalStat()
  }
}
