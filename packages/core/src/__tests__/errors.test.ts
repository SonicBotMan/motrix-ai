// __tests__/errors.test.ts — Tests for the structured error hierarchy
//
// Verifies that every domain error class extends AppError, carries the
// correct stable `code` field, populates `name`, preserves the optional
// `cause`, and serialises correctly via toJSON().

import { describe, it, expect } from 'vitest'
import {
  AppError,
  SearchError,
  Aria2Error,
  IntentParseError,
  QueueError,
  SubtitleError,
  ConfigError,
  ArchiveError,
} from '../errors.js'

describe('AppError', () => {
  it('creates an instance with message and code', () => {
    const err = new AppError('something broke', 'GENERIC')
    expect(err).toBeInstanceOf(Error)
    expect(err.message).toBe('something broke')
    expect(err.code).toBe('GENERIC')
  })

  it('sets name to "AppError"', () => {
    const err = new AppError('msg', 'CODE')
    expect(err.name).toBe('AppError')
  })

  it('stores the cause when provided', () => {
    const inner = new Error('root cause')
    const err = new AppError('wrapped', 'CODE', inner)
    expect(err.cause).toBe(inner)
  })

  it('cause is undefined when not provided', () => {
    const err = new AppError('msg', 'CODE')
    expect(err.cause).toBeUndefined()
  })

  it('toJSON returns a plain object with expected keys', () => {
    const err = new AppError('fail', 'MY_CODE')
    const json = err.toJSON()
    expect(json.name).toBe('AppError')
    expect(json.code).toBe('MY_CODE')
    expect(json.message).toBe('fail')
  })

  it('toJSON includes cause message when cause is present', () => {
    const inner = new Error('inner')
    const err = new AppError('outer', 'CODE', inner)
    expect(err.toJSON().cause).toBe('inner')
  })
})

describe('SearchError', () => {
  it('extends AppError', () => {
    const err = new SearchError('no results')
    expect(err).toBeInstanceOf(AppError)
    expect(err).toBeInstanceOf(Error)
  })

  it('has code SEARCH_ERROR', () => {
    expect(new SearchError('x').code).toBe('SEARCH_ERROR')
  })

  it('has name SearchError', () => {
    expect(new SearchError('x').name).toBe('SearchError')
  })
})

describe('Aria2Error', () => {
  it('extends AppError', () => {
    expect(new Aria2Error('rpc fail')).toBeInstanceOf(AppError)
  })

  it('has code ARIA2_ERROR', () => {
    expect(new Aria2Error('x').code).toBe('ARIA2_ERROR')
  })

  it('has name Aria2Error', () => {
    expect(new Aria2Error('x').name).toBe('Aria2Error')
  })
})

describe('IntentParseError', () => {
  it('extends AppError', () => {
    expect(new IntentParseError('bad input')).toBeInstanceOf(AppError)
  })

  it('has code INTENT_PARSE_ERROR', () => {
    expect(new IntentParseError('x').code).toBe('INTENT_PARSE_ERROR')
  })
})

describe('QueueError', () => {
  it('extends AppError', () => {
    expect(new QueueError('queue full')).toBeInstanceOf(AppError)
  })

  it('has code QUEUE_ERROR', () => {
    expect(new QueueError('x').code).toBe('QUEUE_ERROR')
  })
})

describe('SubtitleError', () => {
  it('extends AppError', () => {
    expect(new SubtitleError('no subs')).toBeInstanceOf(AppError)
  })

  it('has code SUBTITLE_ERROR', () => {
    expect(new SubtitleError('x').code).toBe('SUBTITLE_ERROR')
  })
})

describe('ConfigError', () => {
  it('extends AppError', () => {
    expect(new ConfigError('bad config')).toBeInstanceOf(AppError)
  })

  it('has code CONFIG_ERROR', () => {
    expect(new ConfigError('x').code).toBe('CONFIG_ERROR')
  })
})

describe('ArchiveError', () => {
  it('extends AppError', () => {
    expect(new ArchiveError('sync failed')).toBeInstanceOf(AppError)
  })

  it('has code ARCHIVE_ERROR', () => {
    expect(new ArchiveError('x').code).toBe('ARCHIVE_ERROR')
  })
})

describe('Error hierarchy completeness', () => {
  it('all domain errors carry distinct codes', () => {
    const codes = [
      new SearchError('').code,
      new Aria2Error('').code,
      new IntentParseError('').code,
      new QueueError('').code,
      new SubtitleError('').code,
      new ConfigError('').code,
      new ArchiveError('').code,
    ]
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('can be caught as AppError', () => {
    const errors: AppError[] = [new SearchError('a'), new Aria2Error('b'), new ConfigError('c')]
    for (const e of errors) {
      expect(e instanceof AppError).toBe(true)
      expect(e.message.length).toBeGreaterThan(0)
    }
  })
})
