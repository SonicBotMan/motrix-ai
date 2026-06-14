// __tests__/search-btdig.test.ts — Tests for BtdigSearchProvider
//
// Exercises parseBtdigHtml() with various HTML fixtures and
// parseSizeToBytes() with different size formats.

import { describe, it, expect } from 'vitest'
import {
  parseBtdigHtml,
  parseSizeToBytes,
  BtdigSearchProvider,
} from '../search/btdig.js'

describe('parseSizeToBytes', () => {
  it('parses GB correctly', () => {
    expect(parseSizeToBytes('1.5 GB')).toBe(Math.floor(1.5 * 1024 ** 3))
  })

  it('parses MB correctly', () => {
    expect(parseSizeToBytes('500 MB')).toBe(Math.floor(500 * 1024 ** 2))
  })

  it('parses TB correctly', () => {
    expect(parseSizeToBytes('2 TB')).toBe(Math.floor(2 * 1024 ** 4))
  })

  it('parses KB correctly', () => {
    expect(parseSizeToBytes('100 KB')).toBe(Math.floor(100 * 1024))
  })

  it('parses bare bytes', () => {
    expect(parseSizeToBytes('1024 B')).toBe(1024)
  })

  it('returns 0 for empty string', () => {
    expect(parseSizeToBytes('')).toBe(0)
  })

  it('returns 0 for unparseable input', () => {
    expect(parseSizeToBytes('N/A')).toBe(0)
  })

  it('handles lowercase units', () => {
    expect(parseSizeToBytes('1 gb')).toBe(Math.floor(1 * 1024 ** 3))
  })

  it('handles number without unit (defaults to bytes)', () => {
    expect(parseSizeToBytes('42')).toBe(42)
  })
})

describe('parseBtdigHtml', () => {
  const sampleHtml = `
    <div class="one_result">
      <div class="torrent_name"><a href="/detail/abc">Test Movie 2023 1080p</a></div>
      <div><a href="magnet:?xt=urn:btih:abc123&amp;dn=test">Magnet</a></div>
      <span class="torrent_size">2.5 GB</span>
      <span>50 seed</span>
      <span>10 leech</span>
    </div>
    <div class="one_result">
      <div class="torrent_name"><a href="/detail/def">Another Show 720p</a></div>
      <div><a href="magnet:?xt=urn:btih:def456&amp;dn=another">Magnet</a></div>
      <span class="torrent_size">800 MB</span>
      <span>20 seed</span>
      <span>5 leech</span>
    </div>
  `

  it('parses multiple results', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results.length).toBeGreaterThanOrEqual(2)
  })

  it('extracts titles correctly', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results[0].title).toContain('Test Movie')
  })

  it('extracts magnet links', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results[0].magnet).toContain('magnet:?xt=urn:btih:')
  })

  it('decodes HTML entities in magnet links', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results[0].magnet).not.toContain('&amp;')
  })

  it('extracts size in bytes', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results[0].size).toBe(Math.floor(2.5 * 1024 ** 3))
  })

  it('extracts seeders', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results[0].seeders).toBe(50)
  })

  it('extracts leechers', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results[0].leechers).toBe(10)
  })

  it('sets source to "btdig"', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results[0].source).toBe('btdig')
  })

  it('detects 1080p quality', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results[0].quality).toBe('1080p')
  })

  it('detects 720p quality', () => {
    const results = parseBtdigHtml(sampleHtml)
    expect(results[1].quality).toBe('720p')
  })

  it('returns empty array for empty HTML', () => {
    expect(parseBtdigHtml('')).toEqual([])
  })

  it('returns empty array for HTML with no results', () => {
    expect(parseBtdigHtml('<html><body>nothing</body></html>')).toEqual([])
  })

  it('skips results without magnet links', () => {
    const html = `
      <div class="one_result">
        <div class="torrent_name">No Magnet Here</div>
        <span class="torrent_size">1 GB</span>
      </div>
    `
    const results = parseBtdigHtml(html)
    expect(results).toEqual([])
  })
})

describe('BtdigSearchProvider', () => {
  const provider = new BtdigSearchProvider()

  it('has name "btdig"', () => {
    expect(provider.name).toBe('btdig')
  })

  it('returns empty results for empty keywords', async () => {
    const intent = {
      title: 'Test',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'movie' as const,
    }
    const results = await provider.search([], intent)
    expect(results).toEqual([])
  })
})
