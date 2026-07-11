// scheduler/retry.ts — 失败任务自动重试调度
// 对应 PRD §6.3.3 自动重试

import type { Task } from '../types.js'
import { Aria2Client } from '../aria2/client.js'

/** 错误分类，用于决定重试策略 */
export type ErrorClassification = 'retry' | 'no-peers' | 'disk-full' | 'fatal'

/** RetryScheduler 构造选项 */
export interface RetrySchedulerOptions {
  /** 最大重试次数（默认 3） */
  maxRetries?: number
  /** 基础退避延迟（毫秒，默认 30 000） */
  baseDelayMs?: number
}

/**
 * 失败任务自动重试调度器
 *
 * 对状态为 `failed` 且未超过最大重试次数的任务执行指数退避重试：
 * - HTTP 403/404 → `retry`（换源重试）
 * - 无 Peers/Seeders → `no-peers`（等待后换 Tracker）
 * - 磁盘空间不足 → `disk-full`（等待磁盘恢复）
 * - 其他错误 → `retry`（默认可重试）
 */
export class RetryScheduler {
  private aria2: Aria2Client
  private maxRetries: number
  private baseDelayMs: number

  constructor(aria2: Aria2Client, options?: RetrySchedulerOptions) {
    this.aria2 = aria2
    this.maxRetries = options?.maxRetries ?? 3
    this.baseDelayMs = options?.baseDelayMs ?? 30_000
  }

  /**
   * 检查失败任务并按指数退避重试
   *
   * 对每个可重试的失败任务：
   * 1. 等待 `baseDelayMs × 2^retry_count` 毫秒（指数退避）
   * 2. 调用 `aria2.addUri` 重新提交下载
   * 3. 递增 `retry_count`，重置状态为 `pending`
   *
   * @param tasks - 当前任务列表
   * @returns 更新后的任务列表
   */
  async checkAndRetry(tasks: Task[]): Promise<Task[]> {
    const updated: Task[] = []

    for (const task of tasks) {
      if (!this.shouldRetry(task)) {
        updated.push(task)
        continue
      }

      // 指数退避延迟
      const delay = this.baseDelayMs * Math.pow(2, task.retry_count)

      // 等待退避时间
      await this.sleep(delay)

      try {
        // 重新提交下载链接
        if (!task.uri) {
          updated.push({
            ...task,
            retry_count: task.retry_count + 1,
            error: task.error ?? 'missing uri for retry',
          })
          continue
        }
        const newGid = await this.aria2.addUri(task.uri)

        updated.push({
          ...task,
          status: 'pending',
          retry_count: task.retry_count + 1,
          aria2_gid: newGid,
          error: undefined,
        })
      } catch {
        // 重试提交失败，保留失败状态但递增计数
        updated.push({
          ...task,
          retry_count: task.retry_count + 1,
        })
      }
    }

    return updated
  }

  /**
   * 分类错误信息以决定重试策略
   *
   * @param error - aria2 返回的错误信息
   * @returns 错误分类
   */
  classifyError(error: string): ErrorClassification {
    const lower = error.toLowerCase()

    if (lower.includes('403') || lower.includes('404')) {
      return 'retry' // 换源
    }
    if (lower.includes('no peers') || lower.includes('no seeders')) {
      return 'no-peers' // 换 Tracker
    }
    if (lower.includes('disk') || lower.includes('space')) {
      return 'disk-full'
    }
    return 'retry'
  }

  /**
   * 判断单个任务是否应该重试
   *
   * 满足以下全部条件才重试：
   * 1. 任务状态为 `failed`
   * 2. `retry_count` 未超过 `maxRetries`
   * 3. 错误分类不为 `fatal`
   *
   * @param task - 待检查的任务
   * @returns 是否应重试
   */
  shouldRetry(task: Task): boolean {
    if (task.status !== 'failed') return false
    if (task.retry_count >= this.maxRetries) return false

    const errorType = task.error ? this.classifyError(task.error) : 'retry'
    // disk-full / no-peers should wait for external recovery — not busy-retry.
    if (errorType === 'fatal' || errorType === 'disk-full' || errorType === 'no-peers') {
      return false
    }

    return true
  }

  /** 延迟工具函数 */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
