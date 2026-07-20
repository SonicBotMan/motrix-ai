// __tests__/subtitle-finder.test.ts — Tests for SubtitleFinder
//
// Uses mock SubtitleSource objects to verify multi-source, multi-language
// subtitle search, error tolerance, and filename parsing.

import { describe, it, expect } from 'vitest'
import { SubtitleFinder, type SubtitleSource } from '../subtitle/finder.js'

function mockSource(name: string, results: ReturnType<typeof makeResult>[]): SubtitleSource {
  return {
    name,
    search: async () => results,
  }
}

function makeResult(language: string, filename: string, source: string) {
  return { language, filename, downloadUrl: `https://example.com/${filename}`, source }
}

describe('SubtitleFinder', () => {
  it('returns the first result from the first matching source', async () => {
    const source = mockSource('mock', [makeResult('zh-Hans', 'movie.zh.srt', 'mock')])
    const finder = new SubtitleFinder([source])
    const result = await finder.findBest('Movie.2023.1080p.mkv')
    expect(result).not.toBeNull()
    expect(result!.language).toBe('zh-Hans')
    expect(result!.source).toBe('mock')
  })

  it('tries next source when first returns empty', async () => {
    const emptySource = mockSource('empty', [])
    const goodSource = mockSource('good', [makeResult('en', 'movie.en.srt', 'good')])
    const finder = new SubtitleFinder([emptySource, goodSource])
    const result = await finder.findBest('Movie.mkv')
    expect(result).not.toBeNull()
    expect(result!.source).toBe('good')
  })

  it('returns null when no source has results', async () => {
    const source = mockSource('empty', [])
    const finder = new SubtitleFinder([source])
    const result = await finder.findBest('UnknownMovie.mkv')
    expect(result).toBeNull()
  })

  it('tolerates source errors', async () => {
    const errorSource: SubtitleSource = {
      name: 'error',
      search: async () => {
        throw new Error('network error')
      },
    }
    const goodSource = mockSource('good', [makeResult('zh-Hans', 'sub.srt', 'good')])
    const finder = new SubtitleFinder([errorSource, goodSource])
    const result = await finder.findBest('Movie.mkv')
    expect(result).not.toBeNull()
    expect(result!.source).toBe('good')
  })

  it('respects preferred language order', async () => {
    const source: SubtitleSource = {
      name: 'lang-source',
      search: async (_title, _year, language) => {
        if (language === 'zh-Hans') return []
        return [makeResult('en', 'movie.en.srt', 'lang-source')]
      },
    }
    const finder = new SubtitleFinder([source])
    const result = await finder.findBest('Movie.mkv', ['zh-Hans', 'en'])
    expect(result).not.toBeNull()
    expect(result!.language).toBe('en')
  })

  it('returns null when all sources and languages are exhausted', async () => {
    const source = mockSource('empty', [])
    const finder = new SubtitleFinder([source])
    const result = await finder.findBest('Unknown.mkv', ['zh-Hans', 'en', 'ja'])
    expect(result).toBeNull()
  })
})
