<script setup lang="ts">
/**
 * TaskTable — 8-column density table for download tasks
 *
 * Columns: Name / Source / Status / Progress / Speed / Size / ETA / Actions
 *
 * Features:
 *   - Status pills with type-specific colors (downloading/paused/completed/error)
 *   - Progress bars with shimmer animation for downloading tasks
 *   - Row click → 180ms flash → emits 'openDetail'
 *   - Filter tabs: All / Active / Completed / Failed
 *   - Filter-aware empty states
 *   - Stagger reveal on filter change (220ms × 6, 28ms stagger)
 *   - Type-specific icons (video/document/audio/archive/torrent)
 *
 * Props:
 *   - tasks: Task[]
 *   - activeFilter: string
 *
 * Emits:
 *   - openDetail  (task: Task)
 *   - toggleMenu  (taskId: number, event: MouseEvent)
 *   - update:filter (filter: string)
 *
 * Design ref: docs/design/handoff/02-components.md §3
 */

import { computed, nextTick, ref, watch } from 'vue'
import { NIcon } from 'naive-ui'
import {
  VideocamOutline,
  MusicalNotesOutline,
  DocumentTextOutline,
  ArchiveOutline,
  CloudDownloadOutline,
} from '@vicons/ionicons5'
import type { Task, TaskStatus, TaskType } from '@/stores/tasks'
import FilterTabs from './FilterTabs.vue'
import EmptyState from './EmptyState.vue'

interface Props {
  tasks: Task[]
  activeFilter: string
  keyboardIndex?: number
  connecting?: boolean
  connected?: boolean
  selectedIds?: Set<number>
}

const props = withDefaults(defineProps<Props>(), {
  keyboardIndex: -1,
  connecting: false,
  connected: false,
  selectedIds: () => new Set<number>(),
})

const emit = defineEmits<{
  openDetail: [task: Task]
  toggleMenu: [taskId: number, event: MouseEvent]
  'update:filter': [filter: string]
  retryConnect: []
  trySample: []
  toggleSelect: [id: number]
  toggleSelectAll: []
}>()

// --- State ---

const flashingRowId = ref<number | null>(null)
const openMenuId = ref<number | null>(null)
const rowRefs = ref<Array<HTMLTableRowElement | null>>([])

type SortField = 'name' | 'progress' | 'speed' | 'size' | 'status'
const sortField = ref<SortField | null>(null)
const sortDir = ref<'asc' | 'desc'>('desc')

function toggleSort(field: SortField) {
  if (sortField.value === field) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortField.value = field
    sortDir.value = 'desc'
  }
}

const allSelected = computed(() => {
  return displayTasks.value.length > 0 && displayTasks.value.every((t) => props.selectedIds.has(t.id))
})
const someSelected = computed(() => {
  return props.selectedIds.size > 0 && !allSelected.value
})

const setRowRef = (el: Element | null | undefined, i: number) => {
  rowRefs.value[i] = (el as HTMLTableRowElement | null) ?? null
}

// --- Keyboard-index visual feedback (BUG-2 fix) ---
// When the parent's keyboardIndex changes, scroll the row into view so the
// user sees which row j/k has selected even on long lists.

watch(
  () => props.keyboardIndex,
  (idx) => {
    if (idx < 0) return
    void nextTick(() => {
      const row = rowRefs.value[idx]
      if (row && typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    })
  },
)

// --- Computed ---

const filteredTasks = computed<Task[]>(() => {
  if (props.activeFilter === 'all') return props.tasks
  if (props.activeFilter === 'active') {
    return props.tasks.filter((t) => t.status === 'downloading' || t.status === 'paused')
  }
  return props.tasks.filter((t) => {
    if (props.activeFilter === 'paused') return t.status === 'paused'
    return t.status === props.activeFilter
  })
})

const displayTasks = computed<Task[]>(() => {
  const tasks = filteredTasks.value
  if (!sortField.value) return tasks
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...tasks].sort((a, b) => {
    switch (sortField.value) {
      case 'name':
        return a.name.localeCompare(b.name) * dir
      case 'progress':
        return (a.progress - b.progress) * dir
      case 'speed':
        return ((a.rawSpeed ?? 0) - (b.rawSpeed ?? 0)) * dir
      case 'size':
        return ((a.rawSize ?? 0) - (b.rawSize ?? 0)) * dir
      case 'status':
        return a.status.localeCompare(b.status) * dir
      default:
        return 0
    }
  })
})

// --- Helpers ---

/** Truncate source URLs for display */
function formatSource(source: string): string {
  if (!source) return ''
  if (source.startsWith('magnet:')) {
    // Extract the btih infohash so each magnet task shows a unique,
    // recognizable value rather than a fake placeholder.
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

/** Map TaskStatus to pill class name */
function statusPillClass(status: TaskStatus): string {
  if (status === 'failed') return 'error'
  return status
}

/** Map TaskStatus to pill label */
function statusLabel(status: TaskStatus): string {
  const labels: Record<string, string> = {
    downloading: 'DOWNLOADING',
    paused: 'PAUSED',
    completed: 'COMPLETED',
    failed: 'FAILED',
    pending: 'PENDING',
  }
  return labels[status] || status.toUpperCase()
}

/** Map TaskType to progress fill color class */
function fillClass(status: TaskStatus): string {
  return statusPillClass(status)
}

// --- Type icons (ionicon components) ---

const typeIcons: Record<TaskType, typeof VideocamOutline> = {
  video: VideocamOutline,
  audio: MusicalNotesOutline,
  document: DocumentTextOutline,
  archive: ArchiveOutline,
  torrent: CloudDownloadOutline,
}

// --- Row click → flash → open detail ---

function handleRowClick(task: Task): void {
  // 180ms row flash, then emit openDetail
  flashingRowId.value = task.id
  setTimeout(() => {
    flashingRowId.value = null
    emit('openDetail', task)
  }, 180)
}

/** Toggle the row context menu and track open state for aria-expanded */
function handleMenuToggle(taskId: number, event: MouseEvent): void {
  if (openMenuId.value === taskId) {
    openMenuId.value = null
  } else {
    openMenuId.value = taskId
  }
  emit('toggleMenu', taskId, event)
}
</script>

<template>
  <div class="task-table-wrapper">
    <!-- Filter tabs -->
    <FilterTabs :active-filter="activeFilter" @update:active-filter="emit('update:filter', $event)" />

    <!-- Table -->
    <table v-if="displayTasks.length > 0" class="task-table">
      <thead>
        <tr>
          <th class="col-check">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate.prop="someSelected"
              @change="emit('toggleSelectAll')"
            />
          </th>
          <th class="col-name sortable" @click="toggleSort('name')">
            Name<span v-if="sortField === 'name'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </th>
          <th class="col-source">Source</th>
          <th class="col-status sortable" @click="toggleSort('status')">
            Status<span v-if="sortField === 'status'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </th>
          <th class="col-progress sortable" @click="toggleSort('progress')">
            Progress<span v-if="sortField === 'progress'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </th>
          <th class="col-speed sortable" @click="toggleSort('speed')">
            Speed<span v-if="sortField === 'speed'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </th>
          <th class="col-size sortable" @click="toggleSort('size')">
            Size<span v-if="sortField === 'size'" class="sort-arrow">{{ sortDir === 'asc' ? '▲' : '▼' }}</span>
          </th>
          <th class="col-eta">ETA</th>
          <th class="col-actions" />
        </tr>
      </thead>
      <tbody id="taskTableBody">
        <tr
          v-for="(task, i) in displayTasks"
          :key="task.id"
          :ref="(el) => setRowRef(el as Element | null, i)"
          :data-task-id="task.id"
          :style="{ '--row-i': i }"
          :class="{
            selected: keyboardIndex === i,
            'row-flash': flashingRowId === task.id,
          }"
          @click="handleRowClick(task)"
        >
          <!-- Checkbox -->
          <td class="col-check" @click.stop>
            <input type="checkbox" :checked="selectedIds.has(task.id)" @change="emit('toggleSelect', task.id)" />
          </td>
          <!-- Name -->
          <td class="col-name">
            <div class="col-name-inner">
              <NIcon class="task-type-icon" :component="typeIcons[task.type]" :size="14" aria-hidden="true" />
              <span class="task-name-text">{{ task.name }}</span>
            </div>
          </td>

          <!-- Source -->
          <td class="col-source">{{ formatSource(task.source) }}</td>

          <!-- Status pill -->
          <td class="col-status">
            <span class="status-pill" :class="statusPillClass(task.status)">
              {{ statusLabel(task.status) }}
            </span>
          </td>

          <!-- Progress -->
          <td class="col-progress">
            <div class="col-progress-inner">
              <div class="task-progress">
                <div
                  class="task-progress-fill"
                  :class="fillClass(task.status)"
                  :style="{ width: task.progress + '%' }"
                />
              </div>
              <span class="task-progress-pct">{{ task.progress }}%</span>
            </div>
          </td>

          <!-- Speed -->
          <td class="col-speed">
            <span v-if="task.status === 'downloading'">{{ task.speed }}</span>
            <span v-if="task.status === 'downloading' && task.uploadSpeed" class="upload-speed"
              >↑{{ task.uploadSpeed }}</span
            >
            <span v-if="task.status !== 'downloading'">{{ '\u00B7' }}</span>
          </td>

          <!-- Size -->
          <td class="col-size">{{ task.size }}</td>

          <!-- ETA -->
          <td class="col-eta">{{ task.eta || '\u2014' }}</td>

          <!-- Actions -->
          <td class="col-actions">
            <button
              type="button"
              class="task-row-menu"
              title="Row actions"
              aria-label="Open task actions menu"
              aria-haspopup="menu"
              :aria-expanded="openMenuId === task.id"
              @click.stop="handleMenuToggle(task.id, $event)"
            >
              &#8943;
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Empty state with actionable CTAs (connecting banner / offline / no tasks) -->
    <EmptyState
      v-else
      :connecting="connecting"
      :connected="connected"
      :active-filter="activeFilter"
      @retry-connect="emit('retryConnect')"
      @try-sample="emit('trySample')"
    />
  </div>
</template>

<style scoped>
.task-table-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* --- Filter tabs --- */

.filter-tabs {
  display: flex;
  gap: var(--space-1, 4px);
  padding: var(--space-2, 8px) var(--space-4, 16px) 0;
}

.filter-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  padding: 0 var(--space-4, 16px);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  color: var(--fg-tertiary);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs, 6px);
  cursor: pointer;
  transition:
    color var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.filter-tab:hover {
  color: var(--fg-secondary);
  background: var(--surface-hover);
}

.filter-tab.active {
  color: var(--fg);
  background: var(--surface-elevated);
}

.filter-tab:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

/* --- Table --- */

.task-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.task-table thead {
  position: sticky;
  top: 0;
  z-index: 10;
}

.task-table th {
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--fg-tertiary);
  text-align: left;
  padding: var(--space-3, 12px);
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.task-table th.col-actions {
  padding-right: var(--space-3, 12px);
}

/* Column widths: 3% | 25% | 16% | 8% | 17% | 8% | 11% | 7% | 5% */
.task-table .col-check {
  width: 3%;
  text-align: center;
}
.task-table .col-name {
  width: 25%;
}
.task-table .col-source {
  width: 16%;
}
.task-table .col-status {
  width: 8%;
}
.task-table .col-progress {
  width: 17%;
}
.task-table .col-speed {
  width: 8%;
}
.task-table .col-size {
  width: 11%;
}
.task-table .col-eta {
  width: 7%;
}
.task-table .col-actions {
  width: 5%;
}

.task-table th.sortable {
  cursor: pointer;
  user-select: none;
  transition: color 120ms ease;
}
.task-table th.sortable:hover {
  color: var(--fg, #fafafa);
}
.sort-arrow {
  margin-left: 4px;
  font-size: 10px;
  opacity: 0.7;
}

.upload-speed {
  display: block;
  font-size: 11px;
  opacity: 0.6;
}

/* --- Table body rows --- */

.task-table tbody tr {
  min-height: var(--row-height, 56px);
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  animation: rowReveal 220ms var(--ease-default, cubic-bezier(0.2, 0.8, 0.2, 1)) backwards;
  animation-delay: calc(var(--row-i, 0) * 28ms);
  transition: background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

@keyframes rowReveal {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.task-table tbody tr:hover {
  background: var(--primary-subtle);
}

.task-table tbody tr.selected {
  background: var(--primary-muted);
  box-shadow: inset 2px 0 0 0 var(--primary);
}

.task-table tbody tr.row-flash {
  background: var(--primary-muted);
  transform: scale(1.005);
  transition: all 180ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

/* --- Cells --- */

.task-table td {
  padding: 0 var(--space-3, 12px);
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--fg);
  vertical-align: middle;
  overflow: hidden;
}

/* Name column — td must stay table-cell, flex goes on inner div */
.col-name {
  /* td default: table-cell */
}

.col-name-inner {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  overflow: hidden;
}

.task-type-icon {
  flex-shrink: 0;
  color: var(--fg-tertiary);
}

.task-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  min-width: 0;
}

/* Source column */
.col-source {
  color: var(--fg-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Mono columns */
.col-speed,
.col-size,
.col-eta,
.task-progress-pct {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  white-space: nowrap;
}

.col-speed,
.col-size,
.col-eta {
  color: var(--fg-secondary);
}

/* --- Status pills --- */

.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  padding: 0 var(--space-2, 8px);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: var(--radius-full, 9999px);
  white-space: nowrap;
}

.status-pill.downloading {
  background: var(--primary-muted);
  color: var(--primary);
}

.status-pill.paused {
  background: var(--warning-muted);
  color: var(--warning);
}

.status-pill.completed {
  background: var(--accent-muted);
  color: var(--accent);
}

.status-pill.error,
.status-pill.failed {
  background: var(--error-muted);
  color: var(--error);
}

.status-pill.pending {
  background: var(--surface-hover);
  color: var(--fg-tertiary);
}

/* --- Progress bar — td must stay table-cell, flex goes on inner div --- */

.col-progress {
  /* td default: table-cell */
}

.col-progress-inner {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.task-progress {
  flex: 1;
  height: 6px;
  background: var(--border);
  border-radius: var(--radius-full, 9999px);
  overflow: hidden;
  position: relative;
}

.task-progress-fill {
  height: 100%;
  border-radius: var(--radius-full, 9999px);
  position: relative;
  transition: width 300ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.task-progress-fill.downloading {
  background: linear-gradient(
    90deg,
    var(--primary) 0%,
    var(--primary) 40%,
    var(--primary-hover) 50%,
    var(--primary) 60%,
    var(--primary) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}

.task-progress-fill.downloading::after {
  content: '';
  position: absolute;
  inset: 0;
  background: inherit;
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.task-progress-fill.paused {
  background: var(--warning);
}

.task-progress-fill.completed {
  background: var(--accent);
}

.task-progress-fill.error,
.task-progress-fill.failed {
  background: var(--error);
}

.task-progress-pct {
  font-size: 12px;
  color: var(--fg-secondary);
  min-width: 36px;
  text-align: right;
}

/* --- Actions (row menu) --- */

.col-actions {
  text-align: right;
  white-space: nowrap;
}

.task-row-menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--fg-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  border-radius: var(--radius-xs, 6px);
  opacity: 0.7;
  transition:
    opacity var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    color var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.task-row-menu:hover,
tr:hover .task-row-menu {
  opacity: 1;
  color: var(--fg);
}

.task-row-menu:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
  opacity: 1;
}

/* --- Empty state --- */

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8, 48px) var(--space-5, 24px);
  text-align: center;
}

.empty-heading {
  font-family: var(--font-ui);
  font-size: 20px;
  font-weight: 600;
  color: var(--fg);
  margin: 0 0 var(--space-2, 8px) 0;
}

.empty-sub {
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.5;
  color: var(--fg-secondary);
  margin: 0 0 var(--space-4, 16px) 0;
  max-width: 380px;
}

.empty-action {
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  color: var(--primary);
  background: var(--primary-muted);
  border: 1px solid var(--primary);
  border-radius: var(--radius-xs, 6px);
  padding: 8px 20px;
  cursor: pointer;
  transition: background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.empty-action:hover {
  background: var(--primary);
  color: #fff;
}

.empty-action:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.empty-disconnected {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2, 8px);
}

/* --- Connecting banner --- */

.state-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3, 12px);
  padding: var(--space-8, 48px) var(--space-5, 24px);
  font-family: var(--font-ui);
  font-size: 14px;
  color: var(--fg-secondary);
}

.state-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border);
  border-top-color: var(--primary);
  border-radius: var(--radius-full, 9999px);
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* --- Reduced motion --- */

@media (prefers-reduced-motion: reduce) {
  .task-table tbody tr {
    animation: none !important;
  }

  .task-table tbody tr.row-flash {
    transform: none;
  }

  .task-progress-fill.downloading,
  .task-progress-fill.downloading::after {
    animation: none !important;
  }

  .task-progress-fill {
    transition-duration: 0.01ms !important;
  }
}
</style>
