// __tests__/queue-database.test.ts — Tests for TaskDatabase
//
// Uses an in-memory SQLite database (":memory:") so tests are hermetic
// and do not touch the user's ~/.motrix-ai/tasks.db file.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TaskDatabase } from '../queue/database.js'
import type { Task, DownloadIntent } from '../types.js'

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 10)}`,
    source_query: 'test query',
    intent: undefined,
    uri: 'magnet:?xt=urn:btih:abc',
    status: 'pending',
    priority: 3,
    progress: 0,
    speed: { down: 0, up: 0 },
    files: [{ name: 'movie.mkv', path: '/tmp/movie.mkv', size: 1000, completed: 0 }],
    subtitle: undefined,
    created_at: new Date('2026-01-01T00:00:00Z'),
    completed_at: undefined,
    retry_count: 0,
    error: undefined,
    aria2_gid: undefined,
    ...overrides,
  }
}

function makeIntent(): DownloadIntent {
  return {
    title: 'Test Movie',
    quality: '1080p',
    need_subtitle: false,
    search_keywords: ['test'],
    resource_type: 'movie',
    raw_input: 'test movie',
  }
}

describe('TaskDatabase', () => {
  let db: TaskDatabase

  beforeEach(() => {
    db = new TaskDatabase(':memory:')
    db.init()
  })

  afterEach(() => {
    db.close()
  })

  describe('init', () => {
    it('is idempotent (safe to call multiple times)', () => {
      expect(() => {
        db.init()
        db.init()
        db.init()
      }).not.toThrow()
    })
  })

  describe('insert + getById round-trip', () => {
    it('round-trips a minimal task without optional fields', () => {
      const task = makeTask()
      db.insert(task)
      const fetched = db.getById(task.id)
      expect(fetched).not.toBeNull()
      expect(fetched!.id).toBe(task.id)
      expect(fetched!.source_query).toBe(task.source_query)
      expect(fetched!.uri).toBe(task.uri)
      expect(fetched!.status).toBe('pending')
      expect(fetched!.priority).toBe(3)
      expect(fetched!.files).toEqual(task.files)
    })

    it('round-trips a task with intent (JSON serialisation)', () => {
      const task = makeTask({ intent: makeIntent() })
      db.insert(task)
      const fetched = db.getById(task.id)
      expect(fetched!.intent).toEqual(makeIntent())
    })

    it('round-trips a task with subtitle', () => {
      const task = makeTask({
        subtitle: {
          language: 'en',
          path: '/tmp/movie.srt',
          downloadUrl: 'https://example.com/sub.srt',
          source: 'opensubtitles',
        },
      })
      db.insert(task)
      const fetched = db.getById(task.id)
      expect(fetched!.subtitle).toEqual({
        language: 'en',
        path: '/tmp/movie.srt',
        downloadUrl: 'https://example.com/sub.srt',
        source: 'opensubtitles',
      })
    })

    it('round-trips dates (ISO string ↔ Date object)', () => {
      const created = new Date('2026-01-15T10:30:00Z')
      const completed = new Date('2026-01-15T12:00:00Z')
      const task = makeTask({ created_at: created, completed_at: completed })
      db.insert(task)
      const fetched = db.getById(task.id)
      expect(fetched!.created_at.toISOString()).toBe(created.toISOString())
      expect(fetched!.completed_at!.toISOString()).toBe(completed.toISOString())
    })

    it('round-trips aria2_gid, error, retry_count', () => {
      const task = makeTask({
        aria2_gid: 'gid-208234',
        error: 'connection reset',
        retry_count: 2,
        status: 'error',
      })
      db.insert(task)
      const fetched = db.getById(task.id)
      expect(fetched!.aria2_gid).toBe('gid-208234')
      expect(fetched!.error).toBe('connection reset')
      expect(fetched!.retry_count).toBe(2)
      expect(fetched!.status).toBe('error')
    })

    it('preserves speed.down / speed.up across serialisation', () => {
      const task = makeTask({ speed: { down: 1024, up: 256 } })
      db.insert(task)
      const fetched = db.getById(task.id)
      expect(fetched!.speed).toEqual({ down: 1024, up: 256 })
    })
  })

  describe('getById', () => {
    it('returns null for unknown id', () => {
      expect(db.getById('nonexistent')).toBeNull()
    })
  })

  describe('getAll', () => {
    it('returns tasks ordered by created_at ASC', () => {
      const t1 = makeTask({ id: 'old', created_at: new Date('2026-01-01T00:00:00Z') })
      const t2 = makeTask({ id: 'mid', created_at: new Date('2026-01-02T00:00:00Z') })
      const t3 = makeTask({ id: 'new', created_at: new Date('2026-01-03T00:00:00Z') })
      db.insert(t3)
      db.insert(t1)
      db.insert(t2)
      const all = db.getAll()
      expect(all.map((t) => t.id)).toEqual(['old', 'mid', 'new'])
    })

    it('returns empty array when table is empty', () => {
      expect(db.getAll()).toEqual([])
    })
  })

  describe('getByStatus', () => {
    it('returns only tasks matching the status', () => {
      db.insert(makeTask({ id: 'a', status: 'downloading' }))
      db.insert(makeTask({ id: 'b', status: 'completed' }))
      db.insert(makeTask({ id: 'c', status: 'downloading' }))
      const downloading = db.getByStatus('downloading')
      expect(downloading).toHaveLength(2)
      expect(downloading.map((t) => t.id).sort()).toEqual(['a', 'c'])
    })
  })

  describe('update', () => {
    it('updates status only', () => {
      const task = makeTask()
      db.insert(task)
      db.update(task.id, { status: 'completed' })
      expect(db.getById(task.id)!.status).toBe('completed')
    })

    it('updates progress only', () => {
      const task = makeTask()
      db.insert(task)
      db.update(task.id, { progress: 75.5 })
      expect(db.getById(task.id)!.progress).toBe(75.5)
    })

    it('updates speed.down and speed.up together', () => {
      const task = makeTask()
      db.insert(task)
      db.update(task.id, { speed: { down: 500, up: 50 } })
      expect(db.getById(task.id)!.speed).toEqual({ down: 500, up: 50 })
    })

    it('updates intent (JSON re-serialisation)', () => {
      const task = makeTask()
      db.insert(task)
      db.update(task.id, { intent: makeIntent() })
      expect(db.getById(task.id)!.intent).toEqual(makeIntent())
    })

    it('updates priority', () => {
      const task = makeTask()
      db.insert(task)
      db.update(task.id, { priority: 1 })
      expect(db.getById(task.id)!.priority).toBe(1)
    })

    it('updates completed_at to a Date', () => {
      const task = makeTask()
      db.insert(task)
      const finished = new Date('2026-02-01T00:00:00Z')
      db.update(task.id, { completed_at: finished, status: 'completed' })
      const fetched = db.getById(task.id)
      expect(fetched!.completed_at!.toISOString()).toBe(finished.toISOString())
      expect(fetched!.status).toBe('completed')
    })

    it('updates aria2_gid (null-aware)', () => {
      const task = makeTask({ aria2_gid: 'old-gid' })
      db.insert(task)
      db.update(task.id, { aria2_gid: 'new-gid' })
      expect(db.getById(task.id)!.aria2_gid).toBe('new-gid')
    })

    it('treats update with undefined field as no-op (Partial<Task> cannot clear via undefined)', () => {
      const task = makeTask({ error: 'first failure' })
      db.insert(task)
      // partial.error === undefined means "field not provided", not "set to undefined".
      // The update() guard `if (partial.error !== undefined)` skips this branch,
      // so the existing error value is preserved. (To clear a nullable field the
      // caller would need a separate explicit null API — currently not exposed.)
      db.update(task.id, { error: undefined })
      expect(db.getById(task.id)!.error).toBe('first failure')
    })

    it('is a no-op when partial is empty', () => {
      const task = makeTask({ status: 'downloading' })
      db.insert(task)
      db.update(task.id, {})
      expect(db.getById(task.id)!.status).toBe('downloading')
    })

    it('silently ignores updates to unknown id (no row affected)', () => {
      expect(() => db.update('nonexistent', { status: 'completed' })).not.toThrow()
    })
  })

  describe('delete', () => {
    it('removes a task by id', () => {
      const task = makeTask()
      db.insert(task)
      db.delete(task.id)
      expect(db.getById(task.id)).toBeNull()
    })

    it('does not throw when deleting unknown id', () => {
      expect(() => db.delete('nonexistent')).not.toThrow()
    })
  })

  describe('persistence semantics', () => {
    it('survives across multiple insert/update cycles on the same db', () => {
      const t1 = makeTask({ id: 'task1', status: 'pending' })
      db.insert(t1)
      db.update('task1', { status: 'downloading', progress: 50 })
      db.update('task1', { progress: 100, status: 'completed' })
      const fetched = db.getById('task1')
      expect(fetched!.status).toBe('completed')
      expect(fetched!.progress).toBe(100)
    })
  })
})
