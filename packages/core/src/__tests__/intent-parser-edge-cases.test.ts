// __tests__/intent-parser-edge-cases.test.ts — Edge case tests for IntentParser heuristic
//
// Tests empty input, special characters, unicode, quality detection edge cases,
// and resource type inference from unusual inputs.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @opencode-ai/sdk so the parser falls back to heuristic mode
vi.mock('@opencode-ai/sdk', () => ({
  createOpencodeClient: vi.fn(),
}))

describe('IntentParser edge cases — heuristic fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('handles empty string input', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    // parse() will try OpenCode first, fail (mocked), then use heuristic
    const result = await parser.parse('')

    // Heuristic should still return a result (title falls back to input)
    expect(result).toBeDefined()
    expect(result.search_keywords).toBeDefined()
  })

  it('handles whitespace-only input', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('   ')

    expect(result).toBeDefined()
  })

  it('detects 4K quality with various patterns', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const inputs = ['下载 电影 4K', 'movie 2160p', 'film UHD version']
    for (const input of inputs) {
      const result = await parser.parse(input)
      expect(result.quality).toBe('4K')
    }
  })

  it('detects 1080p quality', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('download movie 1080p')
    expect(result.quality).toBe('1080p')
  })

  it('detects subtitle requirement', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('下载电影 字幕版')
    expect(result.need_subtitle).toBe(true)
  })

  it('detects anime resource type', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('下载 番剧 新番')
    expect(result.resource_type).toBe('anime')
  })

  it('detects software resource type', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('download Photoshop .exe')
    expect(result.resource_type).toBe('software')
  })

  it('handles unicode emoji in input', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('🎬 下载电影 Inception 🎥')
    expect(result).toBeDefined()
    expect(result.title).toBeTruthy()
  })

  it('strips quality keywords from extracted title', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('Inception 1080p BluRay')
    // Title should not contain quality markers
    expect(result.title).not.toMatch(/1080p/i)
    expect(result.title).not.toMatch(/bluray/i)
  })

  it('extracts year from input', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('Inception 2010 4K')
    expect(result.year).toBe(2010)
  })

  it('generates search keywords with deduplication', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('Inception 4K')
    // Keywords should be deduplicated via Set
    const unique = new Set(result.search_keywords)
    expect(result.search_keywords.length).toBe(unique.size)
  })

  it('handles special characters in input', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('下载 [BD] 电影!! 2024 @special')
    expect(result).toBeDefined()
    expect(result.title).toBeTruthy()
  })

  it('detects TV show resource type', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('download TV series season')
    expect(result.resource_type).toBe('tv')
  })

  it('detects music resource type', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('download album .flac')
    expect(result.resource_type).toBe('music')
  })

  it('removes common Chinese prefixes from title', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const parser = new IntentParser()

    const result = await parser.parse('下载 流浪地球2')
    // The prefix "下载" should be stripped
    expect(result.title).not.toMatch(/^下载/)
  })

  it('logs the underlying error message when falling back to heuristic', async () => {
    const { IntentParser } = await import('../ai/intent-parser.js')
    const { createOpencodeClient } = await import('@opencode-ai/sdk')
    const parser = new IntentParser()

    vi.mocked(createOpencodeClient).mockImplementation(() => {
      throw new Error('connection refused')
    })

    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      await parser.parse('any input')

      expect(consoleWarnSpy).toHaveBeenCalled()
      const args = consoleWarnSpy.mock.calls[0] ?? []
      const joined = args.map(String).join(' ')
      expect(joined).toContain('intent-parser')
      expect(
        args.some((arg) => arg && typeof arg === 'object' && 'error' in arg && arg.error === 'connection refused'),
      ).toBe(true)
    } finally {
      consoleWarnSpy.mockRestore()
      vi.mocked(createOpencodeClient).mockReset()
    }
  })
})
