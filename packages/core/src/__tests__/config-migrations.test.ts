// __tests__/config-migrations.test.ts — Tests for config migration system
//
// Exercises migrateConfig() with various schema versions, the migration
// list, and SCHEMA_VERSION constant.

import { describe, it, expect } from 'vitest'
import {
  SCHEMA_VERSION,
  migrateConfig,
  migrations,
} from '../config/migrations.js'

describe('config migrations', () => {
  describe('SCHEMA_VERSION', () => {
    it('is a positive number', () => {
      expect(SCHEMA_VERSION).toBeGreaterThan(0)
    })
  })

  describe('migrations list', () => {
    it('is an array', () => {
      expect(Array.isArray(migrations)).toBe(true)
    })

    it('each migration has from, to, and migrate function', () => {
      for (const m of migrations) {
        expect(typeof m.from).toBe('number')
        expect(typeof m.to).toBe('number')
        expect(typeof m.migrate).toBe('function')
      }
    })

    it('migrations are ordered by version', () => {
      for (let i = 1; i < migrations.length; i++) {
        expect(migrations[i].from).toBeGreaterThanOrEqual(migrations[i - 1].from)
      }
    })
  })

  describe('migrateConfig', () => {
    it('returns the same object if already at current schema version', () => {
      const config = { schemaVersion: SCHEMA_VERSION, ai: { provider: 'openai' } }
      const result = migrateConfig({ ...config })
      expect(result.schemaVersion).toBe(SCHEMA_VERSION)
    })

    it('sets schemaVersion when missing', () => {
      const result = migrateConfig({ ai: {} })
      expect(result.schemaVersion).toBe(SCHEMA_VERSION)
    })

    it('runs migration from version 0', () => {
      const result = migrateConfig({})
      expect(result.schemaVersion).toBe(1)
      expect(result.ai).toBeDefined()
      expect(result.aria2).toBeDefined()
      expect(result.downloads).toBeDefined()
    })

    it('ensures all required sections exist after migration', () => {
      const result = migrateConfig({})
      const sections = ['ai', 'aria2', 'downloads', 'schedule', 'disk', 'subtitles', 'archive']
      for (const section of sections) {
        expect(result[section]).toBeDefined()
      }
    })

    it('preserves existing values during migration', () => {
      const result = migrateConfig({ ai: { provider: 'anthropic' } })
      expect(result.ai).toEqual({ provider: 'anthropic' })
    })

    it('does not mutate beyond current version', () => {
      const future = { schemaVersion: 99, ai: {} }
      const result = migrateConfig({ ...future })
      // No migration should run for future versions
      expect(result.schemaVersion).toBe(99)
    })

    it('handles config that is already current with extra data', () => {
      const config = { schemaVersion: 1, customField: 'hello' }
      const result = migrateConfig({ ...config })
      expect(result.customField).toBe('hello')
    })
  })
})
