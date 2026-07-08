// __tests__/config-loader.test.ts — Tests for config loader and persistence
//
// Exercises loadConfig() and saveConfig() with fs mocking to verify
// default creation, file reading, migration passthrough, and write behavior.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'

// Mock fs and os so we don't touch the real filesystem
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

vi.mock('os', () => ({
  homedir: () => '/home/testuser',
}))

describe('config loader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('loadConfig — first run (file does not exist)', () => {
    it('creates config directory when file is missing', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const { loadConfig } = await import('../config/loader.js')
      loadConfig()

      expect(mkdirSync).toHaveBeenCalled()
      expect(writeFileSync).toHaveBeenCalled()
    })

    it('returns config with default AI provider', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const { loadConfig, DEFAULT_CONFIG } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.ai.provider).toBe(DEFAULT_CONFIG.ai.provider)
    })

    it('writes config with schemaVersion = 2 on first creation', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const { loadConfig } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.schemaVersion).toBe(2)
    })

    it('includes schedule rules by default', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const { loadConfig } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.schedule.rules.length).toBeGreaterThan(0)
    })
  })

  describe('loadConfig — existing file', () => {
    it('reads and parses existing config file', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          schemaVersion: 1,
          ai: { provider: 'anthropic', model: 'claude-sonnet-4' },
        }),
      )

      const { loadConfig } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.ai.provider).toBe('anthropic')
    })

    it('does not write file when config already exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({ schemaVersion: 1, ai: { provider: 'openai', model: 'gpt-4o' } }),
      )

      const { loadConfig } = await import('../config/loader.js')
      loadConfig()

      expect(writeFileSync).not.toHaveBeenCalled()
    })

    it('merges defaults with loaded values', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          schemaVersion: 1,
          ai: { provider: 'ollama', model: 'llama3' },
        }),
      )

      const { loadConfig } = await import('../config/loader.js')
      const config = loadConfig()

      // Loaded value preserved
      expect(config.ai.model).toBe('llama3')
      // Defaults applied for missing sections
      expect(config.aria2).toBeDefined()
      expect(config.downloads).toBeDefined()
    })
  })

  describe('saveConfig', () => {
    it('writes config as JSON to file', async () => {
      const { saveConfig, DEFAULT_CONFIG } = await import('../config/loader.js')

      saveConfig({ ...DEFAULT_CONFIG, schemaVersion: 1 })

      expect(mkdirSync).toHaveBeenCalled()
      expect(writeFileSync).toHaveBeenCalledTimes(1)
      const written = vi.mocked(writeFileSync).mock.calls[0][1] as string
      expect(JSON.parse(written).ai).toBeDefined()
    })

    it('creates directory before writing', async () => {
      const { saveConfig, DEFAULT_CONFIG } = await import('../config/loader.js')

      saveConfig({ ...DEFAULT_CONFIG, schemaVersion: 1 })

      expect(mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true })
    })

    it('serializes with indentation', async () => {
      const { saveConfig, DEFAULT_CONFIG } = await import('../config/loader.js')

      saveConfig({ ...DEFAULT_CONFIG, schemaVersion: 1 })

      const written = vi.mocked(writeFileSync).mock.calls[0][1] as string
      expect(written).toContain('  ') // 2-space indent
    })
  })

  describe('DEFAULT_CONFIG', () => {
    it('has all required top-level sections', async () => {
      const { DEFAULT_CONFIG } = await import('../config/loader.js')

      const sections = ['ai', 'aria2', 'downloads', 'schedule', 'disk', 'subtitles', 'archive']
      for (const section of sections) {
        expect(DEFAULT_CONFIG[section]).toBeDefined()
      }
    })

    it('default AI provider is opencode', async () => {
      const { DEFAULT_CONFIG } = await import('../config/loader.js')

      expect(DEFAULT_CONFIG.ai.provider).toBe('opencode')
    })

    it('default subtitles preferred languages include zh and en', async () => {
      const { DEFAULT_CONFIG } = await import('../config/loader.js')

      expect(DEFAULT_CONFIG.subtitles.preferred_languages).toContain('zh')
      expect(DEFAULT_CONFIG.subtitles.preferred_languages).toContain('en')
    })

    it('default rename template uses {title} placeholder', async () => {
      const { DEFAULT_CONFIG } = await import('../config/loader.js')

      expect(DEFAULT_CONFIG.downloads.rename_template).toContain('{title}')
    })
  })
})
