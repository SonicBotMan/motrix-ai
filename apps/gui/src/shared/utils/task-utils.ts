// task-utils.ts — Pure helpers for task display (shared by TaskRow, TaskTable, etc.)
//
// Extracted from TaskTable.vue during A3a. No reactive state, no component
// dependencies — safe to import from any Vue component or non-Vue module.

import type { Component } from 'vue'
import {
  VideocamOutline,
  MusicalNotesOutline,
  DocumentTextOutline,
  ArchiveOutline,
  CloudDownloadOutline,
} from '@vicons/ionicons5'
import type { TaskStatus, TaskType } from '@/stores/tasks'

/** Truncate source URLs for display. Handles magnet:, torrent:, and regular URLs. */
export function formatSource(source: string): string {
  if (!source) return ''
  if (source.startsWith('magnet:')) {
    const match = source.match(/xt=urn:btih:([a-zA-Z0-9]+)/i)
    return match ? `magnet:${match[1].slice(0, 12)}…` : 'magnet:?'
  }
  if (source.startsWith('torrent://')) {
    return source.replace('torrent://', 'torrent: ')
  }
  try {
    const url = new URL(source)
    return url.hostname.replace('www.', '')
  } catch {
    return source
  }
}

/** Map TaskStatus to status-pill CSS class name. */
export function statusPillClass(status: TaskStatus): string {
  if (status === 'failed') return 'error'
  return status
}

/** Map TaskStatus to uppercase display label. */
export function statusLabel(status: TaskStatus): string {
  const labels: Record<string, string> = {
    downloading: 'DOWNLOADING',
    paused: 'PAUSED',
    completed: 'COMPLETED',
    failed: 'FAILED',
    pending: 'PENDING',
  }
  return labels[status] || status.toUpperCase()
}

/** Map TaskStatus to progress-fill CSS class (same mapping as statusPillClass). */
export function fillClass(status: TaskStatus): string {
  return statusPillClass(status)
}

/** Map TaskType to its ionicon component. */
export const typeIcons: Record<TaskType, Component> = {
  video: VideocamOutline,
  audio: MusicalNotesOutline,
  document: DocumentTextOutline,
  archive: ArchiveOutline,
  torrent: CloudDownloadOutline,
}
