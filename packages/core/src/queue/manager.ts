// queue/manager.ts — 任务队列管理
// 对应 PRD §6.2 任务队列与调度

import type { Task } from '../types.js'
import { Aria2Client } from '../aria2/client.js'

export class QueueManager {
  private aria2: Aria2Client

  constructor(aria2: Aria2Client) {
    this.aria2 = aria2
  }

  /** 添加任务 */
  async add(uri: string, sourceQuery?: string, options?: { dir?: string }): Promise<Task> {
    const gid = await this.aria2.addUri(uri, options)
    const status = await this.aria2.tellStatus(gid)
    const task = this.aria2.mapToTask(status, sourceQuery)
    // Persist the enqueue URI even if aria2 has not yet reported file.uris.
    return { ...task, uri: task.uri || uri }
  }

  /** 暂停任务 */
  async pause(gid: string): Promise<void> {
    await this.aria2.pause(gid)
  }

  /** 恢复任务 */
  async resume(gid: string): Promise<void> {
    await this.aria2.unpause(gid)
  }

  /** 删除任务 */
  async remove(gid: string): Promise<void> {
    await this.aria2.remove(gid)
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
    return [...active, ...waiting, ...stopped].map((s) =>
      this.aria2.mapToTask(s as Parameters<Aria2Client['mapToTask']>[0]),
    )
  }

  /** 查询单个任务状态 */
  async getStatus(gid: string): Promise<Task> {
    const status = await this.aria2.tellStatus(gid)
    return this.aria2.mapToTask(status)
  }

  /** 获取全局统计 */
  async getStats() {
    return this.aria2.getGlobalStat()
  }
}
