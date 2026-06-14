// __tests__/subtitle-subhd.test.ts — Tests for SubhdSource
//
// Exercises parseSubhdHtml() and SubhdSource.search() with mocked fetch.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseSubhdHtml, SubhdSource } from '../subtitle/subhd.js'

describe('parseSubhdHtml', () => {
  const sampleHtml = `
    <html>
      <body>
        <a href="/detail/12345" class="link">Movie Title 2023 中文字幕</a>
        <a href="/detail/67890" class="link">Another Show English Subtitle</a>
        <a href="/about">关于</a>
        <a href="/detail/11111" class="link">Third Result 简体</a>
      </body>
    </html>
  `

  it('extracts detail links', () => {
    const results = parseSubhdHtml(sampleHtml, 'https://subhd.tv')
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('builds download URLs from detail paths', () => {
    const results = parseSubhdHtml(sampleHtml, 'https://subhd.tv')
    for (const r of results) {
      expect(r.downloadUrl).toContain('/detail/')
    }
  })

  it('sets source to "subhd"', () => {
    const results = parseSubhdHtml(sampleHtml, 'https://subhd.tv')
    expect(results[0].source).toBe('subhd')
  })

  it('skips navigation links', () => {
    const results = parseSubhdHtml(sampleHtml, 'https://subhd.tv')
    expect(results.find((r) => r.filename.includes('关于'))).toBeUndefined()
  })

  it('detects Chinese simplified language', () => {
    const results = parseSubhdHtml(sampleHtml, 'https://subhd.tv')
    const cn = results.find((r) => r.filename.includes('简体'))
    if (cn) {
      expect(cn.language).toBe('zh-Hans')
    }
  })

  it('detects English language', () => {
    const results = parseSubhdHtml(sampleHtml, 'https://subhd.tv')
    const en = results.find((r) => r.filename.includes('English'))
    if (en) {
      expect(en.language).toBe('en')
    }
  })

  it('defaults to zh-Hans for unknown language text', () => {
    const html = `<a href="/detail/99" class="link">Some Random Title</a>`
    const results = parseSubhdHtml(html, 'https://subhd.tv')
    expect(results[0].language).toBe('zh-Hans')
  })

  it('returns empty array for empty HTML', () => {
    expect(parseSubhdHtml('', 'https://subhd.tv')).toEqual([])
  })

  it('skips titles shorter than 2 chars', () => {
    const html = `<a href="/detail/1" class="link">A</a>`
    expect(parseSubhdHtml(html, 'https://subhd.tv')).toEqual([])
  })

  it('decodes HTML entities in titles', () => {
    const html = `<a href="/detail/1" class="link">Test &amp; Demo Movie</a>`
    const results = parseSubhdHtml(html, 'https://subhd.tv')
    expect(results[0].filename).toContain('&')
  })
})

describe('SubhdSource', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has name "subhd"', () => {
    const source = new SubhdSource()
    expect(source.name).toBe('subhd')
  })

  it('returns empty array on network error', async () => {
    fetchSpy.mockRejectedValue(new Error('network'))
    const source = new SubhdSource()
    const results = await source.search('Movie')
    expect(results).toEqual([])
  })

  it('returns empty array on non-OK response', async () => {
    fetchSpy.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)
    const source = new SubhdSource()
    const results = await source.search('Movie')
    expect(results).toEqual([])
  })

  it('parses results from successful response', async () => {
    const html = `
      <a href="/detail/123" class="link">Test Movie Subtitle</a>
    `
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    } as unknown as Response)
    const source = new SubhdSource()
    const results = await source.search('Test Movie')
    expect(results.length).toBeGreaterThanOrEqual(1)
    expect(results[0].source).toBe('subhd')
  })

  it('includes year in search query', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '',
    } as unknown as Response)
    const source = new SubhdSource()
    await source.search('Movie', 2023)
    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('2023')
  })

  it('filters results by language when specified', async () => {
    const html = `
      <a href="/detail/1" class="link">Result One 简体</a>
      <a href="/detail/2" class="link">Result Two English</a>
    `
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => html,
    } as unknown as Response)
    const source = new SubhdSource()
    const results = await source.search('Movie', undefined, 'zh-Hans')
    // All returned results should be zh-Hans
    for (const r of results) {
      expect(r.language.startsWith('zh')).toBe(true)
    }
  })
})
