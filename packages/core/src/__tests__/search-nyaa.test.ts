// __tests__/search-nyaa.test.ts — Tests for NyaaSearchProvider
//
// Exercises parseNyaaHtml() with HTML table fixtures and
// parseNyaaSize() for various size formats.

import { describe, it, expect } from 'vitest'
import { parseNyaaHtml, parseNyaaSize, NyaaSearchProvider } from '../search/nyaa.js'

describe('parseNyaaSize', () => {
  it('parses GiB correctly', () => {
    expect(parseNyaaSize('1.4 GiB')).toBe(Math.floor(1.4 * 1024 ** 3))
  })

  it('parses MiB correctly', () => {
    expect(parseNyaaSize('500 MiB')).toBe(Math.floor(500 * 1024 ** 2))
  })

  it('parses KiB correctly', () => {
    expect(parseNyaaSize('100 KiB')).toBe(Math.floor(100 * 1024))
  })

  it('parses TiB correctly', () => {
    expect(parseNyaaSize('2 TiB')).toBe(Math.floor(2 * 1024 ** 4))
  })

  it('parses bare bytes', () => {
    expect(parseNyaaSize('1024 B')).toBe(1024)
  })

  it('returns 0 for empty string', () => {
    expect(parseNyaaSize('')).toBe(0)
  })

  it('returns 0 for unparseable input', () => {
    expect(parseNyaaSize('unknown')).toBe(0)
  })
})

describe('parseNyaaHtml', () => {
  const sampleHtml = `
    <table>
      <tbody>
        <tr class="default">
          <td class="category">Anime</td>
          <td><a title="Frieren Beyond Journeys End S01E01 [1080p]" href="/view/123">link</a></td>
          <td><a href="magnet:?xt=urn:btih:frieren1&amp;dn=test">magnet</a></td>
          <td class="text-center">2.4 GiB</td>
          <td class="text-center">150</td>
          <td class="text-center">20</td>
        </tr>
        <tr class="success">
          <td class="category">Anime</td>
          <td><a title="Attack on Titan Final Season [720p]" href="/view/456">link</a></td>
          <td><a href="magnet:?xt=urn:btih:aot1&amp;dn=aot">magnet</a></td>
          <td class="text-center">800 MiB</td>
          <td class="text-center">300</td>
          <td class="text-center">50</td>
        </tr>
        <tr class="danger">
          <td class="category">Anime</td>
          <td><a title="Spy x Family 4K UHD" href="/view/789">link</a></td>
          <td><a href="magnet:?xt=urn:btih:spy1&amp;dn=spy">magnet</a></td>
          <td class="text-center">5.0 GiB</td>
          <td class="text-center">200</td>
          <td class="text-center">30</td>
        </tr>
      </tbody>
    </table>
  `

  it('parses multiple results', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results.length).toBe(3)
  })

  it('extracts titles from title attribute', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results[0].title).toContain('Frieren')
  })

  it('extracts magnet links', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results[0].magnet).toContain('magnet:?xt=urn:btih:')
  })

  it('decodes ampersands in magnet links', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results[0].magnet).not.toContain('&amp;')
  })

  it('extracts seeders', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results[0].seeders).toBe(150)
  })

  it('extracts leechers', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results[0].leechers).toBe(20)
  })

  it('sets source to "nyaa"', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results[0].source).toBe('nyaa')
  })

  it('detects 1080p quality', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results[0].quality).toBe('1080p')
  })

  it('detects 720p quality', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results[1].quality).toBe('720p')
  })

  it('detects 4K quality', () => {
    const results = parseNyaaHtml(sampleHtml)
    expect(results[2].quality).toBe('4K')
  })

  it('returns empty array for empty HTML', () => {
    expect(parseNyaaHtml('')).toEqual([])
  })

  it('returns empty for HTML without result rows', () => {
    expect(parseNyaaHtml('<html><body>nothing</body></html>')).toEqual([])
  })

  it('skips rows without magnet links', () => {
    const html = `
      <tr class="default">
        <td><a title="No Magnet" href="/view/1">link</a></td>
        <td class="text-center">1 GiB</td>
        <td class="text-center">10</td>
        <td class="text-center">5</td>
      </tr>
    `
    expect(parseNyaaHtml(html)).toEqual([])
  })
})

describe('NyaaSearchProvider', () => {
  const provider = new NyaaSearchProvider()

  it('has name "nyaa"', () => {
    expect(provider.name).toBe('nyaa')
  })

  it('returns empty results for empty keywords', async () => {
    const intent = {
      title: 'Test',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'anime' as const,
    }
    const results = await provider.search([], intent)
    expect(results).toEqual([])
  })
})
