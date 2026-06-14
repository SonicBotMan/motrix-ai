import { describe, it, expect } from 'vitest'
import { ResultEvaluator } from '../ai/result-evaluator'
import type { DownloadIntent, SearchResult } from '../types'

describe('ResultEvaluator — edge cases', () => {
  const evaluator = new ResultEvaluator()

  it('handles empty results', () => {
    const intent: DownloadIntent = {
      title: 'Test',
      quality: 'other',
      need_subtitle: false,
      search_keywords: ['test'],
      resource_type: 'other',
    }
    const result = evaluator.evaluate([], intent)
    expect(result).toEqual([])
  })

  it('handles single result', () => {
    const intent: DownloadIntent = {
      title: 'Test',
      quality: 'other',
      need_subtitle: false,
      search_keywords: ['test'],
      resource_type: 'other',
    }
    const results: SearchResult[] = [
      { title: 'Test', magnet: 'magnet:?xt=...', size: 1000000, seeders: 10, leechers: 2, source: 'test' },
    ]
    const sorted = evaluator.evaluate(results, intent)
    expect(sorted).toHaveLength(1)
    expect(sorted[0].title).toBe('Test')
  })

  it('pickBest returns null for empty results', () => {
    const intent: DownloadIntent = {
      title: 'Test',
      quality: 'other',
      need_subtitle: false,
      search_keywords: ['test'],
      resource_type: 'other',
    }
    const result = evaluator.pickBest([], intent)
    expect(result).toBeNull()
  })
})
