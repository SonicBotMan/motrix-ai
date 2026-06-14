// __tests__/archive-sync.test.ts — Tests for ArchiveSync
//
// Exercises syncFile(), testConnection(), syncAll(), and rsync command
// building with mocked exec.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ArchiveSync } from '../archive/sync.js'
import type { AppConfig, ArchiveTarget } from '../types.js'

// Mock child_process.exec
vi.mock('node:child_process', () => ({
  exec: vi.fn((_cmd: string, _opts: unknown, cb: unknown) => {
    if (typeof cb === 'function') cb(null, { stdout: '', stderr: '' })
    return undefined
  }),
}))

function makeConfig(enabled: boolean, targets: ArchiveTarget[] = []): AppConfig {
  return {
    ai: { provider: 'opencode', model: 'test' },
    aria2: { rpc_url: 'http://localhost:6800' },
    downloads: {
      base_dir: '/downloads',
      movie_dir: '/downloads/Movies',
      software_dir: '/downloads/Software',
      other_dir: '/downloads/Other',
      rename_template: '{title}',
    },
    schedule: { enabled: false, rules: [] },
    disk: { enabled: false, thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 } },
    subtitles: {
      enabled: false,
      preferred_languages: [],
      sources: { shooter: false, subhd: false, opensubtitles: false },
    },
    archive: { enabled, targets },
  }
}

const movieTarget: ArchiveTarget = {
  name: 'NAS Movies',
  host: 'user@nas.local',
  path: '/volume1/movies',
  match: { resource_type: 'movie' },
}

const genericTarget: ArchiveTarget = {
  name: 'NAS Generic',
  host: 'user@nas.local',
  path: '/volume1/downloads',
  match: {},
}

describe('ArchiveSync', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('syncFile', () => {
    it('returns null when archive is disabled', async () => {
      const sync = new ArchiveSync(makeConfig(false))
      const result = await sync.syncFile('/downloads/movie.mkv', 'movie')
      expect(result).toBeNull()
    })

    it('returns null when no matching target', async () => {
      const sync = new ArchiveSync(makeConfig(true, [
        { ...movieTarget, match: { resource_type: 'movie' } },
      ]))
      const result = await sync.syncFile('/downloads/app.exe', 'software')
      expect(result).toBeNull()
    })

    it('matches generic targets (no resource_type set)', async () => {
      const sync = new ArchiveSync(makeConfig(true, [genericTarget]))
      const result = await sync.syncFile('/downloads/file.mkv', 'movie')
      expect(result).not.toBeNull()
      expect(result!.target.name).toBe('NAS Generic')
    })

    it('matches specific resource_type targets', async () => {
      const sync = new ArchiveSync(makeConfig(true, [movieTarget]))
      const result = await sync.syncFile('/downloads/movie.mkv', 'movie')
      expect(result).not.toBeNull()
      expect(result!.target.path).toBe('/volume1/movies')
    })

    it('constructs remote path from basename', async () => {
      const sync = new ArchiveSync(makeConfig(true, [genericTarget]))
      const result = await sync.syncFile('/downloads/MyMovie.mkv', 'movie')
      expect(result!.remotePath).toBe('/volume1/downloads/MyMovie.mkv')
    })

    it('handles trailing slash in target path', async () => {
      const target = { ...genericTarget, path: '/volume1/downloads/' }
      const sync = new ArchiveSync(makeConfig(true, [target]))
      const result = await sync.syncFile('/downloads/file.mkv', 'movie')
      expect(result!.remotePath).not.toContain('//')
    })
  })

  describe('syncAll', () => {
    it('does nothing when archive is disabled', async () => {
      const sync = new ArchiveSync(makeConfig(false))
      await sync.syncAll(['a.mkv', 'b.mkv'], 'movie')
      // Should not throw
    })

    it('processes all files', async () => {
      const sync = new ArchiveSync(makeConfig(true, [genericTarget]))
      await sync.syncAll(['/downloads/a.mkv', '/downloads/b.mkv'], 'movie')
      // No throw means success
    })

    it('continues on individual file failure', async () => {
      const { exec } = await import('node:child_process')
      vi.mocked(exec).mockImplementationOnce(((
        _cmd: string, _opts: unknown, cb: unknown,
      ) => {
        if (typeof cb === 'function') cb(new Error('rsync failed'), null, '')
        return undefined
      }) as never)

      const sync = new ArchiveSync(makeConfig(true, [genericTarget]))
      await sync.syncAll(['/downloads/bad.mkv', '/downloads/good.mkv'], 'movie')
      // Should not throw despite first file failing
    })
  })

  describe('testConnection', () => {
    it('returns true on successful connection', async () => {
      const sync = new ArchiveSync(makeConfig(true))
      const result = await sync.testConnection(genericTarget)
      expect(result).toBe(true)
    })

    it('returns false on connection failure', async () => {
      const { exec } = await import('node:child_process')
      vi.mocked(exec).mockImplementationOnce(((
        _cmd: string, _opts: unknown, cb: unknown,
      ) => {
        if (typeof cb === 'function') cb(new Error('connection refused'), null, '')
        return undefined
      }) as never)

      const sync = new ArchiveSync(makeConfig(true))
      const result = await sync.testConnection(genericTarget)
      expect(result).toBe(false)
    })
  })
})
