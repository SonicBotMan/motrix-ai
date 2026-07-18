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

  it('uses ~/ prefix for base_dir (browser-safe canonical form)', () => {
    expect(DEFAULT_CONFIG.downloads.base_dir).toMatch(/^~\//)
  })

  it('uses relative names for subdir fields (not full paths)', () => {
    // Subdirs are joined under base_dir by Rust's organize_file.
    // Full-path values would be sanitized into ~_Downloads_... nonsense dirs.
    expect(DEFAULT_CONFIG.downloads.movie_dir).toBe('Movies')
    expect(DEFAULT_CONFIG.downloads.software_dir).toBe('Software')
    expect(DEFAULT_CONFIG.downloads.other_dir).toBe('Other')
    // Ensure no separator characters slipped in
    expect(DEFAULT_CONFIG.downloads.movie_dir).not.toMatch(/[/\\]/)
    expect(DEFAULT_CONFIG.downloads.software_dir).not.toMatch(/[/\\]/)
    expect(DEFAULT_CONFIG.downloads.other_dir).not.toMatch(/[/\\]/)
  })

  it('uses ~/ prefix for subtitle_dir when present', () => {
    if (DEFAULT_CONFIG.subtitles.subtitle_dir) {
      expect(DEFAULT_CONFIG.subtitles.subtitle_dir).toMatch(/^~\//)
    }
  })

  it('omits schemaVersion (it is a migration marker, not a default)', () => {
    expect(DEFAULT_CONFIG.schemaVersion).toBeUndefined()
  })

  it('has at least one default schedule rule with required fields', () => {
    expect(DEFAULT_CONFIG.schedule.rules.length).toBeGreaterThan(0)
    const rule = DEFAULT_CONFIG.schedule.rules[0]
    expect(rule).toHaveProperty('name')
    expect(rule).toHaveProperty('time_start')
    expect(rule).toHaveProperty('time_end')
    expect(rule).toHaveProperty('enabled', true)
  })

  it('all default schedule rules have enabled: true', () => {
    for (const rule of DEFAULT_CONFIG.schedule.rules) {
      expect(rule.enabled).toBe(true)
    }
  })

  it('has a valid theme value', () => {
    expect(['dark', 'light', 'system']).toContain(DEFAULT_CONFIG.ui.theme)
  })
})
