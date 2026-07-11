/** @fileoverview Formatting utilities for byte sizes, speed, and time display. */

/**
 * Convert raw byte count to human-readable size string.
 * Auto-scales through B / KB / MB / GB / TB.
 *
 * @example bytesToSize(0)     → "0 KB"
 * @example bytesToSize(512)   → "512 B"
 * @example bytesToSize(1048576) → "1.0 MB"
 * @example bytesToSize(1073741824) → "1.0 GB"
 */
export function bytesToSize(bytes: number | string, precision = 1): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes
  if (!b || isNaN(b) || b <= 0) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(b) / Math.log(1024))
  if (i === 0) return `${b} ${sizes[i]}`
  const idx = Math.min(i, sizes.length - 1)
  return `${(b / 1024 ** idx).toFixed(precision)} ${sizes[idx]}`
}

/**
 * Format a download speed (bytes/sec) into a human-readable speed string.
 *
 * @example formatSpeed(0)        → "—"
 * @example formatSpeed(51200)    → "50.0 KB/s"
 * @example formatSpeed(1048576)  → "1.0 MB/s"
 */
export function formatSpeed(bytesPerSec: number | string): string {
  const bps = typeof bytesPerSec === 'string' ? parseInt(bytesPerSec, 10) : bytesPerSec
  if (!bps || isNaN(bps) || bps <= 0) return '\u2014'
  return `${bytesToSize(bps)}/s`
}

/**
 * Format a completed/total byte pair into a size progress string.
 *
 * @example formatSizeProgress(0, 0)           → "—"
 * @example formatSizeProgress(524288, 1048576) → "512.0 KB / 1.0 MB"
 */
export function formatSizeProgress(completed: number, total: number): string {
  if (!total || total <= 0) return '\u2014'
  return `${bytesToSize(completed)} / ${bytesToSize(total)}`
}

/**
 * Calculate remaining time in seconds from total/completed/speed.
 * Returns 0 when speed is zero or result is not finite.
 */
export function timeRemaining(totalLength: number, completedLength: number, downloadSpeed: number): number {
  if (!downloadSpeed || downloadSpeed <= 0) return 0
  const remaining = totalLength - completedLength
  if (remaining <= 0) return 0
  const result = Math.ceil(remaining / downloadSpeed)
  if (!isFinite(result) || isNaN(result)) return 0
  return result
}

/**
 * Format seconds into a compact human-readable duration.
 *
 * @example formatEta(0)     → "—"
 * @example formatEta(45)    → "45s"
 * @example formatEta(125)   → "2m 5s"
 * @example formatEta(7300)  → "2h 1m"
 * @example formatEta(90000) → "> 1 day"
 */
export function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0) return '\u2014'
  let secs = seconds
  if (secs > 86400) return '> 1 day'
  const parts: string[] = []
  if (secs > 3600) {
    parts.push(`${Math.floor(secs / 3600)}h`)
    secs %= 3600
  }
  if (secs > 60) {
    parts.push(`${Math.floor(secs / 60)}m`)
    secs %= 60
  }
  if (secs > 0 || parts.length === 0) {
    parts.push(`${Math.floor(secs)}s`)
  }
  return parts.join(' ')
}
