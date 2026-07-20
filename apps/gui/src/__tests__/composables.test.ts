import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({
    title: 'Test Movie',
    quality: '4K',
    need_subtitle: true,
    search_keywords: ['Test Movie'],
    resource_type: 'movie',
  }),
}))

describe('useSchedule', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('finds active rule based on time', async () => {
    const { useSchedule } = await import('../composables/useSchedule')
    const rules = [
      { name: '深夜全速', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5 },
      { name: '白天让路', time_start: '07:00', time_end: '18:00', speed_limit: 5000000, max_concurrent: 2 },
      { name: '晚间适度', time_start: '18:00', time_end: '23:00', speed_limit: 10000000, max_concurrent: 3 },
    ]
    const { getCurrentRule } = useSchedule(rules)
    vi.setSystemTime(new Date('2026-01-01T12:00:00'))
    const rule = getCurrentRule()
    expect(rule).toBeDefined()
    expect(rule?.name).toBe('白天让路')
  })

  it('handles cross-midnight rules', async () => {
    const { useSchedule } = await import('../composables/useSchedule')
    const rules = [
      { name: '深夜全速', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5 },
      { name: '白天让路', time_start: '07:00', time_end: '18:00', speed_limit: 5000000, max_concurrent: 2 },
      { name: '晚间适度', time_start: '18:00', time_end: '23:00', speed_limit: 10000000, max_concurrent: 3 },
    ]
    const { getCurrentRule } = useSchedule(rules)
    vi.setSystemTime(new Date('2026-01-01T02:00:00'))
    const rule = getCurrentRule()
    expect(rule).toBeDefined()
    expect(rule?.name).toBe('深夜全速')
  })

  it('returns null when no rule matches', async () => {
    const { useSchedule } = await import('../composables/useSchedule')
    const { getCurrentRule } = useSchedule([])
    vi.setSystemTime(new Date('2026-01-01T12:00:00'))
    const rule = getCurrentRule()
    expect(rule).toBeNull()
  })
})
