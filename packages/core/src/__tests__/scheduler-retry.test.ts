// __tests__/scheduler-retry.test.ts — Tests for RetryScheduler
//
// Exercises shouldRetry logic, classifyError, and checkAndRetry
// with mocked Aria2Client.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RetryScheduler } from '../scheduler/retry.js'
import type { Task } from '../types.js'
import type { Aria2Client } from '../aria2/client.js'

/** Build a mock Aria2Client */
function mockAria2(overrides: Partial<Aria2Client> = {}): Aria2Client {
  return {
    addUri: vi.fn().mockResolvedValue('new-gid'),
    tellActive: vi.fn().mockResolvedValue([]),
    tellWaiting: vi.fn().mockResolvedValue([]),
    tellStopped: vi.fn().mockResolvedValue([]),
    pause: vi.fn(),
    unpause: vi.fn(),
    remove: vi.fn(),
    tellStatus: vi.fn(),
    getGlobalStat: vi.fn(),
    changeGlobalOption: vi.fn(),
    setGlobalSpeedLimit: vi.fn(),
    addTorrent: vi.fn(),
    mapToTask: vi.fn(),
    ...overrides,
  } as unknown as Aria2Client
}

/** Build a minimal failed task */
function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    source_query: 'test',
    uri: 'magnet:?xt=test',
    status: 'failed',
    priority: 3,
    progress: 0,
    speed: { down: 0, up: 0 },
    files: [],
    created_at: new Date(),
    retry_count: 0,
    error: 'connection refused',
    aria2_gid: 'old-gid',
    ...overrides,
  }
}

describe('RetryScheduler', () => {
  let aria2: Aria2Client

  beforeEach(() => {
    aria2 = mockAria2()
  })

  describe('classifyError', () => {
    const scheduler = new RetryScheduler(aria2)

    it('classifies 403 as retry', () => {
      expect(scheduler.classifyError('HTTP 403 Forbidden')).toBe('retry')
    })

    it('classifies 404 as retry', () => {
      expect(scheduler.classifyError('HTTP 404 Not Found')).toBe('retry')
    })

    it('classifies no peers', () => {
      expect(scheduler.classifyError('no peers available')).toBe('no-peers')
    })

    it('classifies no seeders', () => {
      expect(scheduler.classifyError('no seeders')).toBe('no-peers')
    })

    it('classifies disk full', () => {
      expect(scheduler.classifyError('disk space full')).toBe('disk-full')
    })

    it('defaults to retry for unknown errors', () => {
      expect(scheduler.classifyError('some random error')).toBe('retry')
    })

    it('is case-insensitive', () => {
      expect(scheduler.classifyError('DISK FULL')).toBe('disk-full')
      expect(scheduler.classifyError('No PEERS')).toBe('no-peers')
    })
  })

  describe('shouldRetry', () => {
    it('returns true for failed task within retry limit', () => {
      const scheduler = new RetryScheduler(aria2)
      expect(scheduler.shouldRetry(makeTask())).toBe(true)
    })

    it('returns false for non-failed tasks', () => {
      const scheduler = new RetryScheduler(aria2)
      expect(scheduler.shouldRetry(makeTask({ status: 'completed' }))).toBe(false)
      expect(scheduler.shouldRetry(makeTask({ status: 'downloading' }))).toBe(false)
      expect(scheduler.shouldRetry(makeTask({ status: 'pending' }))).toBe(false)
    })

    it('returns false when retry_count exceeds maxRetries', () => {
      const scheduler = new RetryScheduler(aria2, { maxRetries: 3 })
      expect(scheduler.shouldRetry(makeTask({ retry_count: 3 }))).toBe(false)
      expect(scheduler.shouldRetry(makeTask({ retry_count: 2 }))).toBe(true)
    })

    it('respects custom maxRetries', () => {
      const scheduler = new RetryScheduler(aria2, { maxRetries: 1 })
      expect(scheduler.shouldRetry(makeTask({ retry_count: 1 }))).toBe(false)
      expect(scheduler.shouldRetry(makeTask({ retry_count: 0 }))).toBe(true)
    })
  })

  describe('checkAndRetry', () => {
    it('retries failed tasks and calls aria2.addUri', async () => {
      const scheduler = new RetryScheduler(aria2, { baseDelayMs: 0 })
      const tasks = [makeTask({ retry_count: 0 })]
      const result = await scheduler.checkAndRetry(tasks)
      expect(aria2.addUri).toHaveBeenCalledWith('magnet:?xt=test')
      expect(result[0].status).toBe('pending')
      expect(result[0].retry_count).toBe(1)
      expect(result[0].aria2_gid).toBe('new-gid')
      expect(result[0].error).toBeUndefined()
    })

    it('skips non-failed tasks', async () => {
      const scheduler = new RetryScheduler(aria2, { baseDelayMs: 0 })
      const tasks = [makeTask({ status: 'completed' })]
      const result = await scheduler.checkAndRetry(tasks)
      expect(aria2.addUri).not.toHaveBeenCalled()
      expect(result[0].status).toBe('completed')
    })

    it('increments retry_count even when aria2 fails', async () => {
      const failingAria2 = mockAria2({
        addUri: vi.fn().mockRejectedValue(new Error('rpc error')),
      })
      const scheduler = new RetryScheduler(failingAria2, { baseDelayMs: 0 })
      const tasks = [makeTask({ retry_count: 1 })]
      const result = await scheduler.checkAndRetry(tasks)
      expect(result[0].retry_count).toBe(2)
    })

    it('does not retry tasks at max retries', async () => {
      const scheduler = new RetryScheduler(aria2, { maxRetries: 2, baseDelayMs: 0 })
      const tasks = [makeTask({ retry_count: 2 })]
      const result = await scheduler.checkAndRetry(tasks)
      expect(aria2.addUri).not.toHaveBeenCalled()
      expect(result[0].retry_count).toBe(2)
    })

    it('handles empty task list', async () => {
      const scheduler = new RetryScheduler(aria2)
      const result = await scheduler.checkAndRetry([])
      expect(result).toEqual([])
    })

    it('preserves non-retryable tasks unchanged in the result', async () => {
      const scheduler = new RetryScheduler(aria2, { baseDelayMs: 0 })
      const tasks = [
        makeTask({ id: 't1', status: 'completed' }),
        makeTask({ id: 't2', status: 'failed', retry_count: 0 }),
      ]
      const result = await scheduler.checkAndRetry(tasks)
      expect(result).toHaveLength(2)
      expect(result[0].status).toBe('completed')
      expect(result[1].status).toBe('pending')
    })
  })

  describe('constructor defaults', () => {
    it('defaults maxRetries to 3', () => {
      const scheduler = new RetryScheduler(aria2)
      expect(scheduler.shouldRetry(makeTask({ retry_count: 2 }))).toBe(true)
      expect(scheduler.shouldRetry(makeTask({ retry_count: 3 }))).toBe(false)
    })
  })
})
