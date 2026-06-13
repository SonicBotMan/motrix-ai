// src/composables/useAria2.ts
// aria2 RPC client — enhanced with process management, reconnection, and extended RPC methods

import { ref, onMounted, onUnmounted } from 'vue'

// ---- Types ----

export type TaskStatus = 'active' | 'waiting' | 'paused' | 'error' | 'complete' | 'removed'
export type ConnectionEventType = 'connected' | 'disconnected' | 'reconnecting' | 'error'

export interface Aria2Status {
  gid: string
  status: TaskStatus
  totalLength: string
  completedLength: string
  downloadSpeed: string
  uploadSpeed: string
  connections: string
  numSeeders: string
  dir: string
  files: Array<{
    index: string
    path: string
    length: string
    completedLength: string
    selected: string
    uris: Array<{ uri: string; status: string }>
  }>
  bittorrent?: {
    info?: { name: string }
    announceList?: string[][]
    comment?: string
    creationDate?: number
    mode?: 'single' | 'multi'
  }
  errorMessage?: string
  errorCode?: string
  followedBy?: string[]
  following?: string
  belongsTo?: string
}

export interface Aria2GlobalStat {
  downloadSpeed: string
  uploadSpeed: string
  numActive: string
  numWaiting: string
  numStopped: string
  numStoppedTotal: string
}

export type ConnectionListener = (event: ConnectionEventType, detail?: string) => void

export interface Aria2Options {
  rpcUrl?: string
  secret?: string
  aria2Path?: string
  pollIntervalMs?: number
  maxReconnectAttempts?: number
  baseReconnectDelayMs?: number
}

// ---- Defaults ----

const DEFAULT_RPC_URL = 'http://127.0.0.1:6800/jsonrpc'
const DEFAULT_ARIA2_PATH = '/opt/homebrew/bin/aria2c'
const DEFAULT_POLL_MS = 2000
const DEFAULT_MAX_RECONNECT = 10
const DEFAULT_BASE_DELAY_MS = 1000

// ---- Composable ----

export function useAria2(opts: Aria2Options = {}) {
  const rpcUrl = opts.rpcUrl ?? DEFAULT_RPC_URL
  const secret = opts.secret ?? ''
  const aria2Path = opts.aria2Path ?? DEFAULT_ARIA2_PATH
  const pollMs = opts.pollIntervalMs ?? DEFAULT_POLL_MS
  const maxReconnect = opts.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT
  const baseDelayMs = opts.baseReconnectDelayMs ?? DEFAULT_BASE_DELAY_MS

  // ---- Reactive state ----

  const connected = ref(false)
  const connecting = ref(false)
  const aria2Running = ref(false)
  const globalStat = ref<Aria2GlobalStat | null>(null)
  const tasks = ref<Aria2Status[]>([])

  let rpcId = 0
  let pollTimer: ReturnType<typeof setInterval> | null = null
  let reconnectAttempt = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let childProcess: Awaited<ReturnType<typeof spawnAria2>> | null = null
  let disposed = false

  // ---- Event listeners ----

  const connectionListeners = new Set<ConnectionListener>()

  const emitConnection = (event: ConnectionEventType, detail?: string) => {
    for (const fn of connectionListeners) {
      try { fn(event, detail) } catch (_) { /* swallow listener errors */ }
    }
  }

  const onConnectionChange = (listener: ConnectionListener) => {
    connectionListeners.add(listener)
    return () => { connectionListeners.delete(listener) }
  }

  // ---- RPC core ----

  const call = async <T>(method: string, ...params: unknown[]): Promise<T> => {
    const id = `motrix-ai-${++rpcId}`
    const actualParams: unknown[] = secret ? [`token:${secret}`, ...params] : [...params]

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params: actualParams }),
    })

    if (!res.ok) throw new Error(`aria2 RPC error: ${res.status}`)
    const data = await res.json()
    if (data.error) throw new Error(`aria2 error: ${data.error.message} (${data.error.code})`)
    return data.result as T
  }

  // ---- aria2 process management ----

  const spawnAria2 = async () => {
    try {
      const { Command } = await import('@tauri-apps/plugin-shell')
      const cmd = Command.create(aria2Path, [
        '--enable-rpc',
        '--rpc-listen-port=6800',
        '--rpc-listen-all=true',
        '--continue=true',
        '--max-concurrent-downloads=5',
        '--split=5',
        '--max-connection-per-server=5',
        '--min-split-size=10M',
        '--disk-cache=32M',
        '--file-allocation=falloc',
        '--auto-file-renaming=true',
        '--allow-overwrite=false',
        '--save-session-interval=30',
      ])
      const child = cmd.spawn()
      aria2Running.value = true
      return child
    } catch (e) {
      console.error('Failed to spawn aria2:', e)
      throw e
    }
  }

  const startAria2 = async () => {
    if (aria2Running.value) return
    try {
      childProcess = await spawnAria2()
      emitConnection('connected', 'aria2 process started')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      emitConnection('error', `Failed to start aria2: ${msg}`)
      throw e
    }
  }

  const stopAria2 = async () => {
    try {
      if (connected.value) {
        await saveSession()
      }
    } catch (_) { /* best effort */ }

    try {
      await call('aria2.shutdown')
    } catch (_) { /* process may already be gone */ }

    aria2Running.value = false
    childProcess = null
    disconnect()
    emitConnection('disconnected', 'aria2 process stopped')
  }

  // ---- Reconnection with exponential backoff ----

  const scheduleReconnect = () => {
    if (disposed) return
    if (reconnectAttempt >= maxReconnect) {
      emitConnection('error', `Max reconnect attempts (${maxReconnect}) reached`)
      return
    }

    const delay = Math.min(baseDelayMs * Math.pow(2, reconnectAttempt), 30_000)
    reconnectAttempt++

    emitConnection('reconnecting', `attempt ${reconnectAttempt}/${maxReconnect} in ${delay}ms`)

    reconnectTimer = setTimeout(async () => {
      try {
        await getGlobalStat()
        connected.value = true
        reconnectAttempt = 0
        emitConnection('connected', 'Reconnected to aria2')
        startPolling()
      } catch (_) {
        scheduleReconnect()
      }
    }, delay)
  }

  const clearReconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    reconnectAttempt = 0
  }

  // ---- Polling ----

  const startPolling = () => {
    stopPolling()
    pollTimer = setInterval(async () => {
      try {
        await Promise.all([fetchAllTasks(), fetchGlobalStat()])
      } catch (e) {
        connected.value = false
        emitConnection('disconnected', 'Lost connection to aria2')
        stopPolling()
        scheduleReconnect()
      }
    }, pollMs)
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  // ---- Basic RPC methods (backward-compatible) ----

  const addUri = async (uri: string, options?: { dir?: string; filename?: string; [k: string]: string | undefined }) => {
    const aria2Opts: Record<string, string> = {}
    if (options) {
      for (const [k, v] of Object.entries(options)) {
        if (v !== undefined) aria2Opts[k === 'filename' ? 'out' : k] = v
      }
    }
    return call<string>('aria2.addUri', [uri], aria2Opts)
  }

  const tellStatus = async (gid: string, keys?: string[]) => {
    return call<Aria2Status>('aria2.tellStatus', gid, keys)
  }

  const tellActive = async (keys?: string[]) => {
    return call<Aria2Status[]>('aria2.tellActive', keys)
  }

  const tellWaiting = async (offset = 0, num = 100, keys?: string[]) => {
    return call<Aria2Status[]>('aria2.tellWaiting', offset, num, keys)
  }

  const tellStopped = async (offset = 0, num = 100, keys?: string[]) => {
    return call<Aria2Status[]>('aria2.tellStopped', offset, num, keys)
  }

  const pause = async (gid: string) => {
    return call<string>('aria2.pause', gid)
  }

  const unpause = async (gid: string) => {
    return call<string>('aria2.unpause', gid)
  }

  const remove = async (gid: string) => {
    return call<string>('aria2.remove', gid)
  }

  const getGlobalStat = async () => {
    return call<Aria2GlobalStat>('aria2.getGlobalStat')
  }

  // ---- Extended RPC: pauseAll / unpauseAll ----

  const pauseAll = async () => {
    return call<string>('aria2.pauseAll')
  }

  const unpauseAll = async () => {
    return call<string>('aria2.unpauseAll')
  }

  const purgeDownloadResult = async () => {
    return call<string>('aria2.purgeDownloadResult')
  }

  // ---- Extended RPC: removeCompleted / removeFailed ----

  const removeCompleted = async () => {
    const stopped = await tellStopped(0, 1000)
    const completed = stopped.filter(t => t.status === 'complete')
    const gids = await Promise.allSettled(
      completed.map(t => call<string>('aria2.removeDownloadResult', t.gid))
    )
    return gids
  }

  const removeFailed = async () => {
    const stopped = await tellStopped(0, 1000)
    const failed = stopped.filter(t => t.status === 'error' || t.status === 'removed')
    const gids = await Promise.allSettled(
      failed.map(t => call<string>('aria2.removeDownloadResult', t.gid))
    )
    return gids
  }

  // ---- Extended RPC: changePosition ----

  const changePosition = async (gid: string, pos: number, how: 'POS_SET' | 'POS_CUR') => {
    return call<number>('aria2.changePosition', gid, pos, how)
  }

  const moveUp = async (gid: string, steps = 1) => {
    return changePosition(gid, -steps, 'POS_CUR')
  }

  const moveDown = async (gid: string, steps = 1) => {
    return changePosition(gid, steps, 'POS_CUR')
  }

  const moveToTop = async (gid: string) => {
    return changePosition(gid, 0, 'POS_SET')
  }

  const moveToBottom = async (gid: string, totalWaiting?: number) => {
    const pos = totalWaiting ?? 9999
    return changePosition(gid, pos, 'POS_SET')
  }

  // ---- Extended RPC: options ----

  const getOption = async (gid: string) => {
    return call<Record<string, string>>('aria2.getOption', gid)
  }

  const changeOption = async (gid: string, options: Record<string, string>) => {
    return call<string>('aria2.changeOption', gid, options)
  }

  const getGlobalOption = async () => {
    return call<Record<string, string>>('aria2.getGlobalOption')
  }

  const changeGlobalOption = async (options: Record<string, string>) => {
    return call<string>('aria2.changeGlobalOption', options)
  }

  // ---- Extended RPC: session ----

  const saveSession = async () => {
    return call<string>('aria2.saveSession')
  }

  // ---- Extended RPC: multi-uri add ----

  const addUriMulti = async (uris: string[], options?: Record<string, string>) => {
    return call<string>('aria2.addUri', uris, options ?? {})
  }

  // ---- Speed limiting ----

  const setGlobalMaxDownloadLimit = async (limit: string) => {
    return changeGlobalOption({ 'max-overall-download-limit': limit })
  }

  const setGlobalMaxUploadLimit = async (limit: string) => {
    return changeGlobalOption({ 'max-overall-upload-limit': limit })
  }

  const setTaskMaxDownloadLimit = async (gid: string, limit: string) => {
    return changeOption(gid, { 'max-download-limit': limit })
  }

  const setTaskMaxUploadLimit = async (gid: string, limit: string) => {
    return changeOption(gid, { 'max-upload-limit': limit })
  }

  const getSpeedLimits = async () => {
    const opts = await getGlobalOption()
    return {
      maxOverallDownloadLimit: opts['max-overall-download-limit'] || '0',
      maxOverallUploadLimit: opts['max-overall-upload-limit'] || '0',
    }
  }

  // ---- Data fetch helpers ----

  // Track seen GIDs and their statuses to detect completions
  const previousStatuses = new Map<string, string>()
  type CompletionListener = (task: Aria2Status) => void
  const completionListeners = new Set<CompletionListener>()

  const onTaskComplete = (listener: CompletionListener) => {
    completionListeners.add(listener)
    return () => { completionListeners.delete(listener) }
  }

  const fetchAllTasks = async () => {
    try {
      const [active, waiting, stopped] = await Promise.all([
        tellActive(),
        tellWaiting(),
        tellStopped(),
      ])
      const allTasks = [...active, ...waiting, ...stopped]
      tasks.value = allTasks

      // Detect newly completed tasks
      for (const task of allTasks) {
        const prevStatus = previousStatuses.get(task.gid)
        const newStatus = task.status
        if (prevStatus && prevStatus !== 'complete' && newStatus === 'complete') {
          // Task just completed!
          for (const listener of completionListeners) {
            try { listener(task) } catch (_) { /* swallow */ }
          }
        }
        previousStatuses.set(task.gid, newStatus)
      }
    } catch (e) {
      console.error('Failed to fetch tasks:', e)
    }
  }

  const fetchGlobalStat = async () => {
    try {
      globalStat.value = await getGlobalStat()
    } catch (e) {
      console.error('Failed to fetch global stat:', e)
    }
  }

  // ---- Connect / disconnect ----

  const connect = async () => {
    if (connecting.value || connected.value) return
    connecting.value = true
    try {
      await getGlobalStat()
      connected.value = true
      emitConnection('connected', 'Connected to aria2')
      await fetchAllTasks()
      await fetchGlobalStat()
      startPolling()
    } catch (e) {
      connected.value = false
      const msg = e instanceof Error ? e.message : String(e)
      emitConnection('error', `Failed to connect: ${msg}`)
      scheduleReconnect()
    } finally {
      connecting.value = false
    }
  }

  const disconnect = () => {
    stopPolling()
    clearReconnect()
    connected.value = false
  }

  // ---- Lifecycle ----

  onMounted(async () => {
    // First, try to start the bundled aria2c via Tauri backend
    try {
      const { invoke } = await import('@tauri-apps/api/core')

      // Diagnostic: check binary exists
      const diag = await invoke<any>('check_aria2_binary')
      console.log('aria2c binary diagnostic:', diag)

      if (!diag.exists) {
        console.error('Bundled aria2c NOT FOUND at:', diag.binary_path)
        emitConnection('error', 'Bundled aria2c binary not found')
      } else {
        const rpcUrl = await invoke<string>('start_aria2', { rpcPort: 6800 })
        console.log('Bundled aria2c started:', rpcUrl)
        aria2Running.value = true
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn('Bundled aria2c failed:', msg)
      emitConnection('error', `aria2c start failed: ${msg}`)
      // Fallback: try connecting to system aria2c
      try {
        await startAria2()
      } catch (_) {
        console.log('System aria2c not available either')
      }
    }
    // Connect to aria2 RPC (whether bundled or system)
    connect()
  })

  onUnmounted(async () => {
    disposed = true
    disconnect()
    // Stop bundled aria2c on app exit
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('stop_aria2')
    } catch (_) { /* best effort */ }
  })

  // ---- Public API ----

  return {
    // Reactive state
    connected,
    connecting,
    aria2Running,
    globalStat,
    tasks,

    // Events
    onConnectionChange,
    onTaskComplete,

    // Process management
    startAria2,
    stopAria2,

    // Connection lifecycle
    connect,
    disconnect,

    // Basic methods (backward-compatible)
    addUri,
    tellStatus,
    tellActive,
    tellWaiting,
    tellStopped,
    pause,
    unpause,
    remove,
    getGlobalStat,
    fetchAllTasks,
    fetchGlobalStat,

    // Pause/unpause all
    pauseAll,
    unpauseAll,
    purgeDownloadResult,

    // Remove completed/failed
    removeCompleted,
    removeFailed,

    // Queue positioning
    changePosition,
    moveUp,
    moveDown,
    moveToTop,
    moveToBottom,

    // Options
    getOption,
    changeOption,
    getGlobalOption,
    changeGlobalOption,

    // Session
    saveSession,

    // Multi-URI
    addUriMulti,

    // Speed limiting
    setGlobalMaxDownloadLimit,
    setGlobalMaxUploadLimit,
    setTaskMaxDownloadLimit,
    setTaskMaxUploadLimit,
    getSpeedLimits,
  }
}
