// src/composables/useAria2Manager.ts
// High-level download management built on top of useAria2

import { ref, computed } from 'vue'
import {
  useAria2,
  type Aria2Status,
  type TaskStatus,
  type ConnectionEventType,
} from './useAria2'

// ---- Types ----

export type DownloadCategory = 'video' | 'audio' | 'document' | 'software' | 'archive' | 'image' | 'other'

export interface DownloadItem {
  gid: string
  name: string
  status: TaskStatus
  category: DownloadCategory
  totalBytes: number
  completedBytes: number
  downloadSpeed: number
  uploadSpeed: number
  progress: number
  dir: string
  uris: string[]
  isBT: boolean
  createdAt: number
}

export interface AddDownloadOptions {
  dir?: string
  filename?: string
  category?: DownloadCategory
  headers?: string[]
  maxDownloadLimit?: string
  maxUploadLimit?: string
  split?: number
  'max-connection-per-server'?: number
  [key: string]: string | number | string[] | undefined
}

export interface ExportedDownload {
  uri: string
  options: Record<string, string>
  addedAt: number
  category: DownloadCategory
}

// ---- Category detection ----

const VIDEO_EXTS = new Set([
  'mkv', 'mp4', 'avi', 'wmv', 'flv', 'mov', 'webm', 'm4v', 'ts', 'mpg', 'mpeg', 'rm', 'rmvb', '3gp',
])
const AUDIO_EXTS = new Set([
  'mp3', 'flac', 'wav', 'aac', 'ogg', 'm4a', 'wma', 'opus', 'ape', 'alac', 'aiff',
])
const DOC_EXTS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'epub', 'mobi', 'cbz',
])
const SOFTWARE_EXTS = new Set([
  'dmg', 'pkg', 'app', 'exe', 'msi', 'deb', 'rpm', 'AppImage', 'snap',
])
const ARCHIVE_EXTS = new Set([
  'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'zst', 'lz4', 'iso',
])
const IMAGE_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'avif', 'heic',
])

const EXT_CATEGORY_MAP = new Map<string, DownloadCategory>()
for (const ext of VIDEO_EXTS) EXT_CATEGORY_MAP.set(ext, 'video')
for (const ext of AUDIO_EXTS) EXT_CATEGORY_MAP.set(ext, 'audio')
for (const ext of DOC_EXTS) EXT_CATEGORY_MAP.set(ext, 'document')
for (const ext of SOFTWARE_EXTS) EXT_CATEGORY_MAP.set(ext, 'software')
for (const ext of ARCHIVE_EXTS) EXT_CATEGORY_MAP.set(ext, 'archive')
for (const ext of IMAGE_EXTS) EXT_CATEGORY_MAP.set(ext, 'image')

function guessCategoryFromUri(uri: string): DownloadCategory {
  // Magnet link → likely video (most common BT use case)
  if (uri.startsWith('magnet:')) return 'video'

  try {
    const url = new URL(uri)
    const pathname = url.pathname
    const dotIdx = pathname.lastIndexOf('.')
    if (dotIdx >= 0) {
      const ext = pathname.slice(dotIdx + 1).toLowerCase().split('?')[0]
      const cat = EXT_CATEGORY_MAP.get(ext)
      if (cat) return cat
    }
  } catch (_) { /* not a valid URL */ }

  return 'other'
}

function getFileName(status: Aria2Status): string {
  // BT name first
  if (status.bittorrent?.info?.name) {
    return status.bittorrent.info.name
  }
  // First file path
  const firstFile = status.files?.[0]
  if (firstFile?.path) {
    return firstFile.path.split('/').pop() || firstFile.path
  }
  // URI basename
  const firstUri = firstFile?.uris?.[0]?.uri
  if (firstUri) {
    try {
      const pathname = new URL(firstUri).pathname
      const base = pathname.split('/').pop()
      if (base) return decodeURIComponent(base)
    } catch (_) { /* not a valid URL */ }
  }
  return `download-${status.gid.slice(0, 8)}`
}

// ---- History persistence (localStorage) ----

const HISTORY_KEY = 'motrix-ai:download-history'
const MAX_HISTORY = 500

function loadHistory(): ExportedDownload[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (_) {
    return []
  }
}

function saveHistory(items: ExportedDownload[]) {
  const trimmed = items.slice(0, MAX_HISTORY)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed))
}

// ---- Composable ----

export function useAria2Manager() {
  const aria2 = useAria2()

  const history = ref<ExportedDownload[]>(loadHistory())

  // ---- Computed task views ----

  const downloads = computed<DownloadItem[]>(() =>
    aria2.tasks.value.map(mapToDownloadItem)
  )

  const activeDownloads = computed(() =>
    downloads.value.filter(d => d.status === 'active')
  )

  const waitingDownloads = computed(() =>
    downloads.value.filter(d => d.status === 'waiting' || d.status === 'paused')
  )

  const completedDownloads = computed(() =>
    downloads.value.filter(d => d.status === 'complete')
  )

  const failedDownloads = computed(() =>
    downloads.value.filter(d => d.status === 'error' || d.status === 'removed')
  )

  // ---- Helpers ----

  function mapToDownloadItem(status: Aria2Status): DownloadItem {
    const total = Number(status.totalLength) || 0
    const completed = Number(status.completedLength) || 0
    const name = getFileName(status)
    const uris = (status.files?.[0]?.uris || []).map(u => u.uri)
    const isBT = !!status.bittorrent

    return {
      gid: status.gid,
      name,
      status: status.status,
      category: guessCategoryFromUri(uris[0] || ''),
      totalBytes: total,
      completedBytes: completed,
      downloadSpeed: Number(status.downloadSpeed) || 0,
      uploadSpeed: Number(status.uploadSpeed) || 0,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
      dir: status.dir || '',
      uris,
      isBT,
      createdAt: 0, // aria2 doesn't expose this directly
    }
  }

  // ---- Add downloads ----

  const addDownload = async (uri: string, options: AddDownloadOptions = {}) => {
    const category = options.category ?? guessCategoryFromUri(uri)

    const aria2Opts: Record<string, string> = {}
    for (const [k, v] of Object.entries(options)) {
      if (v !== undefined && k !== 'category' && !Array.isArray(v)) {
        aria2Opts[k] = String(v)
      }
    }

    const gid = await aria2.addUri(uri, aria2Opts)

    // Record in history
    history.value.unshift({
      uri,
      options: aria2Opts,
      addedAt: Date.now(),
      category,
    })
    saveHistory(history.value)

    return gid
  }

  const addBatchDownloads = async (items: Array<{ uri: string; options?: AddDownloadOptions }>) => {
    const results = await Promise.allSettled(
      items.map(item => addDownload(item.uri, item.options ?? {}))
    )
    const gids: string[] = []
    const errors: Array<{ uri: string; error: string }> = []

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        gids.push(r.value)
      } else {
        errors.push({ uri: items[i].uri, error: r.reason?.message || String(r.reason) })
      }
    })

    return { gids, errors }
  }

  // ---- Task actions ----

  const pauseDownload = async (gid: string) => {
    return aria2.pause(gid)
  }

  const resumeDownload = async (gid: string) => {
    return aria2.unpause(gid)
  }

  const cancelDownload = async (gid: string) => {
    return aria2.remove(gid)
  }

  const pauseAllDownloads = async () => {
    return aria2.pauseAll()
  }

  const resumeAllDownloads = async () => {
    return aria2.unpauseAll()
  }

  const clearCompleted = async () => {
    return aria2.removeCompleted()
  }

  const clearFailed = async () => {
    return aria2.removeFailed()
  }

  // ---- Queue management ----

  const moveDownloadUp = async (gid: string, steps = 1) => {
    return aria2.moveUp(gid, steps)
  }

  const moveDownloadDown = async (gid: string, steps = 1) => {
    return aria2.moveDown(gid, steps)
  }

  const moveDownloadToTop = async (gid: string) => {
    return aria2.moveToTop(gid)
  }

  const moveDownloadToBottom = async (gid: string) => {
    const total = aria2.tasks.value.filter(t => t.status === 'waiting').length
    return aria2.moveToBottom(gid, total)
  }

  // ---- Speed limiting ----

  const setGlobalSpeedLimit = async (downloadLimit: string, uploadLimit?: string) => {
    const promises: Promise<string>[] = []
    promises.push(aria2.setGlobalMaxDownloadLimit(downloadLimit))
    if (uploadLimit) promises.push(aria2.setGlobalMaxUploadLimit(uploadLimit))
    return Promise.all(promises)
  }

  const setTaskSpeedLimit = async (gid: string, downloadLimit: string, uploadLimit?: string) => {
    const promises: Promise<string>[] = []
    promises.push(aria2.setTaskMaxDownloadLimit(gid, downloadLimit))
    if (uploadLimit) promises.push(aria2.setTaskMaxUploadLimit(gid, uploadLimit))
    return Promise.all(promises)
  }

  // ---- Export / Import ----

  const exportDownloads = (): ExportedDownload[] => {
    const items: ExportedDownload[] = []

    for (const task of aria2.tasks.value) {
      const uris = task.files?.[0]?.uris || []
      const uri = uris[0]?.uri
      if (!uri) continue

      items.push({
        uri,
        options: { dir: task.dir || '' },
        addedAt: Date.now(),
        category: guessCategoryFromUri(uri),
      })
    }

    return items
  }

  const exportHistory = (): ExportedDownload[] => {
    return [...history.value]
  }

  const importDownloads = async (items: ExportedDownload[]) => {
    return addBatchDownloads(
      items.map(item => ({
        uri: item.uri,
        options: { ...item.options, category: item.category },
      }))
    )
  }

  const importFromJSON = (json: string) => {
    try {
      const items = JSON.parse(json)
      if (!Array.isArray(items)) throw new Error('Expected an array')
      return importDownloads(items as ExportedDownload[])
    } catch (e) {
      throw new Error(`Invalid import data: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // ---- History ----

  const clearHistory = () => {
    history.value = []
    saveHistory([])
  }

  const getHistoryByCategory = (category: DownloadCategory): ExportedDownload[] => {
    return history.value.filter(h => h.category === category)
  }

  // ---- Convenience: get downloads by category ----

  const getDownloadsByCategory = (category: DownloadCategory): DownloadItem[] => {
    return downloads.value.filter(d => d.category === category)
  }

  // ---- Event forwarding ----

  const onConnectionChange = (listener: (event: ConnectionEventType, detail?: string) => void) => {
    return aria2.onConnectionChange(listener)
  }

  // ---- Public API ----

  return {
    // Underlying aria2 client (for advanced usage)
    aria2,

    // Computed views
    downloads,
    activeDownloads,
    waitingDownloads,
    completedDownloads,
    failedDownloads,

    // Download actions
    addDownload,
    addBatchDownloads,
    pauseDownload,
    resumeDownload,
    cancelDownload,
    pauseAllDownloads,
    resumeAllDownloads,
    clearCompleted,
    clearFailed,

    // Queue management
    moveDownloadUp,
    moveDownloadDown,
    moveDownloadToTop,
    moveDownloadToBottom,

    // Speed limiting
    setGlobalSpeedLimit,
    setTaskSpeedLimit,

    // Categorization
    getDownloadsByCategory,

    // Export / Import
    exportDownloads,
    exportHistory,
    importDownloads,
    importFromJSON,

    // History
    history,
    clearHistory,
    getHistoryByCategory,

    // Events
    onConnectionChange,

    // Pass-through reactive state for convenience
    get connected() { return aria2.connected },
    get connecting() { return aria2.connecting },
    get aria2Running() { return aria2.aria2Running },
    get globalStat() { return aria2.globalStat },
  }
}
