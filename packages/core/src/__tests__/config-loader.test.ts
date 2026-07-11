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

    it('writes config with schemaVersion = 3 on first creation', async () => {
      vi.mocked(existsSync).mockReturnValue(false)

      const { loadConfig } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.schemaVersion).toBe(3)
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

  describe('loadConfig — deep merge preserves nested defaults', () => {
    it('keeps sibling download dirs when only base_dir is provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          schemaVersion: 3,
          downloads: { base_dir: '/custom/base' },
        }),
      )

      const { loadConfig, DEFAULT_CONFIG } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.downloads.base_dir).toBe('/custom/base')
      expect(config.downloads.movie_dir).toBe(DEFAULT_CONFIG.downloads.movie_dir)
      expect(config.downloads.software_dir).toBe(DEFAULT_CONFIG.downloads.software_dir)
      expect(config.downloads.rename_template).toBe(DEFAULT_CONFIG.downloads.rename_template)
    })

    it('keeps sibling subtitle sources when only one toggle is provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          schemaVersion: 3,
          subtitles: { sources: { shooter: false } },
        }),
      )

      const { loadConfig, DEFAULT_CONFIG } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.subtitles.sources.shooter).toBe(false)
      expect(config.subtitles.sources.subhd).toBe(DEFAULT_CONFIG.subtitles.sources.subhd)
      expect(config.subtitles.sources.opensubtitles).toBe(DEFAULT_CONFIG.subtitles.sources.opensubtitles)
      expect(config.subtitles.enabled).toBe(DEFAULT_CONFIG.subtitles.enabled)
      expect(config.subtitles.preferred_languages).toEqual(DEFAULT_CONFIG.subtitles.preferred_languages)
    })

    it('keeps sibling disk thresholds when only low_gb is provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          schemaVersion: 3,
          disk: { thresholds: { low_gb: 50 } },
        }),
      )

      const { loadConfig, DEFAULT_CONFIG } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.disk.thresholds.low_gb).toBe(50)
      expect(config.disk.thresholds.critical_gb).toBe(DEFAULT_CONFIG.disk.thresholds.critical_gb)
      expect(config.disk.thresholds.resume_gb).toBe(DEFAULT_CONFIG.disk.thresholds.resume_gb)
      expect(config.disk.enabled).toBe(DEFAULT_CONFIG.disk.enabled)
    })

    it('keeps sibling nas fields when only host is provided', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          schemaVersion: 3,
          nas: { host: '10.0.0.5' },
        }),
      )

      const { loadConfig, DEFAULT_CONFIG } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.nas.host).toBe('10.0.0.5')
      expect(config.nas.port).toBe(DEFAULT_CONFIG.nas.port)
      expect(config.nas.moviePath).toBe(DEFAULT_CONFIG.nas.moviePath)
      expect(config.nas.enabled).toBe(DEFAULT_CONFIG.nas.enabled)
    })

    it('replaces arrays wholesale instead of concatenating', async () => {
      vi.mocked(existsSync).mockReturnValue(true)
      vi.mocked(readFileSync).mockReturnValue(
        JSON.stringify({
          schemaVersion: 3,
          schedule: {
            rules: [{ name: 'Solo', time_start: '00:00', time_end: '01:00', speed_limit: 0, max_concurrent: 1 }],
          },
        }),
      )

      const { loadConfig } = await import('../config/loader.js')
      const config = loadConfig()

      expect(config.schedule.rules).toHaveLength(1)
      expect(config.schedule.rules[0].name).toBe('Solo')
    })
  })

  describe('deepMerge (unit)', () => {
    it('returns defaults when override is null or undefined', async () => {
      const { deepMerge, DEFAULT_CONFIG } = await import('../config/loader.js')

      expect(deepMerge(DEFAULT_CONFIG, null)).toBe(DEFAULT_CONFIG)
      expect(deepMerge(DEFAULT_CONFIG, undefined)).toBe(DEFAULT_CONFIG)
    })

    it('does not let undefined values override defined defaults', async () => {
      const { deepMerge } = await import('../config/loader.js')

      const result = deepMerge({ a: 1, b: 2 }, { a: undefined })
      expect(result).toEqual({ a: 1, b: 2 })
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
