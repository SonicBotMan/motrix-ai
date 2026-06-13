// __tests__/file-renamer.test.ts — Tests for FileRenamer
//
// Exercises path generation for all resource types, subtitle-path derivation,
// and edge cases such as missing year/quality.

import { describe, it, expect } from 'vitest'
import { FileRenamer } from '../file/renamer.js'

describe('FileRenamer', () => {
  const renamer = new FileRenamer()

  describe('generatePath', () => {
    it('generates a movie path with year and quality', () => {
      const result = renamer.generatePath({
        title: '流浪地球 2',
        year: 2023,
        quality: '4K',
        resource_type: 'movie',
        original_filename: 'download.mkv',
      })
      expect(result).toBe('Movies/流浪地球 2 (2023)/流浪地球 2.4K.mkv')
    })

    it('generates a movie path without year', () => {
      const result = renamer.generatePath({
        title: 'Some Movie',
        quality: '1080p',
        resource_type: 'movie',
        original_filename: 'file.mp4',
      })
      expect(result).toBe('Movies/Some Movie/Some Movie.1080p.mp4')
    })

    it('omits quality in filename when quality is "other"', () => {
      const result = renamer.generatePath({
        title: 'Test',
        quality: 'other',
        resource_type: 'other',
        original_filename: 'data.bin',
      })
      expect(result).toBe('Other/Test/Test.bin')
    })

    it('routes tv/anime to Movies directory', () => {
      const tv = renamer.generatePath({
        title: 'Show',
        resource_type: 'tv',
        original_filename: 's01e01.mkv',
      })
      expect(tv.startsWith('Movies/')).toBe(true)

      const anime = renamer.generatePath({
        title: 'Anime',
        resource_type: 'anime',
        original_filename: 'ep01.mkv',
      })
      expect(anime.startsWith('Movies/')).toBe(true)
    })

    it('routes software to Software directory', () => {
      const result = renamer.generatePath({
        title: 'App',
        resource_type: 'software',
        original_filename: 'setup.exe',
      })
      expect(result.startsWith('Software/')).toBe(true)
    })

    it('routes music to Music directory', () => {
      const result = renamer.generatePath({
        title: 'Album',
        resource_type: 'music',
        original_filename: 'track.flac',
      })
      expect(result.startsWith('Music/')).toBe(true)
    })

    it('routes other to Other directory', () => {
      const result = renamer.generatePath({
        title: 'Misc',
        resource_type: 'other',
        original_filename: 'file.zip',
      })
      expect(result.startsWith('Other/')).toBe(true)
    })

    it('cleans invalid characters from title', () => {
      const result = renamer.generatePath({
        title: 'Movie: Part 2?',
        resource_type: 'movie',
        original_filename: 'm.mkv',
      })
      expect(result).not.toContain(':')
      expect(result).not.toContain('?')
    })

    it('handles files with no extension', () => {
      const result = renamer.generatePath({
        title: 'NoExt',
        resource_type: 'other',
        original_filename: 'README',
      })
      expect(result).toContain('.bin')
    })
  })

  describe('generateSubtitlePath', () => {
    it('replaces video extension with language srt', () => {
      const result = renamer.generateSubtitlePath('/downloads/movie.mkv', 'zh')
      expect(result).toBe('/downloads/movie.zh.srt')
    })

    it('handles mp4 extension', () => {
      const result = renamer.generateSubtitlePath('/path/video.mp4', 'en')
      expect(result).toBe('/path/video.en.srt')
    })
  })
})
