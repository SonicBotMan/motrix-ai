// src/composables/useAria2.ts
// aria2 RPC client — process management, reconnection, and extended RPC.
//
// IMPORTANT: this composable is a SINGLETON. All Vue components and Pinia
// stores that call `useAria2()` share the same reactive state and the same
// polling loop. The singleton is initialized lazily on first call and
// disposed only when `dispose()` is invoked explicitly (typically from the
// app shell's onUnmounted).
//
// Previous versions registered Vue `onMounted`/`onUnmounted` hooks inside
// the composable body. That broke in two ways:
//   1. Inside a Pinia setup store the hooks never fire, so the store's
//      start/stop logic had to be duplicated.
//   2. Inside a real component the hooks fire on EVERY mount/unmount of
//      every component that called useAria2 — meaning each navigation to
//      Settings/QueueView spawned a fresh polling loop AND every navigation
//      away killed the aria2 daemon for the whole app.

import { ref, type Ref } from 'vue'

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

interface Aria2BinaryDiagnostic {
  exists: boolean
  binary_path: string
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
const DEFAULT_POLL_MS = 2000
const DEFAULT_MAX_RECONNECT = 10
const DEFAULT_BASE_DELAY_MS = 1000

/**
 * Resolve the platform-appropriate fallback aria2c binary path. Used only
 * when the bundled aria2c (started via the Rust `start_aria2` command) is
 * unavailable — e.g. running the frontend in `vite dev` without Tauri.
 *
 * Previously hard-coded to `/opt/homebrew/bin/aria2c` which only exists
 * on macOS ARM. We now pick a sensible default per platform via
 * `navigator.platform`; users can override via `Aria2Options.aria2Path`.
 */
function pickDefaultAria2Path(): string {
  if (typeof navigator !== 'undefined' && typeof navigator.platform === 'string') {
    if (navigator.platform.startsWith('Win')) return 'aria2c.exe'
  }
  return 'aria2c'
}

// ---- Singleton state (module-level) ----
//
// All state lives at module scope so every caller of `useAria2()` observes
// the same connection, polling loop, and reactive refs.

const rpcUrlRef: Ref<string> = ref(DEFAULT_RPC_URL)
const secretRef: Ref<string> = ref('')
const aria2PathRef: Ref<string> = ref(pickDefaultAria2Path())
const pollMsRef: Ref<number> = ref(DEFAULT_POLL_MS)
const maxReconnectRef: Ref<number> = ref(DEFAULT_MAX_RECONNECT)
const baseDelayMsRef: Ref<number> = ref(DEFAULT_BASE_DELAY_MS)

const connected: Ref<boolean> = ref(false)
const connecting: Ref<boolean> = ref(false)
const aria2Running: Ref<boolean> = ref(false)
const globalStat: Ref<Aria2GlobalStat | null> = ref(null)
const tasks: Ref<Aria2Status[]> = ref([])

let rpcId = 0
let pollTimer: ReturnType<typeof setInterval> | null = null
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let disposed = false
let started = false

const connectionListeners = new Set<ConnectionListener>()
const completionListeners = new Set<(task: Aria2Status) => void>()
const previousStatuses = new Map<string, string>()

const emitConnection = (event: ConnectionEventType, detail?: string) => {
  for (const fn of connectionListeners) {
    try {
      fn(event, detail)
    } catch (_e) {
      /* listener errors are isolated */
    }
  }
}

function ensureConfig(opts: Aria2Options = {}): void {
  if (opts.rpcUrl !== undefined) rpcUrlRef.value = opts.rpcUrl
  if (opts.secret !== undefined) secretRef.value = opts.secret
  if (opts.aria2Path !== undefined) aria2PathRef.value = opts.aria2Path
  if (opts.pollIntervalMs !== undefined) pollMsRef.value = opts.pollIntervalMs
  if (opts.maxReconnectAttempts !== undefined) maxReconnectRef.value = opts.maxReconnectAttempts
  if (opts.baseReconnectDelayMs !== undefined) baseDelayMsRef.value = opts.baseReconnectDelayMs
}

// ---- RPC core ----
const call = async <T>(method: string, ...params: unknown[]): Promise<T> => {
  const id = `motrix-ai-${++rpcId}`
  const actualParams: unknown[] = secretRef.value ? [`token:${secretRef.value}`, ...params] : [...params]

  const res = await fetch(rpcUrlRef.value, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: actualParams }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) throw new Error(`aria2 RPC error: ${res.status}`)
  const data = await res.json()
  if (data.error) throw new Error(`aria2 error: ${data.error.message} (${data.error.code})`)
  return data.result as T
}
// ---- aria2 process management ----
//
// P0-1 FIX: The frontend previously had its own spawnAria2() that started
// aria2c with --rpc-listen-all=true and NO --rpc-secret, exposing the RPC
// to the entire LAN without authentication. This has been removed entirely.
// aria2 lifecycle is now managed exclusively by the Rust backend
// (start_aria2 / stop_aria2 commands), which correctly uses
// --rpc-listen-all=false + a generated secret.

// ---- Reconnection with exponential backoff ----

const scheduleReconnect = () => {
  if (disposed) return
  if (reconnectAttempt >= maxReconnectRef.value) {
    emitConnection('error', `Max reconnect attempts (${maxReconnectRef.value}) reached`)
    return
  }

  const delay = Math.min(baseDelayMsRef.value * Math.pow(2, reconnectAttempt), 30_000)
  reconnectAttempt++

  emitConnection('reconnecting', `attempt ${reconnectAttempt}/${maxReconnectRef.value} in ${delay}ms`)

  reconnectTimer = setTimeout(async () => {
    try {
      await getGlobalStat()
      connected.value = true
      reconnectAttempt = 0
      emitConnection('connected', 'Reconnected to aria2')
      await fetchAllTasks()
      await fetchGlobalStat()
      startPolling()
    } catch (_e) {
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
    } catch (_e) {
      connected.value = false
      emitConnection('disconnected', 'Lost connection to aria2')
      stopPolling()
      scheduleReconnect()
    }
  }, pollMsRef.value)
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

const tellStatus = async (gid: string, keys?: string[]) => call<Aria2Status>('aria2.tellStatus', gid, keys)

const getPeers = async (gid: string) =>
  call<
    Array<{
      peerId: string
      ip: string
      port: string
      bitfield: string
      amChoking: string
      peerChoking: string
      downloadSpeed: string
      uploadSpeed: string
      seeder: string
    }>
  >('aria2.getPeers', gid)

const getServers = async (gid: string) =>
  call<
    Array<{
      index: string
      servers: Array<{ uri: string; currentUri: string; downloadSpeed: string }>
    }>
  >('aria2.getServers', gid)

const tellActive = async (keys?: string[]) => call<Aria2Status[]>('aria2.tellActive', keys)

const tellWaiting = async (offset = 0, num = 1000, keys?: string[]) =>
  call<Aria2Status[]>('aria2.tellWaiting', offset, num, keys)

const tellStopped = async (offset = 0, num = 1000, keys?: string[]) =>
  call<Aria2Status[]>('aria2.tellStopped', offset, num, keys)

const pause = async (gid: string) => call<string>('aria2.pause', gid)
const unpause = async (gid: string) => call<string>('aria2.unpause', gid)
const remove = async (gid: string) => call<string>('aria2.remove', gid)
const getGlobalStat = async () => call<Aria2GlobalStat>('aria2.getGlobalStat')

const pauseAll = async () => call<string>('aria2.pauseAll')
const unpauseAll = async () => call<string>('aria2.unpauseAll')
const purgeDownloadResult = async () => call<string>('aria2.purgeDownloadResult')

// ---- Extended RPC: removeCompleted / removeFailed ----

const removeCompleted = async () => {
  const stopped = await tellStopped(0, 1000)
  const completed = stopped.filter((t) => t.status === 'complete')
  return Promise.allSettled(completed.map((t) => call<string>('aria2.removeDownloadResult', t.gid)))
}

const removeFailed = async () => {
  const stopped = await tellStopped(0, 1000)
  const failed = stopped.filter((t) => t.status === 'error' || t.status === 'removed')
  return Promise.allSettled(failed.map((t) => call<string>('aria2.removeDownloadResult', t.gid)))
}

// ---- Extended RPC: changePosition ----

const changePosition = async (gid: string, pos: number, how: 'POS_SET' | 'POS_CUR') =>
  call<number>('aria2.changePosition', gid, pos, how)

const moveUp = async (gid: string, steps = 1) => changePosition(gid, -steps, 'POS_CUR')
const moveDown = async (gid: string, steps = 1) => changePosition(gid, steps, 'POS_CUR')
const moveToTop = async (gid: string) => changePosition(gid, 0, 'POS_SET')
const moveToBottom = async (gid: string, totalWaiting?: number) => changePosition(gid, totalWaiting ?? 9999, 'POS_SET')

// ---- Extended RPC: options ----

const getOption = async (gid: string) => call<Record<string, string>>('aria2.getOption', gid)

const changeOption = async (gid: string, options: Record<string, string>) =>
  call<string>('aria2.changeOption', gid, options)

const getGlobalOption = async () => call<Record<string, string>>('aria2.getGlobalOption')

const changeGlobalOption = async (options: Record<string, string>) => call<string>('aria2.changeGlobalOption', options)

const saveSession = async () => call<string>('aria2.saveSession')

const addUriMulti = async (uris: string[], options?: Record<string, string>) =>
  call<string>('aria2.addUri', uris, options ?? {})

const setGlobalMaxDownloadLimit = async (limit: string) => changeGlobalOption({ 'max-overall-download-limit': limit })

const setGlobalMaxUploadLimit = async (limit: string) => changeGlobalOption({ 'max-overall-upload-limit': limit })

const setTaskMaxDownloadLimit = async (gid: string, limit: string) => changeOption(gid, { 'max-download-limit': limit })

const setTaskMaxUploadLimit = async (gid: string, limit: string) => changeOption(gid, { 'max-upload-limit': limit })

const getSpeedLimits = async () => {
  const opts = await getGlobalOption()
  return {
    maxOverallDownloadLimit: opts['max-overall-download-limit'] || '0',
    maxOverallUploadLimit: opts['max-overall-upload-limit'] || '0',
  }
}

// ---- Data fetch helpers ----

const onTaskComplete = (listener: (task: Aria2Status) => void) => {
  completionListeners.add(listener)
  return () => {
    completionListeners.delete(listener)
  }
}

const fetchAllTasks = async () => {
  try {
    const [active, waiting, stopped] = await Promise.all([tellActive(), tellWaiting(), tellStopped()])
    const allTasks = [...active, ...waiting, ...stopped]
    tasks.value = allTasks

    const currentGids = new Set(allTasks.map((t) => t.gid))
    for (const gid of previousStatuses.keys()) {
      if (!currentGids.has(gid)) previousStatuses.delete(gid)
    }

    for (const task of allTasks) {
      const prevStatus = previousStatuses.get(task.gid)
      const newStatus = task.status
      if (prevStatus && prevStatus !== 'complete' && newStatus === 'complete') {
        for (const listener of completionListeners) {
          try {
            listener(task)
          } catch (_e) {
            /* listener errors are isolated */
          }
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

const onConnectionChange = (listener: ConnectionListener) => {
  connectionListeners.add(listener)
  return () => {
    connectionListeners.delete(listener)
  }
}

// ---- Explicit lifecycle: callers drive start/stop ---------------------
//
// The composable no longer auto-starts/stops on component mount. Callers
// (typically the Pinia store + the app shell) invoke `start()` once at
// app boot and `dispose()` once at app exit.

async function start(): Promise<void> {
  if (started || disposed) return
  started = true

  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const diag = await invoke<Aria2BinaryDiagnostic>('check_aria2_binary')
    if (!diag.exists) {
      console.error('Bundled aria2c NOT FOUND at:', diag.binary_path)
      emitConnection('error', 'Bundled aria2c binary not found')
    } else {
      await invoke<string>('start_aria2', { rpcPort: 6800 })
      try {
        secretRef.value = await invoke<string>('get_rpc_secret')
        if (!secretRef.value) {
          throw new Error('RPC secret is empty')
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        emitConnection('error', `Failed to retrieve RPC secret: ${msg}`)
        throw e
      }
      aria2Running.value = true
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn('Bundled aria2c failed:', msg)
    emitConnection('error', `aria2c start failed: ${msg}. Bundled aria2c is required.`)
  }

  await connect()
}

async function dispose(): Promise<void> {
  if (disposed) return
  disposed = true
  disconnect()
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('stop_aria2')
  } catch (_e) {
    /* best effort */
  }
}

function reset(): void {
  disposed = false
  started = false
  connected.value = false
  connecting.value = false
  aria2Running.value = false
  reconnectAttempt = 0
  clearReconnect()
  stopPolling()
}

// ---- Public API ----
//
// `useAria2(opts?)` returns the singleton. The first caller may pass
// options to override defaults; subsequent callers' options are also
// applied via `ensureConfig` (last-write-wins) — this is intentional so
// SettingsView can adjust pollInterval/secret at runtime.

export function useAria2(opts: Aria2Options = {}) {
  ensureConfig(opts)

  return {
    connected,
    connecting,
    aria2Running,
    globalStat,
    tasks,

    onConnectionChange,
    onTaskComplete,

    start,
    dispose,
    reset,
    connect,
    disconnect,

    addUri,
    tellStatus,
    getPeers,
    getServers,
    tellActive,
    tellWaiting,
    tellStopped,
    pause,
    unpause,
    remove,
    getGlobalStat,
    fetchAllTasks,
    fetchGlobalStat,

    pauseAll,
    unpauseAll,
    purgeDownloadResult,

    removeCompleted,
    removeFailed,

    changePosition,
    moveUp,
    moveDown,
    moveToTop,
    moveToBottom,

    getOption,
    changeOption,
    getGlobalOption,
    changeGlobalOption,

    saveSession,
    addUriMulti,

    setGlobalMaxDownloadLimit,
    setGlobalMaxUploadLimit,
    setTaskMaxDownloadLimit,
    setTaskMaxUploadLimit,
    getSpeedLimits,
  }
}
