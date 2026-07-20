// __tests__/queue-manager.test.ts — Tests for QueueManager
//
// Exercises add(), pause(), resume(), remove(), listAll(), getStatus(),
// and getStats() with a mocked Aria2Client.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueueManager } from '../queue/manager.js'
import type { Aria2Client } from '../aria2/client.js'
import type { Task } from '../types.js'

function mockAria2(overrides: Partial<Aria2Client> = {}): Aria2Client {
  return {
    addUri: vi.fn().mockResolvedValue('gid-1'),
    addTorrent: vi.fn().mockResolvedValue('gid-1'),
    tellStatus: vi.fn().mockResolvedValue({
      gid: 'gid-1',
      status: 'active',
      totalLength: '1000',
      completedLength: '500',
      downloadSpeed: '100',
      uploadSpeed: '10',
      files: [],
    }),
    tellActive: vi.fn().mockResolvedValue([
      {
        gid: 'g1',
        status: 'active',
        totalLength: '100',
        completedLength: '50',
        downloadSpeed: '10',
        uploadSpeed: '5',
        files: [],
      },
    ]),
    tellWaiting: vi.fn().mockResolvedValue([
      {
        gid: 'g2',
        status: 'waiting',
        totalLength: '200',
        completedLength: '0',
        downloadSpeed: '0',
        uploadSpeed: '0',
        files: [],
      },
    ]),
    tellStopped: vi.fn().mockResolvedValue([
      {
        gid: 'g3',
        status: 'complete',
        totalLength: '300',
        completedLength: '300',
        downloadSpeed: '0',
        uploadSpeed: '0',
        files: [],
      },
    ]),
    pause: vi.fn().mockResolvedValue('g1'),
    unpause: vi.fn().mockResolvedValue('g1'),
    remove: vi.fn().mockResolvedValue('g1'),
    getGlobalStat: vi.fn().mockResolvedValue({
      downloadSpeed: '1000',
      uploadSpeed: '100',
      numActive: '1',
      numWaiting: '1',
      numStopped: '1',
    }),
    changeGlobalOption: vi.fn(),
    setGlobalSpeedLimit: vi.fn(),
    mapToTask: vi.fn().mockReturnValue({
      id: 'mock-task',
      source_query: '',
      uri: '',
      status: 'downloading',
      priority: 3,
      progress: 50,
      speed: { down: 100, up: 10 },
      files: [],
      created_at: new Date(),
      retry_count: 0,
    } as Task),
    ...overrides,
  } as unknown as Aria2Client
}

describe('QueueManager', () => {
  let aria2: Aria2Client

  beforeEach(() => {
    aria2 = mockAria2()
  })

  describe('add', () => {
    it('adds a URI and returns a Task', async () => {
      const mgr = new QueueManager(aria2)
      const task = await mgr.add('magnet:?xt=test', 'search query')
      expect(aria2.addUri).toHaveBeenCalledWith('magnet:?xt=test', undefined)
      expect(task).toBeDefined()
      expect(task.id).toBe('mock-task')
    })

    it('passes options through to aria2', async () => {
      const mgr = new QueueManager(aria2)
      await mgr.add('http://example.com', 'query', { dir: '/downloads' })
      expect(aria2.addUri).toHaveBeenCalledWith('http://example.com', { dir: '/downloads' })
    })
  })

  describe('pause', () => {
    it('delegates to aria2.pause', async () => {
      const mgr = new QueueManager(aria2)
      await mgr.pause('gid-1')
      expect(aria2.pause).toHaveBeenCalledWith('gid-1')
    })
  })

  describe('resume', () => {
    it('delegates to aria2.unpause', async () => {
      const mgr = new QueueManager(aria2)
      await mgr.resume('gid-1')
      expect(aria2.unpause).toHaveBeenCalledWith('gid-1')
    })
  })

  describe('remove', () => {
    it('delegates to aria2.remove', async () => {
      const mgr = new QueueManager(aria2)
      await mgr.remove('gid-1')
      expect(aria2.remove).toHaveBeenCalledWith('gid-1')
    })
  })

  describe('listAll', () => {
    it('combines active, waiting, and stopped tasks', async () => {
      const mgr = new QueueManager(aria2)
      const tasks = await mgr.listAll()
      expect(tasks.length).toBe(3) // 1 active + 1 waiting + 1 stopped
    })

    it('calls all three tell methods', async () => {
      const mgr = new QueueManager(aria2)
      await mgr.listAll()
      expect(aria2.tellActive).toHaveBeenCalled()
      expect(aria2.tellWaiting).toHaveBeenCalled()
      expect(aria2.tellStopped).toHaveBeenCalled()
    })
  })

  describe('getStatus', () => {
    it('returns a mapped task', async () => {
      const mgr = new QueueManager(aria2)
      const task = await mgr.getStatus('gid-1')
      expect(task.id).toBe('mock-task')
    })
  })

  describe('getStats', () => {
    it('returns global stats from aria2', async () => {
      const mgr = new QueueManager(aria2)
      const stats = await mgr.getStats()
      expect(stats.numActive).toBe('1')
      expect(stats.numWaiting).toBe('1')
      expect(stats.numStopped).toBe('1')
    })
  })
})
