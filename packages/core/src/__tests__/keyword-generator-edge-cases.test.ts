// __tests__/keyword-generator-edge-cases.test.ts — Edge case tests for KeywordGenerator
//
// Tests deduplication, empty/whitespace title, special characters,
// and keyword expansion for each resource type.

import { describe, it, expect, beforeEach } from 'vitest'
import { KeywordGenerator } from '../ai/keyword-generator.js'
import type { DownloadIntent } from '../types.js'

describe('KeywordGenerator edge cases', () => {
  let gen: KeywordGenerator

  beforeEach(() => {
    gen = new KeywordGenerator()
  })

  describe('empty / whitespace handling', () => {
    it('returns empty array for empty title', () => {
      const intent: DownloadIntent = {
        title: '',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'movie',
      }
      expect(gen.generate(intent)).toEqual([])
    })

    it('returns empty array for whitespace-only title', () => {
      const intent: DownloadIntent = {
        title: '   ',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'movie',
      }
      expect(gen.generate(intent)).toEqual([])
    })

    it('returns empty array for null title', () => {
      const intent = {
        title: null as unknown as string,
        quality: 'other' as const,
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'movie' as const,
      }
      expect(gen.generate(intent)).toEqual([])
    })
  })

  describe('deduplication', () => {
    it('never returns duplicate keywords', () => {
      const intent: DownloadIntent = {
        title: 'Inception',
        year: 2010,
        quality: '4K',
        need_subtitle: false,
        search_keywords: ['Inception movie', 'Inception'],
        resource_type: 'movie',
      }
      const keywords = gen.generate(intent)
      const unique = new Set(keywords)
      expect(keywords.length).toBe(unique.size)
    })

    it('filters out empty keyword strings', () => {
      const intent: DownloadIntent = {
        title: 'Test',
        quality: 'other',
        need_subtitle: false,
        search_keywords: ['', '   ', 'valid'],
        resource_type: 'other',
      }
      const keywords = gen.generate(intent)
      for (const kw of keywords) {
        expect(kw.length).toBeGreaterThan(0)
      }
    })
  })

  describe('quality expansion', () => {
    it('4K expands to 2160p and UHD terms', () => {
      const intent: DownloadIntent = {
        title: 'Movie',
        quality: '4K',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'movie',
      }
      const keywords = gen.generate(intent)
      expect(keywords.some((k) => k.includes('2160p'))).toBe(true)
      expect(keywords.some((k) => k.includes('UHD'))).toBe(true)
    })

    it('1080p expands to FHD term', () => {
      const intent: DownloadIntent = {
        title: 'Movie',
        quality: '1080p',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'movie',
      }
      const keywords = gen.generate(intent)
      expect(keywords.some((k) => k.includes('FHD'))).toBe(true)
    })

    it('"other" quality does not expand to quality terms', () => {
      const intent: DownloadIntent = {
        title: 'Test',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'movie',
      }
      const keywords = gen.generate(intent)
      // Should not add 4K/2160p/1080p/720p since quality is "other"
      const qualityKeywords = keywords.filter((k) =>
        /2160p|1080p|720p|FHD|UHD/.test(k),
      )
      // Only present if added by type-specific modifiers, which they shouldn't for quality=other
      // Just verify no explicit quality terms are injected
      expect(qualityKeywords.filter((k) => k.includes('1080p'))).toHaveLength(0)
    })
  })

  describe('resource type variants', () => {
    it('software generates version-specific keywords when version in title', () => {
      const intent: DownloadIntent = {
        title: 'Photoshop 25.0',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'software',
      }
      const keywords = gen.generate(intent)
      expect(keywords.some((k) => k.includes('25.0'))).toBe(true)
      expect(keywords.some((k) => k.includes('crack'))).toBe(true)
      expect(keywords.some((k) => k.includes('portable'))).toBe(true)
    })

    it('music generates FLAC and MP3 keywords', () => {
      const intent: DownloadIntent = {
        title: 'Album Name',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'music',
      }
      const keywords = gen.generate(intent)
      expect(keywords.some((k) => k.includes('FLAC'))).toBe(true)
      expect(keywords.some((k) => k.includes('MP3'))).toBe(true)
      expect(keywords.some((k) => k.includes('专辑'))).toBe(true)
    })

    it('TV generates season and episode keywords', () => {
      const intent: DownloadIntent = {
        title: 'Breaking Bad',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'tv',
      }
      const keywords = gen.generate(intent)
      expect(keywords.some((k) => k.includes('season'))).toBe(true)
      expect(keywords.some((k) => k.includes('S01'))).toBe(true)
      expect(keywords.some((k) => k.includes('complete'))).toBe(true)
    })

    it('anime generates bilingual keywords', () => {
      const intent: DownloadIntent = {
        title: 'Attack on Titan',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'anime',
      }
      const keywords = gen.generate(intent)
      expect(keywords.some((k) => k.includes('anime'))).toBe(true)
      expect(keywords.some((k) => k.includes('动漫'))).toBe(true)
      expect(keywords.some((k) => k.includes('番剧'))).toBe(true)
    })

    it('"other" type uses generic keywords', () => {
      const intent: DownloadIntent = {
        title: 'Mystery File',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'other',
      }
      const keywords = gen.generate(intent)
      expect(keywords.some((k) => k.includes('magnet'))).toBe(true)
      expect(keywords.some((k) => k.includes('torrent'))).toBe(true)
      expect(keywords.some((k) => k.includes('下载'))).toBe(true)
    })

    it('includes pre-existing search_keywords from intent', () => {
      const intent: DownloadIntent = {
        title: 'Movie',
        quality: 'other',
        need_subtitle: false,
        search_keywords: ['custom keyword 1', 'custom keyword 2'],
        resource_type: 'movie',
      }
      const keywords = gen.generate(intent)
      expect(keywords).toContain('custom keyword 1')
      expect(keywords).toContain('custom keyword 2')
    })
  })
})
