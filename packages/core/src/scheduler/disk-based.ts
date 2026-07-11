// scheduler/disk-based.ts — 磁盘空间保护调度
// 对应 PRD §6.3.2 磁盘保护

import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import type { DiskThresholds } from '../types.js'
import { Aria2Client } from '../aria2/client.js'

/** 磁盘检查结果动作类型 */
export type DiskAction = 'none' | 'pause-low' | 'pause-all' | 'resume'

/** 磁盘检查返回结构 */
export interface DiskCheckResult {
  /** 剩余可用空间（GB） */
  freeGb: number
  /** 本次采取的动作 */
  action: DiskAction
}

/**
 * 磁盘空间保护调度器
 *
 * 定期检查磁盘剩余空间，当空间不足时自动暂停下载任务：
 * - 低于 `critical_gb`：暂停所有任务
 * - 低于 `low_gb`：仅暂停低优先级任务（priority < 3）
 * - 恢复至 `resume_gb` 以上：恢复此前被本调度器暂停的任务
 */
export class DiskScheduler extends EventEmitter {
  private aria2: Aria2Client
  private thresholds: DiskThresholds
  private downloadDir: string
  private timer: ReturnType<typeof setInterval> | null = null
  /** 被本调度器暂停的 aria2 gid 列表，用于后续恢复 */
  private pausedByUs: Set<string> = new Set()

  constructor(aria2: Aria2Client, thresholds: DiskThresholds, downloadDir: string) {
    super()
    this.aria2 = aria2
    this.thresholds = thresholds
    this.downloadDir = downloadDir
  }

  /** 启动定时检查（默认每 30 秒） */
  start(intervalMs?: number): void {
    if (this.timer) return
    const interval = intervalMs ?? 30_000
    this.timer = setInterval(() => {
      void this.check().catch(() => {
        // aria2 不可用时静默忽略
      })
    }, interval)
    this.check().catch(() => {
      // aria2 不可用时静默忽略
    })
  }

  /** 停止定时检查 */
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /**
   * 执行一次磁盘空间检查并采取相应动作
   *
   * @returns 剩余空间（GB）与本次采取的动作
   */
  async check(): Promise<DiskCheckResult> {
    const downloadDir = this.downloadDir
    const freeGb = await this.getFreeSpaceGB(downloadDir)

    let action: DiskAction

    if (freeGb < this.thresholds.critical_gb) {
      // 临界：暂停全部任务
      action = 'pause-all'
      await this.pauseAllTasks()
    } else if (freeGb < this.thresholds.low_gb) {
      // 低水位：暂停低优先级任务（priority < 3）
      action = 'pause-low'
      await this.pauseLowPriorityTasks()
    } else if (freeGb > this.thresholds.resume_gb && this.pausedByUs.size > 0) {
      // 已恢复：重新启动此前暂停的任务
      action = 'resume'
      await this.resumePausedTasks()
    } else {
      action = 'none'
    }

    this.emit('action', action, freeGb)
    return { freeGb, action }
  }

  /**
   * 获取指定路径所在磁盘的剩余空间（GB）
   *
   * 使用 `fs.statfs`（Node 18+）读取文件系统块信息并换算为 GB。
   *
   * @param path - 要检查的文件系统路径
   * @returns 剩余空间（GB），出错时返回 `Infinity` 以避免误触发暂停
   */
  private async getFreeSpaceGB(path: string): Promise<number> {
    const BYTES_PER_GB = 1024 ** 3

    try {
      const stats = await fs.promises.statfs(path)
      // bsize × bavail = 可用字节数
      const freeBytes = stats.bsize * stats.bavail
      return freeBytes / BYTES_PER_GB
    } catch {
      // statfs 不可用（平台不支持等），返回 Infinity 避免误触发
      return Infinity
    }
  }

  /** 暂停全部活跃任务 */
  private async pauseAllTasks(): Promise<void> {
    try {
      const active = await this.aria2.tellActive()
      for (const item of active) {
        await this.aria2.pause(item.gid)
        this.pausedByUs.add(item.gid)
      }
    } catch {
      // aria2 不可用时静默忽略
    }
  }

  /** 暂停低优先级任务（priority < 3，即高优先级数值） */
  private async pauseLowPriorityTasks(): Promise<void> {
    try {
      const active = await this.aria2.tellActive()
      for (const item of active) {
        const task = this.aria2.mapToTask(item)
        if (task.priority < 3) {
          await this.aria2.pause(item.gid)
          this.pausedByUs.add(item.gid)
        }
      }
    } catch {
      // aria2 不可用时静默忽略
    }
  }

  /** 恢复此前被本调度器暂停的任务 */
  private async resumePausedTasks(): Promise<void> {
    try {
      for (const gid of this.pausedByUs) {
        await this.aria2.unpause(gid)
      }
    } catch {
      // aria2 不可用时静默忽略
    }
    this.pausedByUs.clear()
  }
}
