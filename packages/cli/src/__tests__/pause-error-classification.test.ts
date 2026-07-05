import { describe, test, expect } from 'vitest'

// Re-implement the same predicate the CLI uses so we can unit-test the
// decision logic without booting commander + the queue manager. The CLI's
// own copy lives in packages/cli/src/commands/pause.ts but it isn't
// exported, so we mirror it here and pin its behaviour.
function isConnectionError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    msg.includes('fetch failed') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('network') ||
    msg.includes('connect') ||
    msg.includes('rpc error: aria2 rpc error')
  )
}

describe('CLI pause error classification (QA #6)', () => {
  test('classifies fetch-layer failures as connection errors', () => {
    expect(isConnectionError(new Error('fetch failed'))).toBe(true)
    expect(isConnectionError(new Error('ECONNREFUSED 127.0.0.1:6800'))).toBe(true)
    expect(isConnectionError(new Error('ETIMEDOUT'))).toBe(true)
    expect(isConnectionError(new Error('network error'))).toBe(true)
  })

  test('classifies aria2 RPC errors as NOT connection errors', () => {
    // Real aria2 RPC error: "GID cannot be paused now" — this was
    // previously mis-reported as a connection failure (QA #6).
    expect(isConnectionError(new Error('GID cannot be paused now'))).toBe(false)
    expect(isConnectionError(new Error('No such GID: abc123'))).toBe(false)
    expect(isConnectionError(new Error('aria2 error: Unauthorized'))).toBe(false)
  })

  test('handles non-Error inputs without throwing', () => {
    expect(isConnectionError('string error: connect refused')).toBe(true)
    expect(isConnectionError(undefined)).toBe(false)
    expect(isConnectionError(42)).toBe(false)
    expect(isConnectionError(null)).toBe(false)
  })
})
