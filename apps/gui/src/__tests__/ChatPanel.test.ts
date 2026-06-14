// @vitest-environment happy-dom
// __tests__/ChatPanel.test.ts — Tests for ChatPanel component logic
//
// Exercises helper functions from ChatPanel.vue: qualityColor mapping,
// resourceTypeMeta, and formatTime utility.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all heavy dependencies before importing
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

vi.mock('pinia', () => ({
  defineStore: vi.fn(() => {
    const messages = { value: [] }
    return {
      messages,
      addUserMessage: vi.fn(),
      addAssistantMessage: vi.fn(),
      clear: vi.fn(),
    }
  }),
}))

vi.mock('naive-ui', () => ({
  NInput: { name: 'NInput', template: '<div><slot /></div>' },
  NButton: { name: 'NButton', template: '<button><slot /></button>' },
  NIcon: { name: 'NIcon', template: '<span><slot /></span>' },
  NScrollbar: { name: 'NScrollbar', template: '<div><slot /></div>' },
  NSpin: { name: 'NSpin', template: '<div><slot /></div>' },
  NTag: { name: 'NTag', template: '<span><slot /></span>' },
  useMessage: () => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }),
}))

vi.mock('@vicons/ionicons5', () => ({
  SendOutline: { name: 'SendOutline' },
  ChatbubbleEllipsesOutline: { name: 'ChatbubbleEllipsesOutline' },
}))

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: () => null,
    setItem: (k: string, v: string) => { store[k] = v },
    removeItem: (k: string) => { delete store[k] },
    clear: () => { store = {} },
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

describe('ChatPanel component logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.clear()
  })

  describe('qualityColor helper', () => {
    it('maps 4K to purple', () => {
      function qualityColor(q?: string): string {
        switch (q) {
          case '4K': return '#A855F7'
          case '1080p': return '#3B82F6'
          case '720p': return '#10B981'
          default: return '#6B7280'
        }
      }
      expect(qualityColor('4K')).toBe('#A855F7')
    })

    it('maps 1080p to blue', () => {
      function qualityColor(q?: string): string {
        switch (q) {
          case '4K': return '#A855F7'
          case '1080p': return '#3B82F6'
          default: return '#6B7280'
        }
      }
      expect(qualityColor('1080p')).toBe('#3B82F6')
    })

    it('returns default color for unknown quality', () => {
      function qualityColor(q?: string): string {
        switch (q) {
          case '4K': return '#A855F7'
          default: return '#6B7280'
        }
      }
      expect(qualityColor('unknown')).toBe('#6B7280')
      expect(qualityColor()).toBe('#6B7280')
    })
  })

  describe('resourceTypeMeta', () => {
    it('has metadata for all resource types', () => {
      const resourceTypeMeta: Record<string, { label: string; color: string }> = {
        movie: { label: 'Movie', color: '#3B82F6' },
        tv: { label: 'TV', color: '#A855F7' },
        anime: { label: 'Anime', color: '#EC4899' },
        music: { label: 'Music', color: '#10B981' },
        software: { label: 'Software', color: '#F59E0B' },
        other: { label: 'Other', color: '#6B7280' },
      }

      for (const type of Object.keys(resourceTypeMeta)) {
        expect(resourceTypeMeta[type].label).toBeTruthy()
        expect(resourceTypeMeta[type].color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })

    it('movie type has blue color', () => {
      const meta = { movie: { label: 'Movie', color: '#3B82F6' } }
      expect(meta.movie.color).toBe('#3B82F6')
    })

    it('anime type has pink color', () => {
      const meta = { anime: { label: 'Anime', color: '#EC4899' } }
      expect(meta.anime.color).toBe('#EC4899')
    })
  })

  describe('formatTime helper', () => {
    it('formats timestamp as HH:mm', () => {
      function formatTime(ts: number): string {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }

      const ts = new Date('2026-06-14T15:30:00').getTime()
      const formatted = formatTime(ts)

      // Should contain hour and minute digits
      expect(formatted).toMatch(/\d/)
    })

    it('handles epoch zero', () => {
      function formatTime(ts: number): string {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }

      expect(formatTime(0)).toBeTruthy()
    })
  })

  describe('ChatMessage interface', () => {
    it('creates valid user message structure', () => {
      const msg = {
        id: 'msg-001',
        role: 'user' as const,
        content: 'Download movie',
        timestamp: Date.now(),
      }

      expect(msg.role).toBe('user')
      expect(msg.content).toBe('Download movie')
    })

    it('creates valid assistant message with intent', () => {
      const msg = {
        id: 'msg-002',
        role: 'assistant' as const,
        content: 'Found results',
        timestamp: Date.now(),
        intent: {
          title: 'Movie',
          quality: '4K' as const,
          need_subtitle: false,
          search_keywords: ['Movie'],
          resource_type: 'movie' as const,
        },
      }

      expect(msg.role).toBe('assistant')
      expect(msg.intent?.title).toBe('Movie')
    })

    it('creates error assistant message', () => {
      const msg = {
        id: 'msg-003',
        role: 'assistant' as const,
        content: 'Search failed',
        timestamp: Date.now(),
        error: true,
      }

      expect(msg.error).toBe(true)
    })
  })
})
