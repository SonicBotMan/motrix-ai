// __tests__/intent-parser.test.ts — Tests for IntentParser heuristic fallback
//
// Since no OpenCode server is available during tests, parse() always falls
// back to the built-in parseHeuristic() logic. These tests exercise the
// heuristic path: prefix stripping, noise-word removal, quality / subtitle /
// resource-type detection, and year extraction.

import { describe, it, expect } from 'vitest'
import { IntentParser } from '../ai/intent-parser.js'

describe('IntentParser', () => {
  const parser = new IntentParser()

  describe('parseHeuristic (via parse fallback)', () => {
    it('parses movie-like input with quality and subtitle flags', async () => {
      const result = await parser.parse('下流浪地球 2 4K 字幕版')
      expect(result.title).toContain('流浪地球')
      expect(result.quality).toBe('4K')
      expect(result.need_subtitle).toBe(true)
      // No explicit movie keyword or video extension → heuristic classifies as "other"
      expect(result.resource_type).toBe('other')
    })

    it('cleans noise words from the title', async () => {
      const result = await parser.parse('下载最新版VS Code免费版')
      expect(result.title).toContain('VS Code')
      expect(result.title).not.toContain('最新')
      expect(result.title).not.toContain('免费')
    })

    it('detects software type as other without explicit keywords', async () => {
      const result = await parser.parse('下载 Photoshop')
      // No .exe/.dmg extension or "软件"/"software" keyword → "other"
      expect(result.resource_type).toBe('other')
    })

    it('extracts a four-digit year', async () => {
      const result = await parser.parse('流浪地球 2023')
      expect(result.year).toBe(2023)
    })

    it('detects 1080p quality', async () => {
      const result = await parser.parse('电影 1080p')
      expect(result.quality).toBe('1080p')
    })

    it('classifies input containing 电影 as movie', async () => {
      const result = await parser.parse('电影 1080p')
      expect(result.resource_type).toBe('movie')
    })

    it('handles empty input gracefully', async () => {
      const result = await parser.parse('')
      expect(result.title).toBeDefined()
      expect(result.search_keywords).toBeDefined()
    })

    it('detects 720p quality', async () => {
      const result = await parser.parse('some video 720p')
      expect(result.quality).toBe('720p')
    })

    it('detects 4K / UHD / 2160p quality synonyms', async () => {
      expect((await parser.parse('video 2160p')).quality).toBe('4K')
      expect((await parser.parse('video UHD')).quality).toBe('4K')
    })

    it('detects anime resource type', async () => {
      const result = await parser.parse('下载动漫 进击的巨人')
      expect(result.resource_type).toBe('anime')
    })

    it('detects tv resource type', async () => {
      const result = await parser.parse('下载剧 绝命毒师')
      expect(result.resource_type).toBe('tv')
    })

    it('detects software resource type via extension', async () => {
      const result = await parser.parse('download app.exe')
      expect(result.resource_type).toBe('software')
    })

    it('generates search keywords array', async () => {
      const result = await parser.parse('电影 1080p')
      expect(Array.isArray(result.search_keywords)).toBe(true)
      expect(result.search_keywords.length).toBeGreaterThan(0)
    })
  })
})
