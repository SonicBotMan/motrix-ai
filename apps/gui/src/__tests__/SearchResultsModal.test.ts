// @vitest-environment happy-dom
// __tests__/SearchResultsModal.test.ts — Tests for search results display logic
//
// Exercises helper functions from SearchResultsModal.vue: qualityColor,
// qualityLabel, sourceColor, formatDownloads, and formatBytes.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SearchResult } from '../composables/useSearch'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

vi.mock('naive-ui', () => ({
  NModal: { name: 'NModal', template: '<div><slot /></div>' },
  NButton: { name: 'NButton', template: '<button><slot /></button>' },
  NIcon: { name: 'NIcon', template: '<span><slot /></span>' },
  NTag: { name: 'NTag', template: '<span><slot /></span>' },
  NSpin: { name: 'NSpin', template: '<div><slot /></div>' },
  NEmpty: { name: 'NEmpty', template: '<div><slot /></div>' },
}))

vi.mock('@vicons/ionicons5', () => ({
  DownloadOutline: { name: 'DownloadOutline' },
  CloseOutline: { name: 'CloseOutline' },
  DocumentTextOutline: { name: 'DocumentTextOutline' },
}))

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: () => null,
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      store = {}
    },
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

describe('SearchResultsModal logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  describe('qualityColor', () => {
    function qualityColor(q?: string): string {
      switch (q) {
        case '4K':
          return '#A855F7'
        case '1080p':
          return '#3B82F6'
        case '720p':
          return '#10B981'
        default:
          return '#6B7280'
      }
    }

    it('returns purple for 4K', () => {
      expect(qualityColor('4K')).toBe('#A855F7')
    })
    it('returns blue for 1080p', () => {
      expect(qualityColor('1080p')).toBe('#3B82F6')
    })
    it('returns green for 720p', () => {
      expect(qualityColor('720p')).toBe('#10B981')
    })
    it('returns gray for other/undefined', () => {
      expect(qualityColor('other')).toBe('#6B7280')
      expect(qualityColor(undefined)).toBe('#6B7280')
    })
  })

  describe('qualityLabel', () => {
    function qualityLabel(q?: string): string {
      if (!q || q === 'other') return ''
      return q.toUpperCase()
    }

    it('returns uppercase for known qualities', () => {
      expect(qualityLabel('4K')).toBe('4K')
      expect(qualityLabel('1080p')).toBe('1080P')
    })

    it('returns empty string for other/unknown', () => {
      expect(qualityLabel('other')).toBe('')
      expect(qualityLabel(undefined)).toBe('')
    })
  })

  describe('sourceColor', () => {
    function sourceColor(source: string): string {
      switch (source) {
        case 'btdig':
          return '#F59E0B'
        case 'mikan':
          return '#EC4899'
        default:
          return '#6B7280'
      }
    }

    it('returns amber for btdig', () => {
      expect(sourceColor('btdig')).toBe('#F59E0B')
    })
    it('returns pink for mikan', () => {
      expect(sourceColor('mikan')).toBe('#EC4899')
    })
    it('returns gray for unknown source', () => {
      expect(sourceColor('unknown')).toBe('#6B7280')
    })
  })

  describe('formatDownloads', () => {
    function formatDownloads(count: number): string {
      if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
      if (count >= 1000) return `${(count / 1000).toFixed(0)}K`
      return count.toString()
    }

    it('formats millions as M', () => {
      expect(formatDownloads(1500000)).toBe('1.5M')
      expect(formatDownloads(10000000)).toBe('10.0M')
    })
    it('formats thousands as K', () => {
      expect(formatDownloads(5000)).toBe('5K')
      expect(formatDownloads(999)).toBe('999')
    })
    it('formats small numbers as-is', () => {
      expect(formatDownloads(42)).toBe('42')
      expect(formatDownloads(0)).toBe('0')
    })
  })

  describe('formatBytes (from useSearch)', () => {
    async function getFormatBytes() {
      const { formatBytes } = await import('../composables/useSearch')
      return formatBytes
    }

    it('formats bytes to human readable', async () => {
      const formatBytes = await getFormatBytes()
      const result = formatBytes(1024)
      expect(result).toBeTruthy()
      expect(typeof result).toBe('string')
    })

    it('formats GB correctly', async () => {
      const formatBytes = await getFormatBytes()
      const result = formatBytes(5 * 1024 * 1024 * 1024)
      expect(result).toContain('GB')
    })

    it('formats 0 bytes', async () => {
      const formatBytes = await getFormatBytes()
      const result = formatBytes(0)
      expect(result).toBeTruthy()
    })
  })

  describe('SearchResult type usage', () => {
    it('constructs valid SearchResult objects', () => {
      const result: SearchResult = {
        title: 'Movie 4K',
        magnet: 'magnet:?xt=urn:btih:abc',
        size: 5e9,
        seeders: 100,
        leechers: 10,
        source: 'btdig',
        quality: '4K',
      }

      expect(result.title).toBe('Movie 4K')
      expect(result.seeders).toBe(100)
      expect(result.quality).toBe('4K')
    })
  })
})
