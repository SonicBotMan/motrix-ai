// __tests__/config-schema.test.ts — Tests for config validation
//
// Exercises validateConfig: acceptance of a complete config, default-filling
// for partial configs, and rejection of invalid disk thresholds.

import { describe, it, expect } from 'vitest'
import { validateConfig } from '../config/schema.js'
import { DEFAULT_CONFIG } from '../config/loader.js'

describe('validateConfig', () => {
  it('accepts a valid full config', () => {
    const result = validateConfig(DEFAULT_CONFIG)
    expect(result.ai.provider).toBe('opencode')
    expect(result.aria2.rpc_url).toBeDefined()
  })

  it('fills defaults for an empty object', () => {
    const result = validateConfig({})
    expect(result.ai).toBeDefined()
    expect(result.downloads).toBeDefined()
    expect(result.schedule).toBeDefined()
  })

  it('fills defaults for non-object input', () => {
    const result = validateConfig(null)
    expect(result.ai).toBeDefined()
    expect(result.ai.provider).toBe('opencode')
  })

  it('rejects invalid disk thresholds where critical >= low', () => {
    expect(() =>
      validateConfig({
        disk: { enabled: true, thresholds: { low_gb: 1, critical_gb: 5, resume_gb: 10 } },
      }),
    ).toThrow()
  })

  it('rejects invalid provider', () => {
    expect(() =>
      validateConfig({
        ai: { provider: 'invalid-provider' },
      }),
    ).toThrow()
  })

  it('accepts partial schedule config with defaults', () => {
    const result = validateConfig({ schedule: { enabled: false } })
    expect(result.schedule.enabled).toBe(false)
    // rules should fall back to defaults
    expect(result.schedule.rules).toBeDefined()
    expect(result.schedule.rules.length).toBeGreaterThan(0)
  })

  it('accepts valid disk thresholds', () => {
    const result = validateConfig({
      disk: {
        enabled: true,
        thresholds: { low_gb: 10, critical_gb: 2, resume_gb: 20 },
      },
    })
    expect(result.disk.thresholds.low_gb).toBe(10)
    expect(result.disk.thresholds.critical_gb).toBe(2)
  })

  it('round-trips DEFAULT_CONFIG through validation', () => {
    const result = validateConfig(DEFAULT_CONFIG)
    expect(result.schedule.rules.length).toBe(DEFAULT_CONFIG.schedule.rules.length)
    expect(result.disk.thresholds.low_gb).toBe(DEFAULT_CONFIG.disk.thresholds.low_gb)
  })
})
