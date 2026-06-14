// __tests__/logger.test.ts — Tests for the Logger utility
//
// Exercises level filtering, prefix formatting, and the createLogger
// factory. Console output is spied to avoid polluting test output.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Logger, createLogger } from '../logger.js'

describe('Logger', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('level filtering', () => {
    it('emits all levels when level is debug', () => {
      const logger = new Logger('test', 'debug')
      logger.error('e')
      logger.warn('w')
      logger.info('i')
      logger.debug('d')
      // info and debug use console.error in this implementation
      expect(errorSpy).toHaveBeenCalledTimes(3) // error + info + debug
      expect(warnSpy).toHaveBeenCalledTimes(1) // warn
    })

    it('suppresses debug when level is info', () => {
      const logger = new Logger('test', 'info')
      logger.debug('hidden')
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('suppresses info and debug when level is warn', () => {
      const logger = new Logger('test', 'warn')
      logger.info('hidden')
      logger.debug('hidden')
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('only emits error when level is error', () => {
      const logger = new Logger('test', 'error')
      logger.warn('hidden')
      logger.info('hidden')
      logger.error('shown')
      expect(warnSpy).not.toHaveBeenCalled()
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('prefix formatting', () => {
    it('includes the prefix in log lines', () => {
      const logger = new Logger('myapp')
      logger.error('boom')
      const call = errorSpy.mock.calls[0][0]
      expect(call).toContain('[myapp]')
      expect(call).toContain('boom')
    })

    it('includes level tag in log lines', () => {
      const logger = new Logger('mod')
      logger.warn('caution')
      expect(warnSpy.mock.calls[0][0]).toContain('[WARN]')
    })
  })

  describe('extra args', () => {
    it('passes extra arguments to console', () => {
      const logger = new Logger('mod', 'debug')
      const obj = { key: 'value' }
      logger.info('msg', obj)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.any(String),
        obj,
      )
    })
  })

  describe('createLogger factory', () => {
    it('returns a Logger instance', () => {
      const logger = createLogger('factory')
      expect(logger).toBeInstanceOf(Logger)
    })

    it('respects provided level', () => {
      const logger = createLogger('factory', 'error')
      logger.info('hidden')
      expect(errorSpy).not.toHaveBeenCalled()
    })

    it('defaults to info level', () => {
      const logger = createLogger('factory')
      logger.info('visible')
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('default level', () => {
    it('defaults to info when level is not provided', () => {
      const logger = new Logger('default')
      logger.info('shown')
      logger.debug('hidden')
      expect(errorSpy).toHaveBeenCalledTimes(1)
    })
  })
})
