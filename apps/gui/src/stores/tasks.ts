// src/stores/tasks.ts
// Pinia store for download task management.
// Integrates with useAria2 for real aria2 RPC tasks, with graceful
// fallback to a local in-memory task list when aria2 is not connected.

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
  eta: string
  type: TaskType
  filePath?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map an aria2 status string to our UI task status */
function mapAria2Status(status: string): TaskStatus {
  switch (status) {
    case 'active': return 'downloading'
    case 'complete': return 'completed'
    case 'paused': return 'paused'
    case 'error': return 'failed'
    case 'waiting': return 'pending'
    default: return 'pending'
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
  const filename = s.files?.[0]?.path?.split('/').pop()
    || s.bittorrent?.info?.name
    || `Task ${s.gid}`

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

  // -- local fallback state ----------------------------------------------
  /** Tasks created while aria2 is disconnected */
  const localTasks = ref<Task[]>([])

  /** Current UI filter: 'all' | 'downloading' | 'completed' | 'failed' */
  const activeFilter = ref<string>('all')

  /** Auto-incrementing id generator for local tasks */
  let nextLocalId = Date.now()

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
    return tasks.value.filter(t => t.status === activeFilter.value)
  })

  /** Number of tasks currently downloading */
  const activeCount = computed<number>(() =>
    tasks.value.filter(t => t.status === 'downloading').length,
  )

  /** Number of completed tasks */
  const completedCount = computed<number>(() =>
    tasks.value.filter(t => t.status === 'completed').length,
  )

  // -- actions ------------------------------------------------------------

  /**
   * Initialize the aria2 connection.
   *
   * Replicates the startup logic from useAria2's onMounted hook, which does
   * not fire inside a Pinia setup store. Must be called from a component's
   * onMounted hook.
   */
  async function init(): Promise<void> {
    if (aria2.connected.value || aria2.connecting.value) return

    // 1. Try to start the bundled aria2c via Tauri backend
    try {
      const { invoke } = await import("@tauri-apps/api/core")
      const diag = await invoke<{ exists: boolean; binary_path: string }>("check_aria2_binary")
      if (!diag.exists) {
        console.error("Bundled aria2c NOT FOUND at:", diag.binary_path)
      } else {
        await invoke<string>("start_aria2", { rpcPort: 6800 })
        console.warn("Bundled aria2c started")
      }
    } catch (e) {
      console.warn("Bundled aria2c failed:", e)
      // Fallback: try spawning a system aria2c
      try {
        await aria2.startAria2()
      } catch (_) {
        console.warn("System aria2c not available either")
      }
    }

    // 2. Connect to aria2 RPC (whether bundled or system)
    await aria2.connect()
  }

  /**
   * Add a download by URL or magnet link.
   * Delegates to aria2.addUri when connected, otherwise appends a local
   * placeholder task.
   *
   * @param url - HTTP(S) URL or magnet URI
   * @param name - Optional display name override
   */
  async function addTask(url: string, name?: string): Promise<void> {
    if (aria2.connected.value) {
      await aria2.addUri(url)
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

  /**
   * Remove a task by id.
   * Calls aria2.remove for real tasks, otherwise removes from local list.
   */
  async function removeTask(taskId: number): Promise<void> {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.remove(task.gid)
      } catch (e) {
        console.error('Failed to remove task via aria2:', e)
      }
    } else {
      localTasks.value = localTasks.value.filter(t => t.id !== taskId)
    }
  }

  /**
   * Pause a downloading task.
   */
  async function pauseTask(taskId: number): Promise<void> {
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.pause(task.gid)
      } catch (e) {
        console.error('Failed to pause task via aria2:', e)
      }
    } else {
      const local = localTasks.value.find(t => t.id === taskId)
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
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.unpause(task.gid)
      } catch (e) {
        console.error('Failed to resume task via aria2:', e)
      }
    } else {
      const local = localTasks.value.find(t => t.id === taskId)
      if (local) {
        local.status = 'downloading'
        local.speed = '—'
        local.eta = '计算中...'
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
    const task = tasks.value.find(t => t.id === taskId)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.remove(task.gid)
        await aria2.addUri(task.source)
      } catch (e) {
        console.error("Failed to retry task via aria2:", e)
      }
    } else {
      const local = localTasks.value.find(t => t.id === taskId)
      if (local) {
        local.status = "downloading"
        local.progress = 0
        local.speed = "—"
        local.eta = "计算中..."
      }
    }
  }

  /**
   * Remove all completed tasks from the local list and purge aria2 results.
   */
  async function clearCompleted(): Promise<void> {
    localTasks.value = localTasks.value.filter(t => t.status !== 'completed')

    if (aria2.connected.value) {
      try {
        await aria2.removeCompleted()
      } catch (e) {
        console.error('Failed to clear completed aria2 tasks:', e)
      }
    }
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
    addTask,
    removeTask,
    pauseTask,
    resumeTask,
    retryTask,
    clearCompleted,
    setFilter,
  }
})
