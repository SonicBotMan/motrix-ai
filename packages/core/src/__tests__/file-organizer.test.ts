// __tests__/file-organizer.test.ts — Tests for FileOrganizer
//
// Exercises resource-type classification by extension and by intent,
// covering video, software, music, and unknown file types.

import { describe, it, expect } from 'vitest'
import { FileOrganizer } from '../file/organizer.js'
import type { DownloadIntent } from '../types.js'

describe('FileOrganizer', () => {
  const organizer = new FileOrganizer('/tmp/test')

  describe('classify', () => {
    it('classifies video extensions as movie', () => {
      expect(organizer.classify('movie.mkv')).toBe('movie')
      expect(organizer.classify('video.mp4')).toBe('movie')
      expect(organizer.classify('clip.avi')).toBe('movie')
    })

    it('classifies software extensions', () => {
      expect(organizer.classify('setup.exe')).toBe('software')
      expect(organizer.classify('app.dmg')).toBe('software')
      expect(organizer.classify('pkg.deb')).toBe('software')
    })

    it('classifies music extensions', () => {
      expect(organizer.classify('song.mp3')).toBe('music')
      expect(organizer.classify('track.flac')).toBe('music')
    })

    it('returns other for unknown extensions', () => {
      expect(organizer.classify('data.bin')).toBe('other')
      expect(organizer.classify('file.xyz')).toBe('other')
    })

    it('uses intent.resource_type when provided and not "other"', () => {
      const intent: DownloadIntent = {
        title: 'Test',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'anime',
      }
      expect(organizer.classify('file.mkv', intent)).toBe('anime')
    })

    it('falls back to extension when intent.resource_type is "other"', () => {
      const intent: DownloadIntent = {
        title: 'Test',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'other',
      }
      expect(organizer.classify('movie.mkv', intent)).toBe('movie')
    })

    it('handles files with no extension', () => {
      expect(organizer.classify('README')).toBe('other')
    })

    it('is case-insensitive for extensions', () => {
      expect(organizer.classify('MOVIE.MKV')).toBe('movie')
      expect(organizer.classify('SETUP.EXE')).toBe('software')
    })
  })
})
