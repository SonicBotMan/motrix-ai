// src/stores/tasks.ts
// Pinia store for download task management.
// Integrates with useAria2 for real aria2 RPC tasks, with graceful
// fallback to a local in-memory task list when aria2 is not connected.

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAria2, type Aria2Status } from '@/composables/useAria2'
import { useConfigStore } from '@/stores/config'
import { formatSpeed, formatSizeProgress, formatEta, timeRemaining } from '@/shared/utils/format'
import { createLogger } from '@motrix-ai/core/browser'

const logger = createLogger('tasks')

export type TaskStatus = 'downloading' | 'completed' | 'paused' | 'failed' | 'pending'

export type TaskType = 'video' | 'audio' | 'document' | 'archive' | 'torrent'

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

export interface DownloadIntentMeta {
  title?: string
  year?: number
  quality?: string
  resourceType?: string
}

function isVideoFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'ts', 'm4v'].includes(ext)
}

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

function getTypeFromFilename(filename: string): TaskType {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['mkv', 'mp4', 'avi', 'mov', 'wmv', 'flv', 'ts', 'm4v'].includes(ext)) return 'video'
  if (['mp3', 'flac', 'wav', 'aac', 'ogg'].includes(ext)) return 'audio'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (ext === 'torrent') return 'torrent'
  return 'document'
}

const gidToId = new Map<string, number>()
let nextAria2Id = 1

export function _resetGidMapForTesting(): void {
  gidToId.clear()
  nextAria2Id = 1
}

function fromAria2Status(s: Aria2Status): Task {
  const total = Number(s.totalLength) || 0
  const completed = Number(s.completedLength) || 0
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const speed = Number(s.downloadSpeed) || 0
  const filename = s.files?.[0]?.path?.split('/').pop() || s.bittorrent?.info?.name || `Task ${s.gid}`

  let id = gidToId.get(s.gid)
  if (id === undefined) {
    id = nextAria2Id++
    gidToId.set(s.gid, id)
  }

  return {
    id,
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

export const useTasksStore = defineStore('tasks', () => {
  const aria2 = useAria2()
  const configStore = useConfigStore()

  const localTasks = ref<Task[]>([])
  const activeFilter = ref<string>('all')
  let nextLocalId = Date.now()
  const intentByGid = new Map<string, DownloadIntentMeta>()

  const tasks = computed<Task[]>(() => {
    if (aria2.connected.value && aria2.tasks.value.length > 0) {
      return aria2.tasks.value.map((s) => fromAria2Status(s))
    }
    return localTasks.value
  })

  const filteredTasks = computed<Task[]>(() => {
    if (activeFilter.value === 'all') return tasks.value
    return tasks.value.filter((t) => t.status === activeFilter.value)
  })

  const activeCount = computed<number>(() => tasks.value.filter((t) => t.status === 'downloading').length)
  const completedCount = computed<number>(() => tasks.value.filter((t) => t.status === 'completed').length)

  let pipelineRegistered = false

  async function init(): Promise<void> {
    await aria2.start()
    localTasks.value = []
    if (!pipelineRegistered) {
      registerPostDownloadPipeline()
      pipelineRegistered = true
    }
  }

  function registerPostDownloadPipeline(): void {
    aria2.onTaskComplete(async (task) => {
      const filename = task.files?.[0]?.path?.split('/').pop() || task.bittorrent?.info?.name || task.gid
      const filePath = task.files?.[0]?.path

      try {
        const { isPermissionGranted, requestPermission, sendNotification } =
          await import('@tauri-apps/plugin-notification')
        let granted = await isPermissionGranted()
        if (!granted) granted = (await requestPermission()) === 'granted'
        if (granted) sendNotification({ title: 'Download complete', body: filename })
      } catch (e) {
        logger.warn('Notification failed: ' + e)
      }

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
          logger.warn('Auto-organize failed: ' + e)
        }
      }

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
          logger.warn('Subtitle search failed: ' + e)
        }
      }
    })
  }

  async function dispose(): Promise<void> {
    await aria2.dispose()
  }

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

  function findByGid(gid: string): Task | undefined {
    return tasks.value.find((t) => t.gid === gid || String(t.id) === gid)
  }

  async function removeTask(gid: string): Promise<void> {
    const task = findByGid(gid)
    if (!task) {
      const localIdx = localTasks.value.findIndex((t) => t.gid === gid || String(t.id) === gid)
      if (localIdx >= 0) localTasks.value.splice(localIdx, 1)
      return
    }

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.remove(task.gid)
      } catch (e) {
        logger.error('Failed to remove task: ' + e)
      }
    } else {
      localTasks.value = localTasks.value.filter((t) => t.id !== task.id)
    }
  }

  async function pauseTask(gid: string): Promise<void> {
    const task = findByGid(gid)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.pause(task.gid)
      } catch (e) {
        logger.error('Failed to pause task: ' + e)
      }
    } else {
      const local = localTasks.value.find((t) => t.id === task.id)
      if (local) {
        local.status = 'paused'
        local.speed = '\u2014'
        local.eta = '\u2014'
      }
    }
  }

  async function resumeTask(gid: string): Promise<void> {
    const task = findByGid(gid)
    if (!task) return

    if (task.gid && aria2.connected.value) {
      try {
        await aria2.unpause(task.gid)
      } catch (e) {
        logger.error('Failed to resume task: ' + e)
      }
    } else {
      const local = localTasks.value.find((t) => t.id === task.id)
      if (local) {
        local.status = 'downloading'
        local.speed = '\u2014'
        local.eta = '\u2014'
      }
    }
  }

  async function retryTask(gid: string): Promise<void> {
    const task = findByGid(gid)
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
        logger.error('Failed to retry task: ' + e)
        throw e
      }
    } else {
      const local = localTasks.value.find((t) => t.id === task.id)
      if (local) {
        local.status = 'downloading'
        local.progress = 0
        local.speed = '\u2014'
        local.eta = '\u2014'
      }
    }
  }

  async function clearCompleted(): Promise<void> {
    localTasks.value = localTasks.value.filter((t) => t.status !== 'completed')
    if (aria2.connected.value) {
      try {
        await aria2.removeCompleted()
      } catch (e) {
        logger.error('Failed to clear completed: ' + e)
      }
    }
  }

  async function bumpPriority(gid: string): Promise<void> {
    const task = findByGid(gid)
    if (!task) return
    if (!task.gid || !aria2.connected.value) {
      throw new Error('Task is not connected to aria2')
    }
    await aria2.changeOption(task.gid, { priority: 'pri-high' })
  }

  function setFilter(filter: string): void {
    activeFilter.value = filter
  }

  return {
    localTasks,
    activeFilter,
    tasks,
    filteredTasks,
    activeCount,
    completedCount,
    aria2Connected: aria2.connected,
    aria2Connecting: aria2.connecting,
    aria2Running: aria2.aria2Running,
    globalStat: aria2.globalStat,
    onConnectionChange: aria2.onConnectionChange,
    onTaskComplete: aria2.onTaskComplete,
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
