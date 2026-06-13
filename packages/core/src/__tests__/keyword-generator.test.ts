// __tests__/keyword-generator.test.ts — Tests for KeywordGenerator
//
// Exercises keyword expansion for each resource type (movie, software, etc.),
// deduplication, and edge cases such as empty titles.

import { describe, it, expect } from 'vitest'
import { KeywordGenerator } from '../ai/keyword-generator.js'
import type { DownloadIntent } from '../types.js'

describe('KeywordGenerator', () => {
  const gen = new KeywordGenerator()

  it('generates movie keywords with title and quality', () => {
    const intent: DownloadIntent = {
      title: '流浪地球2',
      year: 2023,
      quality: '4K',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'movie',
    }
    const keywords = gen.generate(intent)
    expect(keywords.length).toBeGreaterThan(0)
    expect(keywords.some((k) => k.includes('流浪地球2'))).toBe(true)
    // Quality expansion adds quality-synonym variants
    expect(keywords.some((k) => k.includes('4K'))).toBe(true)
  })

  it('generates software keywords with download modifier', () => {
    const intent: DownloadIntent = {
      title: 'VS Code',
      quality: 'other',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'software',
    }
    const keywords = gen.generate(intent)
    expect(keywords.some((k) => k.includes('download'))).toBe(true)
    expect(keywords.some((k) => k.includes('VS Code 下载'))).toBe(true)
  })

  it('deduplicates keywords', () => {
    const intent: DownloadIntent = {
      title: 'Test',
      quality: 'other',
      need_subtitle: false,
      search_keywords: ['Test'],
      resource_type: 'other',
    }
    const keywords = gen.generate(intent)
    const unique = new Set(keywords)
    expect(keywords.length).toBe(unique.size)
  })

  it('returns empty array for empty title', () => {
    const intent: DownloadIntent = {
      title: '',
      quality: 'other',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'other',
    }
    const keywords = gen.generate(intent)
    expect(keywords.length).toBe(0)
  })

  it('returns empty array for whitespace-only title', () => {
    const intent: DownloadIntent = {
      title: '   ',
      quality: 'other',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'other',
    }
    expect(gen.generate(intent)).toEqual([])
  })

  it('includes keywords from intent.search_keywords', () => {
    const intent: DownloadIntent = {
      title: 'Movie',
      need_subtitle: false,
      search_keywords: ['custom keyword'],
      resource_type: 'movie',
    }
    const keywords = gen.generate(intent)
    expect(keywords).toContain('custom keyword')
  })

  it('generates TV-specific keywords', () => {
    const intent: DownloadIntent = {
      title: 'Breaking Bad',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'tv',
    }
    const keywords = gen.generate(intent)
    expect(keywords.some((k) => k.includes('tv'))).toBe(true)
    expect(keywords.some((k) => k.includes('season'))).toBe(true)
  })

  it('generates anime-specific keywords', () => {
    const intent: DownloadIntent = {
      title: '鬼滅の刃',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'anime',
    }
    const keywords = gen.generate(intent)
    expect(keywords.some((k) => k.includes('anime'))).toBe(true)
    expect(keywords.some((k) => k.includes('动漫'))).toBe(true)
  })

  it('generates music-specific keywords', () => {
    const intent: DownloadIntent = {
      title: 'Random Album',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'music',
    }
    const keywords = gen.generate(intent)
    expect(keywords.some((k) => k.includes('album'))).toBe(true)
    expect(keywords.some((k) => k.includes('FLAC'))).toBe(true)
  })
})
