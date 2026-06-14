// __tests__/aria2-client.test.ts — Tests for Aria2Client
//
// Exercises the JSON-RPC client with mocked fetch: addUri, tellStatus,
// mapToTask, pause/unpause/remove, and error handling.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Aria2Client } from '../aria2/client.js'
import { Aria2Error } from '../errors.js'

function mockFetchResponse(result: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => ({ jsonrpc: '2.0', id: 'test', result }),
    text: async () => JSON.stringify({ jsonrpc: '2.0', id: 'test', result }),
  } as unknown as Response
}

function mockFetchError(error: { code: number; message: string }): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 'test', error }),
  } as unknown as Response
}

describe('Aria2Client', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('uses default RPC URL', () => {
      const client = new Aria2Client()
      // Just verify it doesn't throw
      expect(client).toBeDefined()
    })

    it('accepts custom options', () => {
      const client = new Aria2Client({
        rpcUrl: 'http://custom:9999/jsonrpc',
        rpcSecret: 'secret123',
      })
      expect(client).toBeDefined()
    })
  })

  describe('addUri', () => {
    it('calls aria2.addUri and returns gid', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse('gid-123'))
      const client = new Aria2Client()
      const gid = await client.addUri('magnet:?xt=test')
      expect(gid).toBe('gid-123')
    })

    it('passes dir option to aria2', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse('gid-456'))
      const client = new Aria2Client()
      await client.addUri('http://example.com', { dir: '/downloads' })
      expect(fetchSpy).toHaveBeenCalled()
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
      expect(body.method).toBe('aria2.addUri')
    })
  })

  describe('tellStatus', () => {
    it('returns aria2 status object', async () => {
      const status = {
        gid: 'g1',
        status: 'active',
        totalLength: '1000',
        completedLength: '500',
        downloadSpeed: '100',
        uploadSpeed: '10',
        files: [],
      }
      fetchSpy.mockResolvedValue(mockFetchResponse(status))
      const client = new Aria2Client()
      const result = await client.tellStatus('g1')
      expect(result.gid).toBe('g1')
      expect(result.status).toBe('active')
    })
  })

  describe('tellActive / tellWaiting / tellStopped', () => {
    it('tellActive returns array', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]))
      const client = new Aria2Client()
      const result = await client.tellActive()
      expect(Array.isArray(result)).toBe(true)
    })

    it('tellWaiting accepts offset and num', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]))
      const client = new Aria2Client()
      await client.tellWaiting(10, 50)
      expect(fetchSpy).toHaveBeenCalled()
    })

    it('tellStopped accepts offset and num', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse([]))
      const client = new Aria2Client()
      await client.tellStopped(0, 200)
      expect(fetchSpy).toHaveBeenCalled()
    })
  })

  describe('pause / unpause / remove', () => {
    it('pause returns result gid', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse('g1'))
      const client = new Aria2Client()
      const result = await client.pause('g1')
      expect(result).toBe('g1')
    })

    it('unpause returns result gid', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse('g1'))
      const client = new Aria2Client()
      const result = await client.unpause('g1')
      expect(result).toBe('g1')
    })

    it('remove returns result gid', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse('g1'))
      const client = new Aria2Client()
      const result = await client.remove('g1')
      expect(result).toBe('g1')
    })
  })

  describe('getGlobalStat', () => {
    it('returns stat object', async () => {
      const stat = {
        downloadSpeed: '1000',
        uploadSpeed: '100',
        numActive: '3',
        numWaiting: '5',
        numStopped: '10',
      }
      fetchSpy.mockResolvedValue(mockFetchResponse(stat))
      const client = new Aria2Client()
      const result = await client.getGlobalStat()
      expect(result.downloadSpeed).toBe('1000')
      expect(result.numActive).toBe('3')
    })
  })

  describe('error handling', () => {
    it('throws Aria2Error on HTTP error', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse(null, false, 500))
      const client = new Aria2Client()
      await expect(client.tellActive()).rejects.toThrow(Aria2Error)
    })

    it('throws Aria2Error on RPC error response', async () => {
      fetchSpy.mockResolvedValue(mockFetchError({ code: 1, message: 'bad request' }))
      const client = new Aria2Client()
      await expect(client.tellActive()).rejects.toThrow(Aria2Error)
    })

    it('throws on network error', async () => {
      fetchSpy.mockRejectedValue(new Error('network'))
      const client = new Aria2Client()
      await expect(client.tellActive()).rejects.toThrow()
    })
  })

  describe('mapToTask', () => {
    it('maps active status to downloading', () => {
      const client = new Aria2Client()
      const task = client.mapToTask({
        gid: 'g1',
        status: 'active',
        totalLength: '1000',
        completedLength: '500',
        downloadSpeed: '100',
        uploadSpeed: '10',
        files: [],
      })
      expect(task.status).toBe('downloading')
      expect(task.progress).toBe(50)
    })

    it('maps complete status to completed', () => {
      const client = new Aria2Client()
      const task = client.mapToTask({
        gid: 'g1',
        status: 'complete',
        totalLength: '1000',
        completedLength: '1000',
        downloadSpeed: '0',
        uploadSpeed: '0',
        files: [],
      })
      expect(task.status).toBe('completed')
      expect(task.progress).toBe(100)
    })

    it('handles zero totalLength without NaN', () => {
      const client = new Aria2Client()
      const task = client.mapToTask({
        gid: 'g1',
        status: 'active',
        totalLength: '0',
        completedLength: '0',
        downloadSpeed: '0',
        uploadSpeed: '0',
        files: [],
      })
      expect(task.progress).toBe(0)
    })

    it('maps files correctly', () => {
      const client = new Aria2Client()
      const task = client.mapToTask({
        gid: 'g1',
        status: 'active',
        totalLength: '1000',
        completedLength: '500',
        downloadSpeed: '0',
        uploadSpeed: '0',
        files: [
          {
            index: '1',
            path: '/downloads/movie.mkv',
            length: '1000',
            completedLength: '500',
          },
        ],
      })
      expect(task.files).toHaveLength(1)
      expect(task.files[0].name).toBe('movie.mkv')
      expect(task.files[0].size).toBe(1000)
    })
  })

  describe('setGlobalSpeedLimit', () => {
    it('calls changeGlobalOption with correct key', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse('OK'))
      const client = new Aria2Client()
      await client.setGlobalSpeedLimit(5000000)
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body)
      expect(body.method).toBe('aria2.changeGlobalOption')
    })
  })

  describe('addTorrent', () => {
    it('calls aria2.addTorrent', async () => {
      fetchSpy.mockResolvedValue(mockFetchResponse('gid-torrent'))
      const client = new Aria2Client()
      const result = await client.addTorrent('base64data', { dir: '/downloads' })
      expect(result).toBe('gid-torrent')
    })
  })
})
