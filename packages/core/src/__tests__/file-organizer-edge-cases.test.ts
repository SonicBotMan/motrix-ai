// __tests__/file-organizer-edge-cases.test.ts — Edge case tests for FileOrganizer
//
// Tests unknown extensions, intent override, directory resolution,
// conflict resolution, and edge cases in classification.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppConfig, DownloadIntent } from '../types.js'

// Mock fs
vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  },
}))

describe('FileOrganizer edge cases', () => {
  let mockConfig: AppConfig

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig = {
      ai: { provider: 'opencode', model: 'test' },
      aria2: { rpc_url: 'http://localhost:6800/jsonrpc' },
      downloads: {
        base_dir: '/downloads',
        movie_dir: '/downloads/Movies',
        software_dir: '/downloads/Software',
        other_dir: '/downloads/Other',
        rename_template: '{title}',
      },
      schedule: { enabled: true, rules: [] },
      disk: { enabled: true, thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 } },
      subtitles: { enabled: true, preferred_languages: ['en'], sources: { shooter: true, subhd: true, opensubtitles: false } },
      archive: { enabled: false, targets: [] },
    }
  })

  describe('unknown extensions', () => {
    it('classifies .bin as other', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('data.bin')).toBe('other')
    })

    it('classifies file with no extension as other', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('README')).toBe('other')
    })

    it('classifies .unknown_ext as other', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('file.xyz')).toBe('other')
    })

    it('classifies .tar.gz as other (compound extension)', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      // .gz is the last extension segment — not in any known set
      expect(org.classify('archive.tar.gz')).toBe('other')
    })
  })

  describe('video extensions', () => {
    it('classifies .mkv as movie', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('video.mkv')).toBe('movie')
    })

    it('classifies .mp4 as movie', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('video.mp4')).toBe('movie')
    })

    it('classifies .avi as movie', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('video.avi')).toBe('movie')
    })

    it('classifies .ts as movie', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('video.ts')).toBe('movie')
    })

    it('classifies .mov as movie', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('video.mov')).toBe('movie')
    })
  })

  describe('software extensions', () => {
    it('classifies .exe as software', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('setup.exe')).toBe('software')
    })

    it('classifies .dmg as software', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('app.dmg')).toBe('software')
    })

    it('classifies .deb as software', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('package.deb')).toBe('software')
    })

    it('classifies .rpm as software', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('package.rpm')).toBe('software')
    })

    it('classifies .appimage as software', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('app.AppImage')).toBe('software')
    })
  })

  describe('intent override', () => {
    it('anime intent overrides .mkv classification', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      const intent: DownloadIntent = {
        title: 'Anime',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'anime',
      }
      expect(org.classify('episode.mkv', intent)).toBe('anime')
    })

    it('music intent overrides .mp3 classification', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      const intent: DownloadIntent = {
        title: 'Album',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'music',
      }
      // intent says "music" — but .mp3 is also music, so same result
      expect(org.classify('track.mp3', intent)).toBe('music')
    })

    it('software intent overrides .mkv (video) classification', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      const intent: DownloadIntent = {
        title: 'Tool',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'software',
      }
      // .mkv would be "movie" but intent says "software"
      expect(org.classify('tool.mkv', intent)).toBe('software')
    })

    it('"other" intent does not override extension detection', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      const intent: DownloadIntent = {
        title: 'Test',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'other',
      }
      // resource_type "other" → falls back to extension
      expect(org.classify('movie.mkv', intent)).toBe('movie')
    })
  })

  describe('target directory with relative paths', () => {
    it('joins relative movie_dir with base_dir', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')

      const config = {
        ...mockConfig,
        downloads: {
          ...mockConfig.downloads,
          movie_dir: 'Films', // relative
        },
      }

      const dir = org.getTargetDir('movie', config)
      expect(dir).toContain('Films')
      expect(dir).toContain('/downloads')
    })

    it('uses absolute path directly when movie_dir is absolute', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')

      const config = {
        ...mockConfig,
        downloads: {
          ...mockConfig.downloads,
          movie_dir: '/media/Movies', // absolute
        },
      }

      const dir = org.getTargetDir('movie', config)
      expect(dir).toBe('/media/Movies')
    })
  })
})
