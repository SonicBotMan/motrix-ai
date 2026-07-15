// src/composables/useSchedule.ts
// Reactive time-based scheduling for the GUI.
//
// Mirrors the logic in @motrix-ai/core's TimeScheduler (PRD §6.3.1) but runs
// entirely in the renderer, exposing reactive state a Vue component can bind.
// `ScheduleRule` is defined locally because @motrix-ai/core is not currently a
// GUI dependency; the shape is identical so swapping to the import later is a
// no-op.

import { ref, onUnmounted, type Ref } from 'vue'
import { createLogger } from '@motrix-ai/core/browser'
import type { ScheduleRule } from '@motrix-ai/core'
export type { ScheduleRule }
const logger = createLogger('schedule')

/** The check interval, once per minute (matches core TimeScheduler). */
const CHECK_INTERVAL_MS = 60_000

/** Format a Date as zero-padded `HH:mm`. */
function toHHmm(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Decide whether `current` falls inside `[start, end)`.
 *
 * Handles cross-midnight windows (e.g. `23:00`–`07:00`) the same way core does:
 * when start > end the range wraps, so membership is `current >= start || current < end`.
 */
function isInTimeRange(current: string, start: string, end: string): boolean {
  if (start <= end) {
    return current >= start && current < end
  }
  return current >= start || current < end
}

/**
 * Reactive scheduler.
 *
 * @param initialRules Optional rules to seed the scheduler with. Replace later
 *   via {@link setRules}; the returned `rules` ref is writable.
 * @returns Reactive `currentRule` / `nextCheck` plus control methods.
 *
 * @example
 * const sched = useSchedule(rules)
 * sched.start()
 * onUnmounted(() => sched.stop())
 */
export function useSchedule(initialRules: ScheduleRule[] = []) {
  /** The rules under evaluation; writable so callers can rebind to live config. */
  const rules: Ref<ScheduleRule[]> = ref([...initialRules])
  /** Rule active right now, or null when none match. */
  const currentRule = ref<ScheduleRule | null>(null)
  /** When the scheduler will next re-evaluate, or null while stopped. */
  const nextCheck = ref<Date | null>(null)

  let timer: ReturnType<typeof setInterval> | null = null
  let lastAppliedLimit: string | null = null

  async function applyRuleToAria2(rule: ScheduleRule | null): Promise<void> {
    const limitStr = rule ? String(rule.speed_limit) : '0'
    if (limitStr === lastAppliedLimit) return
    lastAppliedLimit = limitStr
    try {
      const { useAria2 } = await import('@/composables/useAria2')
      const aria2 = useAria2()
      if (aria2.connected.value) {
        await aria2.changeGlobalOption({
          'max-overall-download-limit': limitStr === '0' ? '0' : `${Number(limitStr) / 1024}K`,
          'max-concurrent-downloads': rule ? String(rule.max_concurrent) : '5',
        })
      }
    } catch (e) {
      logger.warn('Schedule apply failed:', e)
    }
  }

  /** Find the first rule whose window contains the given `HH:mm`. */
  function getCurrentRule(): ScheduleRule | null {
    const now = toHHmm(new Date())
    return rules.value.find((r) => isInTimeRange(now, r.time_start, r.time_end)) ?? null
  }

  /**
   * Compute the next whole-minute boundary from "now".
   * Used to surface *when* the current rule may change.
   */
  function getNextCheck(): Date {
    const next = new Date()
    next.setSeconds(0, 0)
    next.setMinutes(next.getMinutes() + 1)
    return next
  }

  /** Recompute the active rule and the next-check time. */
  function check(): void {
    currentRule.value = getCurrentRule()
    nextCheck.value = getNextCheck()
    void applyRuleToAria2(currentRule.value)
  }

  /** Begin checking every {@link CHECK_INTERVAL_MS}; runs one check immediately. */
  function start(): void {
    if (timer) return
    check()
    timer = setInterval(check, CHECK_INTERVAL_MS)
  }

  /** Stop the interval. Safe to call when already stopped. */
  function stop(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    nextCheck.value = null
  }

  /** Replace the rule set and re-evaluate immediately. */
  function setRules(next: ScheduleRule[]): void {
    rules.value = [...next]
    check()
  }

  // Defensive cleanup if used inside a component lifecycle without an explicit stop().
  onUnmounted(stop)

  return {
    rules,
    currentRule,
    nextCheck,
    start,
    stop,
    check,
    getCurrentRule,
    getNextCheck,
    setRules,
  }
}
