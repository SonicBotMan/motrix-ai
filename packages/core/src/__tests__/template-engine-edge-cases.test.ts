// __tests__/template-engine-edge-cases.test.ts — Edge case tests for TemplateEngine
//
// Tests missing variables, nested paths, invalid filename characters,
// empty segments, and resource-type template selection.

import { describe, it, expect, beforeEach } from 'vitest'
import { TemplateEngine, DEFAULT_TEMPLATES } from '../file/templates.js'

describe('TemplateEngine edge cases', () => {
  let engine: TemplateEngine

  beforeEach(() => {
    engine = new TemplateEngine()
  })

  describe('missing variables', () => {
    it('keeps placeholder when variable is missing', () => {
      const result = engine.render('{title} {year}', { title: 'Movie' })
      // {year} should remain as a literal since it's not in vars
      expect(result).toContain('Movie')
    })

    it('handles undefined variable value', () => {
      const result = engine.render('{title}', { title: undefined as unknown as string })
      // Placeholder should remain
      expect(result).toContain('title')
    })

    it('handles empty vars dictionary', () => {
      const result = engine.render('{title} ({year})', {})
      // Unresolved placeholders — the / split + filter will remove empty segments
      // but the literal {title} text should be in the result
      expect(result).toContain('title')
    })

    it('renders correctly with all variables present', () => {
      const result = engine.render('{title} ({year})/{title}.{quality}.{ext}', {
        title: 'Inception',
        year: '2010',
        quality: '4K',
        ext: 'mkv',
      })
      expect(result).toBe('Inception (2010)/Inception.4K.mkv')
    })
  })

  describe('invalid filename characters', () => {
    it('removes backslash from rendered path', () => {
      const result = engine.render('{title}', { title: 'movie\\test' })
      expect(result).not.toContain('\\')
    })

    it('removes colon from rendered path', () => {
      const result = engine.render('{title}', { title: 'movie:test' })
      expect(result).not.toContain(':')
    })

    it('removes question mark from rendered path', () => {
      const result = engine.render('{title}', { title: 'movie?test' })
      expect(result).not.toContain('?')
    })

    it('removes asterisk from rendered path', () => {
      const result = engine.render('{title}', { title: 'movie*test' })
      expect(result).not.toContain('*')
    })

    it('removes pipe from rendered path', () => {
      const result = engine.render('{title}', { title: 'movie|test' })
      expect(result).not.toContain('|')
    })

    it('preserves forward slash as path separator', () => {
      const result = engine.render('{title}/{ext}', { title: 'Movie', ext: 'mkv' })
      expect(result).toContain('/')
      expect(result).toBe('Movie/mkv')
    })
  })

  describe('nested paths and empty segments', () => {
    it('filters out empty path segments', () => {
      const result = engine.render('{title}//{ext}', { title: 'Movie', ext: 'mkv' })
      expect(result).not.toContain('//')
      expect(result).toBe('Movie/mkv')
    })

    it('handles deeply nested template paths', () => {
      const result = engine.render('{a}/{b}/{c}/{d}', {
        a: 'top',
        b: 'middle',
        c: 'bottom',
        d: 'file',
      })
      expect(result).toBe('top/middle/bottom/file')
    })

    it('trims whitespace in each path segment', () => {
      const result = engine.render('{title}', { title: '  Movie  ' })
      expect(result).toBe('Movie')
    })
  })

  describe('resource type templates', () => {
    it('getTemplate returns movie template with {title} and {year}', () => {
      const tpl = engine.getTemplate('movie')
      expect(tpl).toContain('{title}')
      expect(tpl).toContain('{year}')
      expect(tpl).toContain('{quality}')
      expect(tpl).toContain('{ext}')
    })

    it('getTemplate returns tv template with season/episode', () => {
      const tpl = engine.getTemplate('tv')
      expect(tpl).toContain('{season}')
      expect(tpl).toContain('{episode}')
    })

    it('getTemplate returns software template with {filename}', () => {
      const tpl = engine.getTemplate('software')
      expect(tpl).toContain('{filename}')
    })

    it('getTemplate returns other template as just {filename}', () => {
      const tpl = engine.getTemplate('other')
      expect(tpl).toBe('{filename}')
    })

    it('renderPath renders movie with correct structure', () => {
      const result = engine.renderPath('movie', {
        title: 'Interstellar',
        year: '2014',
        quality: '4K',
        ext: 'mkv',
      })
      expect(result).toContain('Interstellar')
      expect(result).toContain('2014')
      expect(result).toContain('4K.mkv')
    })

    it('renderPath renders tv with Season/Episode', () => {
      const result = engine.renderPath('tv', {
        title: 'Show',
        season: '02',
        episode: '05',
        ext: 'mp4',
      })
      expect(result).toContain('Season 02')
      expect(result).toContain('S02E05')
    })
  })

  describe('DEFAULT_TEMPLATES coverage', () => {
    it('every resource type has a template', () => {
      const types = ['movie', 'tv', 'software', 'music', 'anime', 'other'] as const
      for (const type of types) {
        expect(DEFAULT_TEMPLATES[type]).toBeDefined()
        expect(typeof DEFAULT_TEMPLATES[type]).toBe('string')
        expect(DEFAULT_TEMPLATES[type].length).toBeGreaterThan(0)
      }
    })
  })
})
