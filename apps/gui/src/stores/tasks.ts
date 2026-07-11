// src/stores/tasks.ts
// Pinia store for download task management.
// Integrates with useAria2 for real aria2 RPC tasks, with graceful
// fallback to a local in-memory task list when aria2 is not connected.

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAria2, type Aria2Status } from '@/composables/useAria2'
import { useConfigStore } from '@/stores/config'
import { formatSpeed, formatSizeProgress, formatEta, timeRemaining } from '@/shared/utils/format'

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
  errorMessage?: string
  seeders?: number
  files?: Array<{ name: string; size: number; path: string; selected: boolean }>
  connections?: string
}

/** Intent metadata associated with a download for file organization */
export interface DownloadIntentMeta {
  title?: string
  year?: number
  quality?: string
  resourceType?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a filename looks like a video file based on extension. */
function isVideoFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'ts', 'm4v'].includes(ext)
}

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
    source: s.files?.[0]?.uris?.[0]?.uri || (s.bittorrent?.info?.name ? `torrent://${s.bittorrent.info.name}` : ''),
    status: mapAria2Status(s.status),
    progress,
    speed: formatSpeed(speed),
    size: formatSizeProgress(completed, total),
    eta: formatEta(timeRemaining(total, completed, speed)),
    type: getTypeFromFilename(filename),
    filePath: s.files?.[0]?.path,
    errorMessage: s.errorMessage,
    seeders: s.numSeeders ? Number(s.numSeeders) : undefined,
    connections: s.connections,
    files: s.files?.map((f) => ({
      name: f.path?.split('/').pop() || f.path || '',
      size: Number(f.length) || 0,
      path: f.path || '',
      selected: f.selected !== 'false',
    })),
  }
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
  // useAria2 is instantiated once; its onMounted/onUnmounted hooks are
  // no-ops inside a Pinia setup store so we expose an explicit init().
  const aria2 = useAria2()
  const configStore = useConfigStore()

  // -- local fallback state ----------------------------------------------
  /** Tasks created while aria2 is disconnected */
  const localTasks = ref<Task[]>([])

  /** Current UI filter: 'all' | 'downloading' | 'completed' | 'failed' */
  const activeFilter = ref<string>('all')

  /** Auto-incrementing id generator for local tasks */
  let nextLocalId = Date.now()

  /** GID → intent metadata mapping, so organize_file gets proper title/quality */
  const intentByGid = new Map<string, DownloadIntentMeta>()

  // -- getters ------------------------------------------------------------

  /**
   * Merged view of all tasks.
   * Uses mapped aria2 tasks when available, otherwise the local list.
   */
  const tasks = computed<Task[]>(() => {
    if (aria2.connected.value && aria2.tasks.value.length > 0) {
      return aria2.tasks.value.map((s, i) => fromAria2Status(s, i))
    }
    return localTasks.value
  })

  /** Tasks filtered by the active filter */
  const filteredTasks = computed<Task[]>(() => {
    if (activeFilter.value === 'all') return tasks.value
    return tasks.value.filter((t) => t.status === activeFilter.value)
  })

  /** Number of tasks currently downloading */
  const activeCount = computed<number>(() => tasks.value.filter((t) => t.status === 'downloading').length)

  /** Number of completed tasks */
  const completedCount = computed<number>(() => tasks.value.filter((t) => t.status === 'completed').length)

  // -- actions ------------------------------------------------------------

  /** Tracks whether the post-download pipeline listener has been registered. */
  let pipelineRegistered = false

  /**
   * Boot the aria2 connection. Delegates to the useAria2 singleton's
   * `start()` which handles bundled-binary startup, system-binary
   * fallback, and the polling-loop/connect sequence. Idempotent.
   *
   * The pipeline listener is registered only once — subsequent calls
   * (e.g. from route navigation) skip re-registration to prevent
   * duplicate notifications and file operations on download completion.
   */
  async function init(): Promise<void> {
    await aria2.start()
    if (!pipelineRegistered) {
      registerPostDownloadPipeline()
      pipelineRegistered = true
    }
  }

  /**
   * Post-download pipeline: notification + file organize + subtitle search.
   * Registered once on init() so every view benefits automatically.
   * Previously this lived only in MainView (/legacy), meaning the default
   * TaskFirstView (/) had zero post-download feedback.
   */
  function registerPostDownloadPipeline(): void {
    aria2.onTaskComplete(async (task) => {
      const filename = task.files?.[0]?.path?.split('/').pop() || task.bittorrent?.info?.name || task.gid
      const filePath = task.files?.[0]?.path

      // 1. Desktop notification
      try {
        const { isPermissionGranted, requestPermission, sendNotification } =
          await import('@tauri-apps/plugin-notification')
        let granted = await isPermissionGranted()
        if (!granted) granted = (await requestPermission()) === 'granted'
        if (granted) sendNotification({ title: 'Download complete', body: filename })
      } catch (e) {
        console.warn('Notification failed:', e)
      }

      // 2. Auto-organize with intent metadata if available
      if (filePath) {
        try {
          const meta = intentByGid.get(task.gid) || {}
          const { invoke } = await import('@tauri-apps/api/core')
          await invoke<string>('organize_file', {
            filePath,
            title: meta.title,
            year: meta.year,
            quality: meta.quality,
            resourceType: meta.resourceType,
          })
          intentByGid.delete(task.gid)
        } catch (e) {
          console.warn('Auto-organize failed:', e)
        }
      }

      // 3. Auto-search subtitles for video files
      if (filePath && isVideoFile(filename)) {
        try {
          if (configStore.config.subtitles.auto_search) {
            const apiKey = configStore.config.subtitles.opensubtitles_api_key || ''
            if (apiKey) {
              const langsArr = configStore.config.subtitles.preferred_languages
              const langs = langsArr.length > 0 ? langsArr.join(',') : undefined
              const { invoke } = await import('@tauri-apps/api/core')
              await invoke('opensubtitles_search', {
                apiKey,
                query: filename.replace(/\.[^.]+$/, ''),
                languages: langs,
              })
            }
          }
        } catch (e) {
          console.warn('Subtitle search failed:', e)
        }
      }
    })
  }

  /**
   * Tear down the aria2 connection and stop the bundled daemon.
   * Call once from the app shell's onUnmounted so we don't leak the
   * aria2c process when the user quits the app.
   */
  async function dispose(): Promise<void> {
    await aria2.dispose()
  }

  /**
   * Add a download by URL or magnet link.
   * Delegates to aria2.addUri when connected, otherwise appends a local
   * placeholder task.
   *
   * @param url - HTTP(S) URL or magnet URI
   * @param name - Optional display name override
   */
  async function addTask(url: string, name?: string, intent?: DownloadIntentMeta): Promise<void> {
    if (aria2.connected.value) {
      const opts: Record<string, string> = {}
      const dir = configStore.config.downloads.base_dir
      if (dir.trim()) {
        let resolvedDir = dir
        if (dir === '~' || dir.startsWith('~/') || dir.startsWith('~\\')) {
          try {
            const { homeDir } = await import('@tauri-apps/api/path')
            const home = await homeDir()
            resolvedDir = dir === '~' ? home : home + dir.slice(1)
          } catch {
            /* not in Tauri context */
          }
        }
        opts.dir = resolvedDir
      }
      const gid = Object.keys(opts).length > 0 ? await aria2.addUri(url, opts) : await aria2.addUri(url)
      if (intent && gid) intentByGid.set(gid, intent)
      return
    }
    // Fallback: create a local task so the user sees immediate feedback
    localTasks.value.unshift({
      id: ++nextLocalId,
      name: name || url.split('/').pop()?.split('?')[0] || url.substring(0, 40),
      source: url,
      status: 'downloading',
      progress: 0,
      speed: '\u2014',
      size: '\u2014',
      eta: '\u2014',
      type: getTypeFromFilename(url),
    })
  }

  /**
   * Remove a task by id.
   * Calls aria2.remove for real tasks, otherwise removes from local list.
   */
  async function removeTask(taskId: number): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.remove(task.gid)
      } catch (e) {
        console.error('Failed to remove task via aria2:', e)
      }
    } else {
      localTasks.value = localTasks.value.filter((t) => t.id !== taskId)
    }
  }

  /**
   * Pause a downloading task.
   */
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

  /**
   * Resume a paused task.
   */
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
        local.speed = '\u2014'
        local.eta = '\u2014'
      }
    }
  }

  /**
   * Retry a failed task.
   *
   * For real aria2 tasks the old download is removed and the source URI is
   * re-submitted so aria2 starts fresh. For local placeholder tasks the
   * status is simply reset.
   */
  async function retryTask(taskId: number): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.remove(task.gid)
        if (task.source.startsWith('magnet:') || /^https?:\/\//.test(task.source) || task.source.startsWith('ftp://')) {
          await aria2.addUri(task.source)
        } else {
          throw new Error('Cannot retry BitTorrent task without original magnet or HTTP URL')
        }
      } catch (e) {
        console.error('Failed to retry task via aria2:', e)
        throw e
      }
    } else {
      const local = localTasks.value.find((t) => t.id === taskId)
      if (local) {
        local.status = 'downloading'
        local.progress = 0
        local.speed = '\u2014'
        local.eta = '\u2014'
      }
    }
  }

  /**
   * Remove all completed tasks from the local list and purge aria2 results.
   */
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

  /**
   * Bump a task's priority in aria2 by setting `priority=pri-high`.
   * No-op for local placeholder tasks (no gid).
   */
  async function bumpPriority(taskId: number): Promise<void> {
    const task = tasks.value.find((t) => t.id === taskId)
    if (!task) return
    if (!task.gid || !aria2.connected.value) {
      throw new Error('Task is not connected to aria2')
    }
    // aria2's `priority` option accepts: pri-low, pri-normal, pri-high.
    await aria2.changeOption(task.gid, { priority: 'pri-high' })
  }

  /**
   * Set the active filter for the task list.
   * @param filter - 'all' | 'downloading' | 'completed' | 'paused' | 'failed'
   */
  function setFilter(filter: string): void {
    activeFilter.value = filter
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
    dispose,
    addTask,
    removeTask,
    pauseTask,
    resumeTask,
    retryTask,
    bumpPriority,
    clearCompleted,
    setFilter,
  }
})
