// __tests__/search-mikan.test.ts — Tests for MikanSearchProvider
//
// Exercises parseMikanRss() with RSS XML fixtures and parseAnimeTitle()
// for metadata extraction.

import { describe, it, expect } from 'vitest'
import { parseMikanRss, parseAnimeTitle, MikanSearchProvider } from '../search/mikan.js'

describe('parseMikanRss', () => {
  const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss>
      <channel>
        <item>
          <title><![CDATA[[ANi] Frieren - 01 [1080p][BDRip].mkv]]></title>
          <link><![CDATA[magnet:?xt=urn:btih:frieren123&dn=test]]></link>
          <enclosure url="https://mikanani.me/download/123.torrent" length="800000000" type="application/x-bittorrent" />
        </item>
        <item>
          <title><![CDATA[[SubGroup] Another Anime - 05 [720p].mkv]]></title>
          <link><![CDATA[magnet:?xt=urn:btih:another456&dn=another]]></link>
          <enclosure length="500000000" type="application/x-bittorrent" />
        </item>
        <item>
          <title>No Magnet Item</title>
          <description>nothing useful</description>
        </item>
      </channel>
    </rss>`

  it('parses multiple items', () => {
    const results = parseMikanRss(sampleXml)
    expect(results.length).toBe(2)
  })

  it('extracts titles', () => {
    const results = parseMikanRss(sampleXml)
    expect(results[0].title).toContain('Frieren')
  })

  it('extracts magnet links from link element', () => {
    const results = parseMikanRss(sampleXml)
    expect(results[0].magnet).toContain('magnet:?xt=urn:btih:')
  })

  it('extracts size from enclosure length', () => {
    const results = parseMikanRss(sampleXml)
    expect(results[0].size).toBe(800000000)
  })

  it('sets source to "mikan"', () => {
    const results = parseMikanRss(sampleXml)
    expect(results[0].source).toBe('mikan')
  })

  it('detects 1080p quality', () => {
    const results = parseMikanRss(sampleXml)
    expect(results[0].quality).toBe('1080p')
  })

  it('detects 720p quality', () => {
    const results = parseMikanRss(sampleXml)
    expect(results[1].quality).toBe('720p')
  })

  it('skips items without magnet or torrent links', () => {
    const results = parseMikanRss(sampleXml)
    expect(results.find((r) => r.title === 'No Magnet Item')).toBeUndefined()
  })

  it('returns empty array for empty XML', () => {
    expect(parseMikanRss('')).toEqual([])
  })

  it('handles plain title tags (non-CDATA)', () => {
    const xml = `<rss><channel>
      <item>
        <title>Plain Title 1080p</title>
        <link>magnet:?xt=urn:btih:plain123</link>
      </item>
    </channel></rss>`
    const results = parseMikanRss(xml)
    expect(results.length).toBe(1)
    expect(results[0].title).toBe('Plain Title 1080p')
  })

  it('decodes HTML entities in titles', () => {
    const xml = `<rss><channel>
      <item>
        <title>Test &amp; Demo</title>
        <link>magnet:?xt=urn:btih:ent123</link>
      </item>
    </channel></rss>`
    const results = parseMikanRss(xml)
    expect(results[0].title).toBe('Test & Demo')
  })

  it('handles fallback to enclosure torrent URL', () => {
    const xml = `<rss><channel>
      <item>
        <title>Torrent File Item</title>
        <enclosure url="https://mikanani.me/download/999.torrent" length="100" type="application/x-bittorrent" />
      </item>
    </channel></rss>`
    const results = parseMikanRss(xml)
    expect(results.length).toBe(1)
    expect(results[0].magnet).toContain('.torrent')
  })
})

describe('parseAnimeTitle', () => {
  it('extracts subgroup from brackets', () => {
    const meta = parseAnimeTitle('[ANi] Frieren - 01 [1080p].mkv')
    expect(meta.subgroup).toBe('ANi')
  })

  it('extracts quality', () => {
    const meta = parseAnimeTitle('[ANi] Frieren - 01 [1080p].mkv')
    expect(meta.quality).toBe('1080p')
  })

  it('extracts 720p quality', () => {
    const meta = parseAnimeTitle('Some Anime [720p].mkv')
    expect(meta.quality).toBe('720p')
  })

  it('extracts 4K quality', () => {
    const meta = parseAnimeTitle('Some Anime 4K.mkv')
    expect(meta.quality).toBe('4K')
  })

  it('extracts episode number with EP prefix', () => {
    const meta = parseAnimeTitle('Frieren EP 01 [1080p].mkv')
    expect(meta.episode).toBe('01')
  })

  it('extracts episode number from brackets', () => {
    const meta = parseAnimeTitle('[ANi] Frieren [01] [1080p].mkv')
    expect(meta.episode).toBe('01')
  })

  it('extracts SxxExx episode', () => {
    const meta = parseAnimeTitle('Some Show S01E05.mkv')
    expect(meta.episode).toBe('05')
  })

  it('extracts clean anime title', () => {
    const meta = parseAnimeTitle('[ANi] Frieren - 01 [1080p][BDRip].mkv')
    expect(meta.animeTitle).toBeTruthy()
    expect(meta.animeTitle).toContain('Frieren')
  })
})

describe('MikanSearchProvider', () => {
  const provider = new MikanSearchProvider()

  it('has name "mikan"', () => {
    expect(provider.name).toBe('mikan')
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
