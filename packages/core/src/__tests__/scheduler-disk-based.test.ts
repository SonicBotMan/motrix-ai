// __tests__/scheduler-disk-based.test.ts — Tests for DiskScheduler
//
// Mocks Aria2Client (no real aria2 RPC) and fs.promises.statfs (no real
// filesystem probe) so tests are deterministic and run in milliseconds.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DiskScheduler, type DiskAction } from '../scheduler/disk-based.js'
import type { DiskThresholds, Task } from '../types.js'

// Stub fs.promises.statfs before the scheduler imports it.
// We override the module export so the scheduler reads our fake values.
let mockFreeGb = 100
vi.mock('node:fs', () => ({
  default: {
    promises: {
      statfs: async () => ({
        bsize: 1024 ** 3,
        bavail: mockFreeGb,
      }),
    },
  },
}))

// Minimal mock of Aria2Client — only the methods DiskScheduler uses.
function makeMockAria2() {
  const paused: string[] = []
  const resumed: string[] = []
  let active: Array<{ gid: string; priority: Task['priority'] }> = []

  return {
    paused,
    resumed,
    setActive(items: Array<{ gid: string; priority: Task['priority'] }>) {
      active = items
    },
    client: {
      tellActive: vi.fn(async () => active.map((a) => ({ gid: a.gid, _priority: a.priority }))),
      pause: vi.fn(async (gid: string) => {
        paused.push(gid)
        return gid
      }),
      unpause: vi.fn(async (gid: string) => {
        resumed.push(gid)
        return gid
      }),
      mapToTask: (status: { gid: string; _priority: Task['priority'] }) =>
        ({
          id: status.gid,
          source_query: '',
          uri: '',
          status: 'downloading',
          priority: status._priority,
          progress: 0,
          speed: { down: 0, up: 0 },
          files: [],
          created_at: new Date(),
          retry_count: 0,
        }) as Task,
    },
  }
}

function makeThresholds(overrides: Partial<DiskThresholds> = {}): DiskThresholds {
  return {
    low_gb: 10,
    critical_gb: 2,
    resume_gb: 20,
    ...overrides,
  }
}

describe('DiskScheduler', () => {
  let scheduler: DiskScheduler
  let mock: ReturnType<typeof makeMockAria2>

  beforeEach(() => {
    mockFreeGb = 100
    mock = makeMockAria2()
    scheduler = new DiskScheduler(mock.client as any, makeThresholds())
  })

  afterEach(() => {
    scheduler.stop()
  })

  describe('check', () => {
    it("returns action 'none' when free space is healthy and nothing is paused", async () => {
      mockFreeGb = 100
      const result = await scheduler.check()
      expect(result.action).toBe('none')
      expect(result.freeGb).toBe(100)
    })

    it("returns action 'pause-all' when free space drops below critical_gb", async () => {
      mockFreeGb = 1
      mock.setActive([
        { gid: 'g1', priority: 3 },
        { gid: 'g2', priority: 1 },
      ])
      const result = await scheduler.check()
      expect(result.action).toBe('pause-all')
      expect(mock.paused).toEqual(['g1', 'g2'])
    })

    it("returns action 'pause-low' when free space is below low_gb but above critical_gb", async () => {
      // PRD semantics: smaller priority number = higher priority.
      // pauseLowPriorityTasks pauses tasks where priority < 3 (i.e. priority 1 or 2).
      mockFreeGb = 5
      mock.setActive([
        { gid: 'prio1', priority: 1 },
        { gid: 'prio2', priority: 2 },
        { gid: 'prio4', priority: 4 },
        { gid: 'prio5', priority: 5 },
      ])
      const result = await scheduler.check()
      expect(result.action).toBe('pause-low')
      expect(mock.paused.sort()).toEqual(['prio1', 'prio2'])
      expect(mock.paused).not.toContain('prio4')
      expect(mock.paused).not.toContain('prio5')
    })

    it("returns action 'resume' when free space recovers above resume_gb and tasks were paused", async () => {
      mockFreeGb = 1
      mock.setActive([{ gid: 'g1', priority: 3 }])
      await scheduler.check()

      mockFreeGb = 25
      mock.client.tellActive.mockResolvedValueOnce([])
      const result = await scheduler.check()
      expect(result.action).toBe('resume')
      expect(mock.resumed).toEqual(['g1'])
    })

    it('does not resume when no tasks are tracked as paused-by-us', async () => {
      mockFreeGb = 100
      const result = await scheduler.check()
      expect(result.action).toBe('none')
      expect(mock.resumed).toEqual([])
    })

    it("emits an 'action' event with the action and freeGb", async () => {
      mockFreeGb = 1
      mock.setActive([])
      let emitted: { action: DiskAction; freeGb: number } | null = null
      scheduler.on('action', (action: DiskAction, freeGb: number) => {
        emitted = { action, freeGb }
      })
      await scheduler.check()
      expect(emitted).not.toBeNull()
      expect(emitted!.action).toBe('pause-all')
      expect(emitted!.freeGb).toBe(1)
    })

    it("treats boundary low_gb as 'pause-low' (exclusive lower-bound for none)", async () => {
      mockFreeGb = 9.99
      mock.setActive([{ gid: 'g1', priority: 4 }])
      const result = await scheduler.check()
      expect(result.action).toBe('pause-low')
    })

    it("treats boundary critical_gb as 'pause-all'", async () => {
      mockFreeGb = 1.99
      mock.setActive([{ gid: 'g1', priority: 3 }])
      const result = await scheduler.check()
      expect(result.action).toBe('pause-all')
    })

    it('silently tolerates aria2 errors (no throw)', async () => {
      mockFreeGb = 1
      mock.client.tellActive.mockRejectedValueOnce(new Error('aria2 down'))
      await expect(scheduler.check()).resolves.toEqual({
        freeGb: 1,
        action: 'pause-all',
      })
    })
  })

  describe('start / stop', () => {
    it('start triggers an immediate check', async () => {
      vi.useFakeTimers()
      mockFreeGb = 50
      const spy = vi.spyOn(scheduler, 'check')
      scheduler.start(60_000)
      expect(spy).toHaveBeenCalledTimes(1)
      scheduler.stop()
      vi.useRealTimers()
    })

    it('start is idempotent (calling twice does not double the interval)', () => {
      vi.useFakeTimers()
      scheduler.start(60_000)
      const firstTimer = (scheduler as any).timer
      scheduler.start(60_000)
      expect((scheduler as any).timer).toBe(firstTimer)
      scheduler.stop()
      vi.useRealTimers()
    })

    it('stop is a no-op when not started', () => {
      expect(() => scheduler.stop()).not.toThrow()
    })

    it('start with custom interval fires checks at that interval', async () => {
      vi.useFakeTimers()
      mockFreeGb = 50
      const spy = vi.spyOn(scheduler, 'check').mockResolvedValue({
        freeGb: 50,
        action: 'none',
      })
      scheduler.start(100)
      const initial = spy.mock.calls.length
      await vi.advanceTimersByTimeAsync(250)
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(initial + 2)
      scheduler.stop()
      vi.useRealTimers()
    })
  })
})
