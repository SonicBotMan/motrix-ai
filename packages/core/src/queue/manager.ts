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
    // Poll for task registration instead of a fixed 200ms sleep.
    // aria2 may take a variable amount of time to register the task after addUri.
    const MAX_RETRIES = 5
    const RETRY_DELAY_MS = 100
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const status = await this.aria2.tellStatus(gid)
        return this.aria2.mapToTask(status, sourceQuery)
      } catch (err) {
        if (attempt === MAX_RETRIES - 1) {
          throw new Error(
            `Task ${gid} not found after ${MAX_RETRIES} attempts: ${err instanceof Error ? err.message : String(err)}`,
            { cause: err },
          )
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
      }
    }
    // Unreachable — loop always returns or throws
    throw new Error(`Task ${gid} registration failed`)
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

  /** 查询所有任务 */
  async listAll(): Promise<Task[]> {
    const [active, waiting, stopped] = await Promise.all([
      this.aria2.tellActive(),
      this.aria2.tellWaiting(),
      this.aria2.tellStopped(),
    ])
    return [...active, ...waiting, ...stopped].map((s) => this.aria2.mapToTask(s))
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
