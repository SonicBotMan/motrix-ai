/**
 * useTaskAdapter — bridges aria2 RPC data to the design-system Task shape.
 *
 * The design system (components, visual baselines) consumes a `DesignTask[]`.
 * In production this array is populated from live aria2 status objects; when no
 * aria2 connection is available the composable transparently falls back to the
 * shipped `MOCK_TASKS` so the prototype always renders a full table.
 *
 * @see docs/design/handoff/05-mock-data.md — the schema contract
 */

import { computed } from 'vue'
import { useAria2, type Aria2Status } from './useAria2'
import { MOCK_TASKS } from '../mock/tasks'

// ---------------------------------------------------------------------------
// Design-system Task type (mirrors §1 of 05-mock-data.md)
// ---------------------------------------------------------------------------

/**
 * A single download task in the design-system format.
 *
 * This is the canonical shape that every UI component reads. Real aria2 data
 * is normalised into this structure by {@link mapAria2ToDesign}.
 */
export interface DesignTask {
  /** Dense, unique identifier (1, 2, 3, … for mock data; aria2 gid for live) */
  id: number
  /** Visible filename (last path segment, or `dn=` param for magnets) */
  name: string
  /** Host or magnet identifier, formatted via `formatSource()` */
  source: string
  type: 'video' | 'document' | 'audio' | 'archive' | 'torrent'
  status: 'downloading' | 'paused' | 'completed' | 'error'
  /** 0–100, integer; 100 only when status is `completed` */
  progress: number
  /** Human-readable, e.g. `'24.6 MB/s'`; `'0 B/s'` when paused */
  speed: string
  /** Downloaded amount, e.g. `'4.8 GB'` */
  size: string
  /** Total size, e.g. `'5.7 GB'` */
  total: string
  /** Human-readable remaining time, e.g. `'38s'`, or `'—'` */
  eta: string
  /** Current active peer / connection count */
  connections: number
  /** Available seeders (torrents only) */
  seeders: number
  /** Available leechers (torrents only) */
  leechers: number
  /** One or more files; an empty array is a bug */
  files: Array<{
    name: string
    size: string
    /** `true` when hash-verified / fully downloaded */
    checked: boolean
  }>
  /** 3–6 entries, newest first */
  timeline: Array<{
    time: string
    text: string
    type: string
  }>
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

/**
 * Provides a reactive `tasks` list in the design-system format.
 *
 * When aria2 is connected and has at least one task, the returned tasks are
 * live-mapped from the RPC layer. Otherwise the shipped mock data is used so
 * the UI always has content to render.
 *
 * @returns `{ tasks, connected }` reactive refs.
 */
export function useTaskAdapter() {
  const { tasks: aria2Tasks, connected } = useAria2()

  const tasks = computed<DesignTask[]>(() => {
    if (!connected.value || aria2Tasks.value.length === 0) {
      return MOCK_TASKS
    }
    return aria2Tasks.value.map(mapAria2ToDesign)
  })

  return { tasks, connected }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/**
 * Converts a raw aria2 status object into a {@link DesignTask}.
 */
function mapAria2ToDesign(task: Aria2Status): DesignTask {
  const total = Number(task.totalLength) || 0
  const completed = Number(task.completedLength) || 0
  const speed = Number(task.downloadSpeed) || 0
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  return {
    id: gidToNumber(task.gid),
    name: extractFilename(task),
    source: extractSource(task),
    type: detectType(task),
    status: mapStatus(task.status),
    progress,
    speed: formatSpeed(speed),
    size: formatBytes(completed),
    total: formatBytes(total),
    eta: speed > 0 && total > completed ? formatEta((total - completed) / speed) : '—',
    connections: Number(task.connections) || 0,
    seeders: Number(task.numSeeders) || 0,
    leechers: 0,
    files: (task.files || []).map((f) => ({
      name: f.path?.split('/').pop() || 'unknown',
      size: formatBytes(Number(f.length) || 0),
      checked: Number(f.completedLength) === Number(f.length),
    })),
    timeline: [],
  }
}

/**
 * Derives a stable integer ID from an aria2 gid (hex string).
 *
 * aria2 gids are 16-character hex strings; the design-system mock data uses
 * dense integers. We hash the gid deterministically for the live path.
 */
function gidToNumber(gid: string): number {
  let hash = 0
  for (let i = 0; i < gid.length; i++) {
    hash = ((hash << 5) - hash + gid.charCodeAt(i)) | 0
  }
  return Math.abs(hash)
}

/**
 * Extracts the visible filename from an aria2 task.
 *
 * For BitTorrent tasks the torrent name is preferred; otherwise the last path
 * segment of the first file is used.
 */
function extractFilename(task: Aria2Status): string {
  if (task.bittorrent?.info?.name) {
    return task.bittorrent.info.name
  }
  const firstFile = task.files?.[0]
  if (firstFile?.path) {
    return firstFile.path.split('/').pop() || firstFile.path
  }
  if (firstFile?.uris?.[0]?.uri) {
    const uri = firstFile.uris[0].uri
    return uri.split('/').pop() || uri
  }
  return 'unknown'
}

/**
 * Extracts a display-ready source string from an aria2 task.
 *
 * Magnet links are abbreviated to `magnet: <hash>…`; HTTP sources are reduced
 * to hostname (+ first path segment if any).
 */
function extractSource(task: Aria2Status): string {
  const firstFile = task.files?.[0]
  const uri = firstFile?.uris?.[0]?.uri

  if (uri?.startsWith('magnet:')) {
    const m = uri.match(/urn:btih:([a-fA-F0-9]{40})/)
    if (m) return `magnet: ${m[1].slice(0, 8)}…${m[1].slice(-4)}`
    return 'magnet: link'
  }

  if (uri) {
    try {
      const u = new URL(uri)
      const firstSegment = u.pathname.split('/').filter(Boolean)[0] || ''
      return firstSegment ? `${u.hostname}/${firstSegment}` : u.hostname
    } catch {
      return uri
    }
  }

  return task.bittorrent ? 'magnet: link' : 'unknown'
}

/** Maps aria2 status strings to the four design-system statuses. */
function mapStatus(status: Aria2Status['status']): DesignTask['status'] {
  switch (status) {
    case 'active':
    case 'waiting':
      return 'downloading'
    case 'paused':
      return 'paused'
    case 'complete':
      return 'completed'
    case 'error':
    case 'removed':
      return 'error'
    default:
      return 'downloading'
  }
}

/**
 * Infers the design-system file type from the filename extension.
 */
function detectType(task: Aria2Status): DesignTask['type'] {
  const name = extractFilename(task).toLowerCase()

  if (task.bittorrent) return 'torrent'

  if (/\.(mp4|mkv|avi|mov|webm|flv|wmv|m4v)$/.test(name)) return 'video'
  if (/\.(mp3|flac|wav|aac|ogg|m4a|opus|wma)$/.test(name)) return 'audio'
  if (/\.(zip|tar|gz|bz2|xz|7z|rar|deb|rpm|appimage|dmg|pkg|tar\.gz|tar\.xz|tar\.bz2)$/.test(name)) return 'archive'

  return 'document'
}

/**
 * Formats a byte count into a human-readable string.
 *
 * @example formatBytes(6120328) // → '5.8 MB'
 */
function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  const formatted = i === 0 ? String(Math.round(value)) : value.toFixed(i === 1 ? 0 : 1)
  return `${formatted} ${units[i]}`
}

/**
 * Formats a download speed (bytes/sec) into a human-readable string.
 *
 * @example formatSpeed(25832448) // → '24.6 MB/s'
 */
function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s']
  const i = Math.min(Math.floor(Math.log(bytesPerSec) / Math.log(1024)), units.length - 1)
  const value = bytesPerSec / Math.pow(1024, i)
  return `${value.toFixed(1)} ${units[i]}`
}

/**
 * Formats a duration in seconds into a compact human-readable string.
 *
 * @example formatEta(38)   // → '38s'
 * @example formatEta(258)  // → '4m 18s'
 * @example formatEta(3725) // → '1h 2m'
 */
function formatEta(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const remS = s % 60
  if (m < 60) return remS > 0 ? `${m}m ${remS}s` : `${m}m`
  const h = Math.floor(m / 60)
  const remM = m % 60
  return remM > 0 ? `${h}h ${remM}m` : `${h}h`
}
