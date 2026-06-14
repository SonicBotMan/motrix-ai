// __tests__/subtitle-shooter.test.ts — Tests for ShooterSource
//
// Exercises the shooter.cn subtitle provider with mocked fetch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ShooterSource } from '../subtitle/shooter.js'

describe('ShooterSource', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has name "shooter"', () => {
    const source = new ShooterSource()
    expect(source.name).toBe('shooter')
  })

  it('returns empty array when API returns non-OK status', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 403,
    } as Response)
    const source = new ShooterSource()
    const results = await source.search('Test Movie')
    expect(results).toEqual([])
  })

  it('returns empty array when API returns non-array JSON', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: 'not found' }),
    } as unknown as Response)
    const source = new ShooterSource()
    const results = await source.search('Test Movie')
    expect(results).toEqual([])
  })

  it('returns empty array on network error', async () => {
    fetchSpy.mockRejectedValue(new Error('network'))
    const source = new ShooterSource()
    const results = await source.search('Test Movie')
    expect(results).toEqual([])
  })

  it('parses API response with files', async () => {
    const apiResponse = [
      {
        Desc: 'Chinese subtitle',
        Files: [
          {
            f: 'movie.chs.srt',
            d: ['0', 'base64content'],
          },
        ],
      },
    ]
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiResponse,
    } as unknown as Response)
    const source = new ShooterSource()
    const results = await source.search('Test Movie')
    expect(results.length).toBe(1)
    expect(results[0].filename).toBe('movie.chs.srt')
    expect(results[0].source).toBe('shooter')
    expect(results[0].downloadUrl).toContain('data:')
  })

  it('skips items without files', async () => {
    const apiResponse = [
      { Desc: 'empty' },
      {
        Desc: 'has files',
        Files: [{ f: 'sub.srt', d: ['0', 'content'] }],
      },
    ]
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiResponse,
    } as unknown as Response)
    const source = new ShooterSource()
    const results = await source.search('Test')
    expect(results.length).toBe(1)
  })

  it('skips files without name', async () => {
    const apiResponse = [
      {
        Desc: 'has files',
        Files: [{ f: '', d: ['0', 'content'] }],
      },
    ]
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => apiResponse,
    } as unknown as Response)
    const source = new ShooterSource()
    const results = await source.search('Test')
    expect(results).toEqual([])
  })

  it('includes year in query when provided', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as unknown as Response)
    const source = new ShooterSource()
    await source.search('Movie', 2023)
    const body = fetchSpy.mock.calls[0][1]?.body as string
    expect(body).toContain('2023')
  })

  it('uses provided language', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    } as unknown as Response)
    const source = new ShooterSource()
    await source.search('Movie', undefined, 'eng')
    const body = fetchSpy.mock.calls[0][1]?.body as string
    expect(body).toContain('eng')
  })
})
