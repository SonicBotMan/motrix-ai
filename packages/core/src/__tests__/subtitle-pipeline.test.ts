// __tests__/subtitle-pipeline.test.ts — Integration test for subtitle search and download
//
// Exercises SubtitleFinder with mock sources: language preference ordering,
// source fallback, multi-source search, and error handling.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SubtitleFinder, type SubtitleSource, type SubtitleResult } from '../subtitle/finder.js'

/**
 * Create a mock subtitle source with configurable results and errors.
 */
function mockSource(
  name: string,
  results: SubtitleResult[] = [],
  shouldFail = false,
): SubtitleSource {
  return {
    name,
    search: shouldFail
      ? vi.fn().mockRejectedValue(new Error(`${name} error`))
      : vi.fn().mockResolvedValue(results),
  }
}

describe('subtitle pipeline — search and download', () => {
  let finder: SubtitleFinder

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns first result from preferred language', async () => {
    const zhResult: SubtitleResult = {
      language: 'zh-Hans',
      filename: 'movie.zh-Hans.srt',
      downloadUrl: 'https://sub.example.com/zh',
      source: 'shooter',
    }

    const sources = [
      mockSource('shooter', [zhResult]),
    ]
    finder = new SubtitleFinder(sources)

    const result = await finder.findBest('Inception.2010.1080p.mkv', ['zh-Hans', 'en'])

    expect(result).not.toBeNull()
    expect(result!.language).toBe('zh-Hans')
    expect(result!.source).toBe('shooter')
  })

  it('falls back to next language when first has no results', async () => {
    const enResult: SubtitleResult = {
      language: 'en',
      filename: 'movie.en.srt',
      downloadUrl: 'https://sub.example.com/en',
      source: 'subhd',
    }

    const sources = [
      mockSource('shooter', []), // no zh results
      mockSource('subhd', [enResult]), // has en results
    ]
    finder = new SubtitleFinder(sources)

    const result = await finder.findBest('Inception.2010.mkv', ['zh-Hans', 'en'])

    expect(result).not.toBeNull()
    expect(result!.language).toBe('en')
  })

  it('returns null when all sources return empty', async () => {
    const sources = [
      mockSource('shooter', []),
      mockSource('subhd', []),
    ]
    finder = new SubtitleFinder(sources)

    const result = await finder.findBest('Unknown.Movie.mkv', ['zh-Hans', 'en'])

    expect(result).toBeNull()
  })

  it('continues to next source when one fails', async () => {
    const goodResult: SubtitleResult = {
      language: 'en',
      filename: 'recover.en.srt',
      downloadUrl: 'https://sub.example.com/recover',
      source: 'subhd',
    }

    const sources = [
      mockSource('shooter', [], true), // throws error
      mockSource('subhd', [goodResult]), // succeeds
    ]
    finder = new SubtitleFinder(sources)

    const result = await finder.findBest('Movie.mkv', ['en'])

    expect(result).not.toBeNull()
    expect(result!.source).toBe('subhd')
  })

  it('extracts title from filename before searching', async () => {
    const mockSearchFn = vi.fn().mockResolvedValue([])
    const sources: SubtitleSource[] = [{ name: 'test', search: mockSearchFn }]
    finder = new SubtitleFinder(sources)

    await finder.findBest('The.Dark.Knight.2008.1080p.BluRay.mkv', ['en'])

    expect(mockSearchFn).toHaveBeenCalled()
    const title = mockSearchFn.mock.calls[0][0] as string
    expect(title).not.toContain('.mkv')
  })
})
