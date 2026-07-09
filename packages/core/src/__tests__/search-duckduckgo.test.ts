// __tests__/search-duckduckgo.test.ts — Tests for DuckDuckGoSearchProvider
//
// Exercises parseDuckDuckGoHtml() with HTML fixtures covering:
//   - empty input / no-magnet HTML
//   - magnet extraction with dn= parameter
//   - magnet deduplication by info-hash
//   - snippet-based size/seeder extraction
//   - HTML entity decoding in titles
//   - quality detection (4K / 1080p / 720p)
// And DuckDuckGoSearchProvider.search() with mocked fetch:
//   - empty keywords
//   - HTTP error / network failure
//   - successful HTML retrieval

import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseDuckDuckGoHtml, DuckDuckGoSearchProvider } from '../search/duckduckgo.js'
import type { DownloadIntent } from '../types.js'

const SAMPLE_HASH = '0123456789abcdef0123456789abcdef01234567'
const ANOTHER_HASH = 'fedcba9876543210fedcba9876543210fedcba98'

function makeIntent(resourceType: DownloadIntent['resource_type'] = 'movie'): DownloadIntent {
  return {
    title: 'test',
    quality: 'other',
    need_subtitle: false,
    search_keywords: ['test'],
    resource_type: resourceType,
    raw_input: 'test',
  }
}

describe('parseDuckDuckGoHtml', () => {
  it('returns empty array for empty input', () => {
    expect(parseDuckDuckGoHtml('')).toEqual([])
  })

  it('returns empty array for HTML without magnet links', () => {
    const html = '<html><body>no torrents here</body></html>'
    expect(parseDuckDuckGoHtml(html)).toEqual([])
  })

  it('extracts a single magnet and uses dn= parameter as title', () => {
    const html = `magnet:?xt=urn:btih:${SAMPLE_HASH}&dn=Test.Movie.2020.1080p`
    const results = parseDuckDuckGoHtml(html)
    expect(results).toHaveLength(1)
    expect(results[0].magnet).toContain(`btih:${SAMPLE_HASH}`)
    expect(results[0].title).toBe('Test.Movie.2020.1080p')
    expect(results[0].quality).toBe('1080p')
    expect(results[0].source).toBe('duckduckgo')
  })

  it('deduplicates magnets by info-hash (case-insensitive)', () => {
    const html = `
      magnet:?xt=urn:btih:${SAMPLE_HASH}&dn=First
      magnet:?xt=urn:btih:${SAMPLE_HASH}&dn=Second
      magnet:?xt=urn:btih:${ANOTHER_HASH}&dn=Unique
    `
    const results = parseDuckDuckGoHtml(html)
    expect(results).toHaveLength(2)
    expect(results[0].title).toBe('First')
    expect(results[1].title).toBe('Unique')
  })

  it('extracts size and seeders from associated snippet', () => {
    const html = `
      <a class="result__a">Movie</a>
      <a class="result__snippet">Size: 1.5 GB Seeders: 50 peers</a>
      magnet:?xt=urn:btih:${SAMPLE_HASH}&dn=Movie
    `
    const results = parseDuckDuckGoHtml(html)
    expect(results).toHaveLength(1)
    expect(results[0].size).toBe(Math.floor(1.5 * 1024 ** 3))
    expect(results[0].seeders).toBe(50)
  })

  it('detects quality 4K from title', () => {
    const html = `magnet:?xt=urn:btih:${SAMPLE_HASH}&dn=Movie.4K.BluRay`
    expect(parseDuckDuckGoHtml(html)[0].quality).toBe('4K')
  })

  it('detects quality 720p from title', () => {
    const html = `magnet:?xt=urn:btih:${SAMPLE_HASH}&dn=Movie.720p.WEB-DL`
    expect(parseDuckDuckGoHtml(html)[0].quality).toBe('720p')
  })

  it('returns undefined quality when no marker is present', () => {
    const html = `magnet:?xt=urn:btih:${SAMPLE_HASH}&dn=Movie.DVDRip`
    expect(parseDuckDuckGoHtml(html)[0].quality).toBeUndefined()
  })

  it('decodes HTML entities in result__a titles', () => {
    const html = `
      <a class="result__a">Test &amp; Movie 2020</a>
      magnet:?xt=urn:btih:${SAMPLE_HASH}
    `
    const results = parseDuckDuckGoHtml(html)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Test & Movie 2020')
  })

  it('falls back to result__a title when magnet has no dn=', () => {
    const html = `
      <a class="result__a">Inception 2010 1080p</a>
      magnet:?xt=urn:btih:${SAMPLE_HASH}
    `
    const results = parseDuckDuckGoHtml(html)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Inception 2010 1080p')
  })

  it('skips magnets that have no title source at all', () => {
    const html = `magnet:?xt=urn:btih:${SAMPLE_HASH}`
    expect(parseDuckDuckGoHtml(html)).toEqual([])
  })

  it('handles 32-char base32 info-hash magnets', () => {
    const base32Hash = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    const html = `magnet:?xt=urn:btih:${base32Hash}&dn=Base32.Movie`
    const results = parseDuckDuckGoHtml(html)
    expect(results).toHaveLength(1)
    expect(results[0].magnet).toContain(base32Hash)
  })
})

describe('DuckDuckGoSearchProvider', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('returns empty array for empty keywords', async () => {
    const provider = new DuckDuckGoSearchProvider()
    const results = await provider.search([], makeIntent())
    expect(results).toEqual([])
  })

  it('returns empty array when fetch throws', async () => {
    globalThis.fetch = vi.fn(() => Promise.reject(new Error('network down')))
    const provider = new DuckDuckGoSearchProvider()
    const results = await provider.search(['test'], makeIntent())
    expect(results).toEqual([])
  })

  it('returns empty array on non-2xx HTTP status', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403 }) as Response)
    const provider = new DuckDuckGoSearchProvider()
    const results = await provider.search(['test'], makeIntent())
    expect(results).toEqual([])
  })

  it('parses HTML returned by a successful fetch', async () => {
    const magnetHtml = `magnet:?xt=urn:btih:${SAMPLE_HASH}&dn=Fetched.Movie.1080p`
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, text: async () => magnetHtml }) as Response)
    const provider = new DuckDuckGoSearchProvider()
    const results = await provider.search(['fetched'], makeIntent())
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('Fetched.Movie.1080p')
    expect(results[0].quality).toBe('1080p')
  })

  it('appends resource-type-specific search modifiers to the query', async () => {
    let capturedUrl = ''
    globalThis.fetch = vi.fn(async (input: string | URL) => {
      capturedUrl = input.toString()
      return { ok: true, status: 200, text: async () => '' } as Response
    })

    const provider = new DuckDuckGoSearchProvider()
    await provider.search(['inception'], makeIntent('movie'))
    expect(capturedUrl).toContain('inception')
    expect(capturedUrl).toContain('torrent%20magnet')

    await provider.search(['eclipse'], makeIntent('software'))
    expect(capturedUrl).toContain('torrent%20download')

    await provider.search(['album'], makeIntent('music'))
    expect(capturedUrl).toContain('torrent%20FLAC')
  })
})
