// __tests__/file-organize-pipeline.test.ts — Integration test for file classify→rename→move
//
// Exercises FileOrganizer + TemplateEngine integration: classification
// by extension, path rendering, conflict resolution, and intent override.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TemplateEngine } from '../file/templates.js'
import type { AppConfig, DownloadIntent } from '../types.js'

// We test FileOrganizer through mock fs to avoid real file I/O
vi.mock('node:fs', () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error('ENOENT')),
  },
}))

describe('file organize pipeline — classify → rename → move', () => {
  let templateEngine: TemplateEngine
  let mockConfig: AppConfig

  beforeEach(() => {
    vi.clearAllMocks()
    templateEngine = new TemplateEngine()
    mockConfig = {
      ai: { provider: 'opencode', model: 'test' },
      aria2: { rpc_url: 'http://localhost:6800/jsonrpc' },
      downloads: {
        base_dir: '/downloads',
        movie_dir: '/downloads/Movies',
        software_dir: '/downloads/Software',
        other_dir: '/downloads/Other',
        rename_template: '{title} ({year})/{title}.{quality}.{ext}',
      },
      schedule: { enabled: true, rules: [] },
      disk: { enabled: true, thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 } },
      subtitles: { enabled: true, preferred_languages: ['en'], sources: { shooter: true, subhd: true, opensubtitles: false } },
      archive: { enabled: false, targets: [] },
    }
  })

  describe('classify by extension', () => {
    it('classifies .mkv as movie', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('movie.mkv')).toBe('movie')
    })

    it('classifies .exe as software', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('setup.exe')).toBe('software')
    })

    it('classifies .flac as music', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('album.flac')).toBe('music')
    })

    it('classifies unknown extension as other', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')
      expect(org.classify('data.bin')).toBe('other')
    })
  })

  describe('classify with intent override', () => {
    it('intent overrides extension-based classification', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')

      const intent: DownloadIntent = {
        title: 'Some Anime',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'anime',
      }

      // .mkv would be "movie" by extension, but intent says "anime"
      expect(org.classify('episode.mkv', intent)).toBe('anime')
    })

    it('falls back to extension when intent resource_type is "other"', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')

      const intent: DownloadIntent = {
        title: 'Test',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'other',
      }

      expect(org.classify('movie.mkv', intent)).toBe('movie')
    })
  })

  describe('target directory resolution', () => {
    it('routes movie/tv/anime to movie_dir', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')

      for (const type of ['movie', 'tv', 'anime'] as const) {
        const dir = org.getTargetDir(type, mockConfig)
        expect(dir).toBe('/downloads/Movies')
      }
    })

    it('routes software to software_dir', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')

      expect(org.getTargetDir('software', mockConfig)).toBe('/downloads/Software')
    })

    it('routes music/other to other_dir', async () => {
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')

      expect(org.getTargetDir('music', mockConfig)).toBe('/downloads/Other')
      expect(org.getTargetDir('other', mockConfig)).toBe('/downloads/Other')
    })
  })

  describe('template rendering integration', () => {
    it('renders movie path with title, year, quality, ext', () => {
      const path = templateEngine.renderPath('movie', {
        title: 'Inception',
        year: '2010',
        quality: '4K',
        ext: 'mkv',
      })

      expect(path).toContain('Inception')
      expect(path).toContain('2010')
      expect(path).toContain('4K')
      expect(path).toContain('mkv')
    })

    it('renders tv path with season and episode', () => {
      const path = templateEngine.renderPath('tv', {
        title: 'Breaking Bad',
        season: '01',
        episode: '07',
        ext: 'mkv',
      })

      expect(path).toContain('Season 01')
      expect(path).toContain('S01E07')
    })
  })

  describe('organize pipeline', () => {
    it('moves file to correct directory based on type', async () => {
      const { promises: fsPromises } = await import('node:fs')
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')

      const intent: DownloadIntent = {
        title: 'Movie',
        quality: 'other',
        need_subtitle: false,
        search_keywords: [],
        resource_type: 'movie',
      }

      await org.organize('/tmp/film.mkv', intent, mockConfig)

      expect(fsPromises.rename).toHaveBeenCalled()
      const target = vi.mocked(fsPromises.rename).mock.calls[0][1] as string
      expect(target).toContain('Movies')
    })

    it('creates target directory before moving', async () => {
      const { promises: fsPromises } = await import('node:fs')
      const { FileOrganizer } = await import('../file/organizer.js')
      const org = new FileOrganizer('/downloads')

      await org.organize('/tmp/setup.exe', undefined, mockConfig)

      expect(fsPromises.mkdir).toHaveBeenCalled()
    })
  })
})
