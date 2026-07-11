// scheduler/time-based.ts — 时段自适应调度
// 对应 PRD §6.3.1 时段调度

import type { ScheduleRule } from '../types.js'
import { Aria2Client } from '../aria2/client.js'

export class TimeScheduler {
  private aria2: Aria2Client
  private rules: ScheduleRule[]
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(aria2: Aria2Client, rules: ScheduleRule[]) {
    this.aria2 = aria2
    this.rules = rules
  }

  /** 启动定时检查（每分钟） */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), 60_000)
    this.tick() // 立即执行一次
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    const now = new Date()
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const activeRule = this.rules.find(
      (r) => r.enabled !== false && this.isInTimeRange(currentTime, r.time_start, r.time_end),
    )

    if (!activeRule) return

    try {
      await this.aria2.setGlobalSpeedLimit(activeRule.speed_limit)
      if (typeof activeRule.max_concurrent === 'number') {
        await this.aria2.changeGlobalOption({
          'max-concurrent-downloads': String(activeRule.max_concurrent),
        })
      }
    } catch {
      // aria2 不可用时静默忽略
    }
  }

  private isInTimeRange(current: string, start: string, end: string): boolean {
    // 处理跨午夜的情况（如 23:00-07:00）
    if (start <= end) {
      return current >= start && current < end
    }
    return current >= start || current < end
  }
}
