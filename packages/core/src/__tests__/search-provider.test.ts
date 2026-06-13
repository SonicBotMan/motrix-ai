// __tests__/search-provider.test.ts — Tests for searchAll provider orchestration
//
// Uses mock SearchProvider objects to verify concurrent querying, error
// tolerance, and result merging / sorting.

import { describe, it, expect } from 'vitest'
import { searchAll, type SearchProvider } from '../search/provider.js'
import type { SearchResult, DownloadIntent } from '../types.js'

function makeResult(title: string, seeders: number, size: number): SearchResult {
  return {
    title,
    magnet: `magnet:?xt=urn:btih:${title}`,
    size,
    seeders,
    leechers: 0,
    source: 'mock',
  }
}

const baseIntent: DownloadIntent = {
  title: 'Test',
  need_subtitle: false,
  search_keywords: ['Test'],
  resource_type: 'movie',
}

describe('searchAll', () => {
  it('merges results from multiple providers', async () => {
    const p1: SearchProvider = {
      name: 'p1',
      search: async () => [makeResult('A', 100, 1000)],
    }
    const p2: SearchProvider = {
      name: 'p2',
      search: async () => [makeResult('B', 200, 2000)],
    }
    const results = await searchAll([p1, p2], baseIntent)
    expect(results).toHaveLength(2)
  })

  it('sorts by seeders descending, then size descending', async () => {
    const provider: SearchProvider = {
      name: 'mock',
      search: async () => [
        makeResult('low-seeders', 10, 5000),
        makeResult('high-seeders', 500, 1000),
        makeResult('mid-seeders', 10, 8000),
      ],
    }
    const results = await searchAll([provider], baseIntent)
    expect(results[0].title).toBe('high-seeders')
    // Among equal seeders (10), larger size first
    expect(results[1].title).toBe('mid-seeders')
    expect(results[2].title).toBe('low-seeders')
  })

  it('tolerates provider failures (Promise.allSettled)', async () => {
    const goodProvider: SearchProvider = {
      name: 'good',
      search: async () => [makeResult('OK', 50, 1000)],
    }
    const badProvider: SearchProvider = {
      name: 'bad',
      search: async () => {
        throw new Error('network error')
      },
    }
    const results = await searchAll([goodProvider, badProvider], baseIntent)
    expect(results).toHaveLength(1)
    expect(results[0].title).toBe('OK')
  })

  it('returns empty array when all providers fail', async () => {
    const badProvider: SearchProvider = {
      name: 'bad',
      search: async () => {
        throw new Error('fail')
      },
    }
    const results = await searchAll([badProvider], baseIntent)
    expect(results).toEqual([])
  })

  it('returns empty array for empty provider list', async () => {
    const results = await searchAll([], baseIntent)
    expect(results).toEqual([])
  })

  it('passes intent.search_keywords to providers', async () => {
    let receivedKeywords: string[] = []
    const provider: SearchProvider = {
      name: 'spy',
      search: async (keywords) => {
        receivedKeywords = keywords
        return []
      },
    }
    await searchAll([provider], { ...baseIntent, search_keywords: ['a', 'b'] })
    expect(receivedKeywords).toEqual(['a', 'b'])
  })
})
