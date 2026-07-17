// __tests__/config-defaults.test.ts — Sanity test for DEFAULT_CONFIG.
//
// Validates that the single source of truth for default config values
// has the expected shape and that path-bearing fields use the canonical
// `~/` form (consumers expand via platform-specific homeDir()).

import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults.js'
import type { AppConfig } from '../types.js'

describe('DEFAULT_CONFIG', () => {
  it('contains all required top-level sections', () => {
    const requiredKeys: (keyof AppConfig)[] = [
      'ai',
      'aria2',
      'network',
      'downloads',
      'schedule',
      'disk',
      'subtitles',
      'archive',
      'nas',
      'ui',
    ]
    for (const key of requiredKeys) {
      expect(DEFAULT_CONFIG).toHaveProperty(key)
    }
  })

  it('uses ~/ prefix for all download path fields (browser-safe canonical form)', () => {
    expect(DEFAULT_CONFIG.downloads.base_dir).toMatch(/^~\//)
    expect(DEFAULT_CONFIG.downloads.movie_dir).toMatch(/^~\//)
    expect(DEFAULT_CONFIG.downloads.software_dir).toMatch(/^~\//)
    expect(DEFAULT_CONFIG.downloads.other_dir).toMatch(/^~\//)
  })

  it('uses ~/ prefix for subtitle_dir when present', () => {
    if (DEFAULT_CONFIG.subtitles.subtitle_dir) {
      expect(DEFAULT_CONFIG.subtitles.subtitle_dir).toMatch(/^~\//)
    }
  })

  it('omits schemaVersion (it is a migration marker, not a default)', () => {
    expect(DEFAULT_CONFIG.schemaVersion).toBeUndefined()
  })

  it('has at least one default schedule rule', () => {
    expect(DEFAULT_CONFIG.schedule.rules.length).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.schedule.rules[0]).toHaveProperty('name')
    expect(DEFAULT_CONFIG.schedule.rules[0]).toHaveProperty('time_start')
    expect(DEFAULT_CONFIG.schedule.rules[0]).toHaveProperty('time_end')
  })

  it('has a valid theme value', () => {
    expect(['dark', 'light', 'system']).toContain(DEFAULT_CONFIG.ui.theme)
  })
})
