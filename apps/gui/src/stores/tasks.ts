// src/stores/tasks.ts
// Pinia store for download task management.
// Integrates with useAria2 for real aria2 RPC tasks, with graceful
// fallback to a local in-memory task list when aria2 is not connected.
//
// Post-download pipeline (registered once on init):
//   aria2 task → status='complete' → trigger:
//     1. Desktop notification (send_notification)
//     2. File organize (organize_file with intent metadata)
//     3. Subtitle search (lazy load useSubtitle, only for video + need_subtitle)

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAria2, type Aria2Status } from '@/composables/useAria2'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Display-friendly task status used throughout the GUI */
export type TaskStatus = 'downloading' | 'completed' | 'paused' | 'failed' | 'pending'

/** File/media category derived from the filename extension */
export type TaskType = 'video' | 'audio' | 'document' | 'archive' | 'torrent'

/** Normalized task representation consumed by the UI layer */
export interface Task {
  id: number
  gid?: string
  name: string
  source: string
  status: TaskStatus
  progress: number
  speed: string
  size: string
  total?: string
  eta: string
  type: TaskType
  filePath?: string
}

/**
 * Metadata describing the user's intent when they added a download.
 *
 * Captured at `addTask()` time and looked up by GID when the download
 * completes, so the post-download pipeline can name files correctly
 * (`Movie.Title.2010.1080p.mkv` instead of `abc123.tmp`) and decide
 * whether to search for subtitles.
 */
export interface DownloadIntentMeta {
  /** Clean human-readable title (e.g. "Inception"). */
  title: string
  /** Release year if known. */
  year?: number | null
  /** Quality bucket: "4K" | "1080p" | "720p" | "other". */
  quality?: string
  /** Resource type: "movie" | "tv" | "anime" | "music" | "software" | "other". */
  resourceType?: string
  /** True if the user asked for subtitles (e.g. "中字" / "subtitle" in input). */
  needSubtitle?: boolean
}

// ---------------------------------------------------------------------------
// Module-level state (outside the store so it survives HMR / re-init)
// ---------------------------------------------------------------------------

/**
 * Map of in-flight aria2 GID → the intent metadata captured when the
 * download was added. Entries are removed once the post-download pipeline
 * finishes (success or failure) so memory does not grow unbounded.
 */
const intentByGid = new Map<string, DownloadIntentMeta>()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map an aria2 status string to our UI task status */
function mapAria2Status(status: string): TaskStatus {
  switch (status) {
    case 'active':
      return 'downloading'
    case 'complete':
      return 'completed'
    case 'paused':
      return 'paused'
    case 'error':
      return 'failed'
    case 'waiting':
      return 'pending'
    case 'removed':
      return 'failed'
    default:
      return 'pending'
  }
}

/** Infer the file/media category from a filename extension */
function getTypeFromFilename(filename: string): TaskType {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['mkv', 'mp4', 'avi', 'mov', 'wmv'].includes(ext)) return 'video'
  if (['mp3', 'flac', 'wav', 'aac', 'ogg'].includes(ext)) return 'audio'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (ext === 'torrent') return 'torrent'
  return 'document'
}

/** Convert a raw aria2 status object into the normalized Task shape */
function fromAria2Status(s: Aria2Status, idx: number): Task {
  const total = Number(s.totalLength) || 0
  const completed = Number(s.completedLength) || 0
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const speed = Number(s.downloadSpeed) || 0
  const filename = s.files?.[0]?.path?.split('/').pop() || s.bittorrent?.info?.name || `Task ${s.gid}`

  return {
    id: idx + 1,
    gid: s.gid,
    name: filename,
    source: s.files?.[0]?.uris?.[0]?.uri || 'magnet:?xt=urn:btih:...',
    status: mapAria2Status(s.status),
    progress,
    speed: speed > 0 ? `${(speed / 1024 / 1024).toFixed(1)} MB/s` : '—',
    size: `${(completed / 1024 / 1024).toFixed(0)} MB / ${(total / 1024 / 1024).toFixed(0)} MB`,
    eta: speed > 0 && total > completed ? `${Math.round((total - completed) / speed)}s` : '—',
    type: getTypeFromFilename(filename),
    filePath: s.files?.[0]?.path,
  }
}

/** True if the file extension looks like a video format we can find subtitles for. */
const VIDEO_EXTS = new Set(['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'ts', 'm4v'])
function isVideoPath(filePath: string | undefined): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return VIDEO_EXTS.has(ext)
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Pinia store managing the full lifecycle of download tasks.
 *
 * When aria2 is connected the store reflects real RPC tasks polled by
 * `useAria2`. When aria2 is unavailable the store falls back to a local
 * in-memory list so the UI remains interactive.
 */
export const useTasksStore = defineStore('tasks', () => {
  // -- aria2 integration --------------------------------------------------
  const aria2 = useAria2()

  // -- local fallback state ----------------------------------------------
  const localTasks = ref<Task[]>([])
  const activeFilter = ref<string>('all')
  let nextLocalId = Date.now()

  // -- pipeline registration guard ---------------------------------------
  // `onTaskComplete` listener must only be registered once per process;
  // otherwise repeated init()/dispose() cycles would stack listeners and
  // fire the pipeline N times for the same task.
  let pipelineRegistered = false

  // -- getters -----------------------------------------------------------

  const tasks = computed<Task[]>(() => {
    if (aria2.connected.value && aria2.tasks.value.length > 0) {
      return aria2.tasks.value.map((s, i) => fromAria2Status(s, i))
    }
    return localTasks.value
  })

  const filteredTasks = computed<Task[]>(() => {
    if (activeFilter.value === 'all') return tasks.value
    return tasks.value.filter((t) => t.status === activeFilter.value)
  })

  const activeCount = computed<number>(() => tasks.value.filter((t) => t.status === 'downloading').length)

  const completedCount = computed<number>(() => tasks.value.filter((t) => t.status === 'completed').length)

  // -- actions -----------------------------------------------------------

  /**
   * Initialize the aria2 connection and register the post-download pipeline.
   *
   * Safe to call multiple times — the pipeline listener is only registered
   * on the first call, and subsequent calls skip aria2 startup if already
   * connected.
   */
  async function init(): Promise<void> {
    if (aria2.connected.value || aria2.connecting.value) {
      registerPipeline()
      return
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core')
      const diag = await invoke<{ exists: boolean; binary_path: string }>('check_aria2_binary')
      if (!diag.exists) {
        console.error('Bundled aria2c NOT FOUND at:', diag.binary_path)
      } else {
        await invoke<string>('start_aria2', { rpcPort: 6800 })
      }
    } catch (e) {
      console.warn('Bundled aria2c failed:', e)
      try {
        await aria2.startAria2()
      } catch (_) {
        console.warn('System aria2c not available either')
      }
    }

    await aria2.connect()
    registerPipeline()
  }

  /**
   * Register the post-download pipeline on the aria2 singleton.
   *
   * Idempotent — checks the `pipelineRegistered` flag so repeated `init()`
   * calls do not stack listeners.
   */
  function registerPipeline(): void {
    if (pipelineRegistered) return
    aria2.onTaskComplete(async (task: Aria2Status) => {
      const intent = intentByGid.get(task.gid)
      try {
        await runPostDownloadPipeline(task, intent)
      } catch (e) {
        console.error('[tasks] Post-download pipeline failed:', e)
      } finally {
        intentByGid.delete(task.gid)
      }
    })
    pipelineRegistered = true
  }

  /**
   * Run the post-download pipeline for a single completed task.
   *
   * Each stage is independently try/caught so a failure in one (e.g.
   * subtitle API down) does not skip later stages or break the next
   * completion event.
   */
  async function runPostDownloadPipeline(task: Aria2Status, intent: DownloadIntentMeta | undefined): Promise<void> {
    const filePath = task.files?.[0]?.path
    const filename = filePath?.split('/').pop() || task.gid

    // 1. Desktop notification
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('send_notification', {
        title: 'Download complete',
        body: intent?.title ? `${intent.title} — ${filename}` : filename,
      })
    } catch (e) {
      console.warn('[tasks] Notification failed:', e)
    }

    // 2. Organize file using intent metadata (rename + relocate)
    if (filePath && intent) {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke<string>('organize_file', {
          filePath,
          title: intent.title,
          year: intent.year ?? null,
          quality: intent.quality ?? null,
          resourceType: intent.resourceType ?? null,
        })
      } catch (e) {
        console.warn('[tasks] File organize failed:', e)
      }
    }

    // 3. Subtitle search (video + need_subtitle flag + API key configured)
    if (intent?.needSubtitle && isVideoPath(filePath)) {
      try {
        const { useSubtitle, hasApiKey } = await import('@/composables/useSubtitle')
        if (!hasApiKey()) {
          console.warn('[tasks] Skipping subtitle search: no OpenSubtitles API key configured')
        } else {
          const subtitle = useSubtitle()
          const query = intent.title
          await subtitle.searchSubtitles(query)
          const best = subtitle.getBestSubtitle()
          if (best) {
            console.warn(`[tasks] Subtitle found: ${best.fileName}`)
          } else {
            console.warn('[tasks] No matching subtitle found')
          }
        }
      } catch (e) {
        console.warn('[tasks] Subtitle search failed:', e)
      }
    }
  }

  /**
   * Add a download by URL or magnet link.
   *
   * When `intent` is provided, the metadata is captured in `intentByGid`
   * keyed by the returned aria2 GID. When the download completes, the
   * post-download pipeline uses this metadata to name and organize the file.
   *
   * @param url - HTTP(S) URL or magnet URI
   * @param name - Optional display name override (used for local fallback only)
   * @param intent - Optional intent metadata for post-download processing
   */
  async function addTask(url: string, name?: string, intent?: DownloadIntentMeta): Promise<void> {
    if (aria2.connected.value) {
      const gid = await aria2.addUri(url)
      if (intent && gid) {
        intentByGid.set(gid, intent)
      }
      return
    }
    // Fallback: create a local task so the user sees immediate feedback
    localTasks.value.unshift({
      id: ++nextLocalId,
      name: name || url.split('/').pop()?.split('?')[0] || url.substring(0, 40),
      source: url,
      status: 'downloading',
      progress: 0,
      speed: '—',
      size: '等待中...',
      eta: '—',
      type: getTypeFromFilename(url),
    })
  }

  /** Remove a task by id. */
  async function removeTask(taskId: number): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.remove(task.gid)
        intentByGid.delete(task.gid)
      } catch (e) {
        console.error('Failed to remove task via aria2:', e)
      }
    } else {
      localTasks.value = localTasks.value.filter((t) => t.id !== taskId)
    }
  }

  /** Pause a downloading task. */
  async function pauseTask(taskId: number): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.pause(task.gid)
      } catch (e) {
        console.error('Failed to pause task via aria2:', e)
      }
    } else {
      const local = localTasks.value.find((t) => t.id === taskId)
      if (local) {
        local.status = 'paused'
        local.speed = '—'
        local.eta = '—'
      }
    }
  }

  /** Resume a paused task. */
  async function resumeTask(taskId: number): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.unpause(task.gid)
      } catch (e) {
        console.error('Failed to resume task via aria2:', e)
      }
    } else {
      const local = localTasks.value.find((t) => t.id === taskId)
      if (local) {
        local.status = 'downloading'
        local.speed = '—'
        local.eta = '计算中...'
      }
    }
  }

  /** Retry a failed task by removing it and re-submitting the source URL. */
  async function retryTask(taskId: number): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.remove(task.gid)
        // Preserve intent across retry so the post-download pipeline still fires.
        const intent = intentByGid.get(task.gid)
        intentByGid.delete(task.gid)
        const newGid = await aria2.addUri(task.source)
        if (intent && newGid) {
          intentByGid.set(newGid, intent)
        }
      } catch (e) {
        console.error('Failed to retry task via aria2:', e)
      }
    } else {
      const local = localTasks.value.find((t) => t.id === taskId)
      if (local) {
        local.status = 'downloading'
        local.progress = 0
        local.speed = '—'
        local.eta = '计算中...'
      }
    }
  }

  /**
   * Bump a task's priority in the aria2 queue by moving it to the top.
   *
   * Uses `aria2.changePosition(gid, 0, POS_SET)` — a real RPC method —
   * instead of the unregistered `aria2_change_option` command that
   * TaskFirstView previously called and silently swallowed.
   *
   * Returns true on success so callers can show accurate UI feedback.
   */
  async function bumpPriority(taskId: number): Promise<boolean> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return false
    if (!task.gid || !aria2.connected.value) return false
    try {
      await aria2.moveToTop(task.gid)
      return true
    } catch (e) {
      console.error('Failed to bump priority via aria2:', e)
      return false
    }
  }

  /** Remove all completed tasks from the local list and purge aria2 results. */
  async function clearCompleted(): Promise<void> {
    localTasks.value = localTasks.value.filter((t) => t.status !== 'completed')

    if (aria2.connected.value) {
      try {
        await aria2.removeCompleted()
      } catch (e) {
        console.error('Failed to clear completed aria2 tasks:', e)
      }
    }
  }

  /** Set the active filter for the task list. */
  function setFilter(filter: string): void {
    activeFilter.value = filter
  }

  /** Test-only: clear the pipeline guard so a fresh init() re-registers. */
  function _resetPipelineForTests(): void {
    pipelineRegistered = false
    intentByGid.clear()
  }

  return {
    // state
    localTasks,
    activeFilter,
    // getters
    tasks,
    filteredTasks,
    activeCount,
    completedCount,
    // aria2 reactive refs (for convenience in components)
    aria2Connected: aria2.connected,
    aria2Connecting: aria2.connecting,
    aria2Running: aria2.aria2Running,
    globalStat: aria2.globalStat,
    // events
    onConnectionChange: aria2.onConnectionChange,
    onTaskComplete: aria2.onTaskComplete,
    // actions
    init,
    addTask,
    removeTask,
    pauseTask,
    resumeTask,
    retryTask,
    bumpPriority,
    clearCompleted,
    setFilter,
    // test helpers (not for production use)
    _resetPipelineForTests,
  }
})
