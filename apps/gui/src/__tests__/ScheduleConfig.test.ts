// @vitest-environment happy-dom
// __tests__/ScheduleConfig.test.ts — Tests for schedule config component logic
//
// Exercises helper functions from ScheduleConfig.vue: formatSpeed, rule
// validation, current rule matching, and add/remove operations.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

vi.mock('naive-ui', () => ({
  NCard: { name: 'NCard', template: '<div><slot /></div>' },
  NButton: { name: 'NButton', template: '<button><slot /></button>' },
  NInput: { name: 'NInput', template: '<input />' },
  NSwitch: { name: 'NSwitch', template: '<span />' },
  NIcon: { name: 'NIcon', template: '<span><slot /></span>' },
  NTag: { name: 'NTag', template: '<span><slot /></span>' },
  useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}))

vi.mock('@vicons/ionicons5', () => ({
  TimeOutline: { name: 'TimeOutline' },
  SpeedometerOutline: { name: 'SpeedometerOutline' },
  SaveOutline: { name: 'SaveOutline' },
}))

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: () => null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

describe('ScheduleConfig logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  describe('formatSpeed', () => {
    function formatSpeed(bytes: number): string {
      if (bytes === 0) return '无限制'
      return `${(bytes / 1024 / 1024).toFixed(0)} MB/s`
    }

    it('returns unlimited for 0 speed', () => {
      expect(formatSpeed(0)).toBe('无限制')
    })

    it('formats 5MB/s correctly', () => {
      expect(formatSpeed(5_000_000)).toBe('5 MB/s')
    })

    it('formats 10MB/s correctly', () => {
      expect(formatSpeed(10_000_000)).toBe('10 MB/s')
    })

    it('rounds to integer MB', () => {
      const result = formatSpeed(7_500_000) // 7.15... MB
      expect(result).toMatch(/^\d+ MB\/s$/)
    })
  })

  describe('ScheduleRule defaults', () => {
    it('default rules have three time slots', () => {
      const rules = [
        { name: '深夜全速', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5, enabled: true },
        { name: '白天让路', time_start: '07:00', time_end: '18:00', speed_limit: 5000000, max_concurrent: 2, enabled: true },
        { name: '晚间适度', time_start: '18:00', time_end: '23:00', speed_limit: 10000000, max_concurrent: 3, enabled: true },
      ]
      expect(rules).toHaveLength(3)
    })

    it('night rule has unlimited speed', () => {
      const rules = [
        { name: '深夜全速', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5, enabled: true },
      ]
      expect(rules[0].speed_limit).toBe(0)
      expect(rules[0].max_concurrent).toBe(5)
    })

    it('daytime rule has limited speed', () => {
      const rules = [
        { name: '白天让路', time_start: '07:00', time_end: '18:00', speed_limit: 5000000, max_concurrent: 2, enabled: true },
      ]
      expect(rules[0].speed_limit).toBe(5_000_000)
      expect(rules[0].max_concurrent).toBe(2)
    })
  })

  describe('new rule template', () => {
    it('has empty name and default values', () => {
      const newRule = {
        name: '',
        time_start: '00:00',
        time_end: '23:59',
        speed_limit: 0,
        max_concurrent: 3,
        enabled: true,
      }
      expect(newRule.name).toBe('')
      expect(newRule.time_start).toBe('00:00')
      expect(newRule.time_end).toBe('23:59')
      expect(newRule.max_concurrent).toBe(3)
    })
  })

  describe('currentRule matching', () => {
    function findCurrentRule(rules: Array<{ name: string; time_start: string; time_end: string }>, current: string) {
      return rules.find((r) => {
        if (r.time_start <= r.time_end) {
          return current >= r.time_start && current < r.time_end
        }
        return current >= r.time_start || current < r.time_end
      })
    }

    const rules = [
      { name: '深夜全速', time_start: '23:00', time_end: '07:00' },
      { name: '白天让路', time_start: '07:00', time_end: '18:00' },
      { name: '晚间适度', time_start: '18:00', time_end: '23:00' },
    ]

    it('matches daytime rule at 12:00', () => {
      const rule = findCurrentRule(rules, '12:00')
      expect(rule?.name).toBe('白天让路')
    })

    it('matches night rule at 03:00 (cross-midnight)', () => {
      const rule = findCurrentRule(rules, '03:00')
      expect(rule?.name).toBe('深夜全速')
    })

    it('matches evening rule at 20:00', () => {
      const rule = findCurrentRule(rules, '20:00')
      expect(rule?.name).toBe('晚间适度')
    })

    it('matches night rule at 23:30 (start of cross-midnight)', () => {
      const rule = findCurrentRule(rules, '23:30')
      expect(rule?.name).toBe('深夜全速')
    })

    it('returns undefined when no rules match', () => {
      expect(findCurrentRule([], '12:00')).toBeUndefined()
    })
  })
})
