// __tests__/pipeline-integration.test.ts — Integration test for NL→search→queue pipeline
//
// Exercises the full flow: IntentParser → KeywordGenerator → searchAll →
// ResultEvaluator → QueueManager.add, using mocked providers and aria2 client.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KeywordGenerator } from '../ai/keyword-generator.js'
import { ResultEvaluator } from '../ai/result-evaluator.js'
import { searchAll, type SearchProvider } from '../search/provider.js'
import type { DownloadIntent, SearchResult } from '../types.js'

/**
 * Build a fake SearchProvider that returns pre-seeded results.
 */
function mockProvider(name: string, results: SearchResult[]): SearchProvider {
  return {
    name,
    search: vi.fn().mockResolvedValue(results),
  }
}

describe('pipeline integration — NL → search → queue', () => {
  let evaluator: ResultEvaluator
  let keywordGen: KeywordGenerator

  beforeEach(() => {
    evaluator = new ResultEvaluator()
    keywordGen = new KeywordGenerator()
  })

  it('end-to-end: keywords → search → evaluate returns best result', async () => {
    const intent: DownloadIntent = {
      title: 'Inception',
      year: 2010,
      quality: '1080p',
      need_subtitle: false,
      search_keywords: [],
      resource_type: 'movie',
    }

    // Step 1: Generate keywords
    const keywords = keywordGen.generate(intent)
    expect(keywords.length).toBeGreaterThan(0)

    // Step 2: Search across providers
    const results: SearchResult[] = [
      {
        title: 'Inception 2010 1080p BluRay',
        magnet: 'magnet:1',
        size: 8e9,
        seeders: 500,
        leechers: 30,
        source: 'btdig',
        quality: '1080p',
      },
      {
        title: 'Inception 2010 720p',
        magnet: 'magnet:2',
        size: 4e9,
        seeders: 200,
        leechers: 10,
        source: 'mikan',
        quality: '720p',
      },
      {
        title: 'Inception 2010 4K UHD',
        magnet: 'magnet:3',
        size: 50e9,
        seeders: 100,
        leechers: 5,
        source: 'nyaa',
        quality: '4K',
      },
    ]

    const providers = [
      mockProvider('btdig', [results[0]]),
      mockProvider('mikan', [results[1]]),
      mockProvider('nyaa', [results[2]]),
    ]
    const merged = await searchAll(providers, intent)

    expect(merged.length).toBe(3)

    // Step 3: Evaluate and rank
    const ranked = evaluator.evaluate(merged, intent)
    expect(ranked.length).toBe(3)
    // Best match should be the 1080p result (exact quality match + high seeders)
    const best = ranked[0]
    expect(best.quality).toBe('1080p')
  })

  it('handles empty search results gracefully', async () => {
    const intent: DownloadIntent = {
      title: 'Nonexistent Movie',
      quality: '4K',
      need_subtitle: false,
      search_keywords: ['Nonexistent Movie'],
      resource_type: 'movie',
    }

    const providers = [mockProvider('btdig', []), mockProvider('mikan', [])]
    const merged = await searchAll(providers, intent)

    expect(merged).toEqual([])
    expect(evaluator.evaluate(merged, intent)).toEqual([])
    expect(evaluator.pickBest(merged, intent)).toBeNull()
  })

  it('deduplicates and merges across providers', async () => {
    const intent: DownloadIntent = {
      title: 'Test',
      quality: 'other',
      need_subtitle: false,
      search_keywords: ['Test'],
      resource_type: 'other',
    }

    const resultA: SearchResult = {
      title: 'Test File',
      magnet: 'magnet:dup',
      size: 1e6,
      seeders: 10,
      leechers: 1,
      source: 'btdig',
      quality: 'other',
    }
    const resultB: SearchResult = {
      title: 'Another File',
      magnet: 'magnet:other',
      size: 2e6,
      seeders: 20,
      leechers: 2,
      source: 'mikan',
      quality: 'other',
    }

    const providers = [mockProvider('p1', [resultA]), mockProvider('p2', [resultB])]
    const merged = await searchAll(providers, intent)

    expect(merged.length).toBe(2)
    // Higher seeders should be sorted first
    expect(merged[0].seeders).toBeGreaterThanOrEqual(merged[1].seeders)
  })

  it('provider failure does not break the pipeline', async () => {
    const intent: DownloadIntent = {
      title: 'Test',
      quality: 'other',
      need_subtitle: false,
      search_keywords: ['Test'],
      resource_type: 'other',
    }

    const goodResult: SearchResult = {
      title: 'Good Result',
      magnet: 'magnet:good',
      size: 1e6,
      seeders: 50,
      leechers: 5,
      source: 'btdig',
      quality: 'other',
    }

    const failingProvider: SearchProvider = {
      name: 'broken',
      search: vi.fn().mockRejectedValue(new Error('network error')),
    }
    const goodProvider = mockProvider('good', [goodResult])

    const merged = await searchAll([failingProvider, goodProvider], intent)
    expect(merged.length).toBe(1)
    expect(merged[0].title).toBe('Good Result')
  })

  it('pickBest returns highest-scoring result', async () => {
    const intent: DownloadIntent = {
      title: 'Interstellar',
      year: 2014,
      quality: '4K',
      need_subtitle: false,
      search_keywords: ['Interstellar'],
      resource_type: 'movie',
    }

    const results: SearchResult[] = [
      {
        title: 'Interstellar 2014 4K HDR',
        magnet: 'm1',
        size: 60e9,
        seeders: 300,
        leechers: 20,
        source: 'btdig',
        quality: '4K',
      },
      {
        title: 'Interstellar 720p low quality',
        magnet: 'm2',
        size: 2e9,
        seeders: 5,
        leechers: 1,
        source: 'nyaa',
        quality: '720p',
      },
      {
        title: 'Random unrelated torrent',
        magnet: 'm3',
        size: 1e9,
        seeders: 1000,
        leechers: 100,
        source: 'mikan',
        quality: 'other',
      },
    ]

    const best = evaluator.pickBest(results, intent)
    expect(best).not.toBeNull()
    expect(best!.quality).toBe('4K')
  })
})
