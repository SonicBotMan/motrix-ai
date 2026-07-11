// __tests__/post-processor.test.ts — Tests for PostProcessor
//
// Exercises the download post-processing pipeline: subtitle discovery,
// file renaming, classification, and archive sync with mocked deps.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PostProcessor, type PostProcessorDeps } from '../pipeline/post-processor.js'
import type { Task, AppConfig } from '../types.js'

// Mock fs
vi.mock('node:fs', () => ({
  promises: {
    rename: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
    access: vi.fn().mockRejectedValue(new Error('not found')),
  },
}))

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    source_query: 'test',
    uri: 'magnet:?xt=test',
    status: 'completed',
    priority: 3,
    progress: 100,
    speed: { down: 0, up: 0 },
    files: [{ name: 'movie.mkv', path: '/tmp/movie.mkv', size: 1000, completed: 1000 }],
    created_at: new Date(),
    retry_count: 0,
    ...overrides,
  }
}

function makeConfig(): AppConfig {
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
      enabled: true,
      preferred_languages: ['zh-Hans', 'en'],
      sources: { shooter: true, subhd: true, opensubtitles: false },
    },
    archive: { enabled: false, targets: [] },
  }
}

function makeDeps(): PostProcessorDeps {
  return {
    subtitleFinder: {
      findBest: vi.fn().mockResolvedValue({
        language: 'zh-Hans',
        path: '/tmp/movie.zh-Hans.srt',
        downloadUrl: 'data:text/plain;base64,SGVsbG8=',
        source: 'shooter',
      }),
    },
    fileRenamer: {
      generatePath: vi.fn().mockReturnValue('Movies/Test/Test.1080p.mkv'),
      generateSubtitlePath: vi.fn().mockReturnValue('/tmp/Test.zh-Hans.srt'),
    },
    fileOrganizer: {
      classify: vi.fn().mockReturnValue('movie'),
      organize: vi.fn().mockResolvedValue('/downloads/Movies/movie.mkv'),
      getTargetDir: vi.fn().mockReturnValue('/downloads/Movies'),
      moveFile: vi.fn().mockResolvedValue('/downloads/Movies/movie.mkv'),
    },
    templateEngine: {
      render: vi.fn().mockReturnValue('Test.1080p.mkv'),
      renderPath: vi.fn().mockReturnValue('Test/Test.1080p.mkv'),
      getTemplate: vi.fn().mockReturnValue('{title}.{quality}.{ext}'),
    },
    archiveSync: {
      syncFile: vi.fn().mockResolvedValue(null),
      syncAll: vi.fn().mockResolvedValue(undefined),
      testConnection: vi.fn().mockResolvedValue(true),
    },
  } as unknown as PostProcessorDeps
}

describe('PostProcessor', () => {
  let config: AppConfig
  let deps: PostProcessorDeps

  beforeEach(() => {
    config = makeConfig()
    deps = makeDeps()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('process', () => {
    it('returns a task with updated files', async () => {
      const processor = new PostProcessor(config, deps)
      const task = makeTask({
        intent: {
          title: 'Test',
          need_subtitle: false,
          search_keywords: ['Test'],
          resource_type: 'movie',
          quality: '1080p',
        },
      })
      const result = await processor.process(task)
      expect(result.files).toBeDefined()
      expect(result.files.length).toBeGreaterThan(0)
    })

    it('searches for subtitles when intent.need_subtitle is true', async () => {
      const processor = new PostProcessor(config, deps)
      const task = makeTask({
        intent: {
          title: 'Test',
          need_subtitle: true,
          search_keywords: ['Test'],
          resource_type: 'movie',
        },
      })
      const result = await processor.process(task)
      expect(deps.subtitleFinder.findBest).toHaveBeenCalled()
      expect(result.subtitle).toBeDefined()
    })

    it('does not search subtitles when need_subtitle is false', async () => {
      const processor = new PostProcessor(config, deps)
      const task = makeTask({
        intent: {
          title: 'Test',
          need_subtitle: false,
          search_keywords: ['Test'],
          resource_type: 'movie',
        },
      })
      const result = await processor.process(task)
      expect(deps.subtitleFinder.findBest).not.toHaveBeenCalled()
      expect(result.subtitle).toBeUndefined()
    })

    it('handles missing intent gracefully', async () => {
      const processor = new PostProcessor(config, deps)
      const task = makeTask({ intent: undefined })
      const result = await processor.process(task)
      expect(result.files).toBeDefined()
    })

    it('handles subtitle search failure gracefully', async () => {
      ;(deps.subtitleFinder as { findBest: { mockRejectedValue: (e: Error) => void } }).findBest.mockRejectedValue(
        new Error('network'),
      )
      const processor = new PostProcessor(config, deps)
      const task = makeTask({
        intent: {
          title: 'Test',
          need_subtitle: true,
          search_keywords: ['Test'],
          resource_type: 'movie',
        },
      })
      const result = await processor.process(task)
      expect(result.subtitle).toBeUndefined()
    })

    it('syncs to archive when enabled', async () => {
      config.archive.enabled = true
      config.archive.targets = [
        {
          name: 'NAS',
          host: 'nas@local',
          path: '/volume1/movies',
          match: {},
        },
      ]
      const processor = new PostProcessor(config, deps)
      const task = makeTask({
        intent: {
          title: 'Test',
          need_subtitle: false,
          search_keywords: ['Test'],
          resource_type: 'movie',
        },
      })
      await processor.process(task)
      expect(deps.archiveSync.syncFile).toHaveBeenCalled()
    })

    it('does not sync when archive is disabled', async () => {
      const processor = new PostProcessor(config, deps)
      const task = makeTask({
        intent: {
          title: 'Test',
          need_subtitle: false,
          search_keywords: ['Test'],
          resource_type: 'movie',
        },
      })
      await processor.process(task)
      expect(deps.archiveSync.syncFile).not.toHaveBeenCalled()
    })
  })
})
