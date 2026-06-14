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

import { computed, ref } from 'vue'
import type { Task, TaskStatus, TaskType } from '@/stores/tasks'

interface Props {
  tasks: Task[]
  activeFilter: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  openDetail: [task: Task]
  toggleMenu: [taskId: number, event: MouseEvent]
  'update:filter': [filter: string]
}>()

// --- Filter tabs ---

interface FilterTab {
  label: string
  value: string
}

const filterTabs: FilterTab[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Failed', value: 'failed' },
]

// --- State ---

const selectedRowIndex = ref<number>(-1)
const flashingRowId = ref<number | null>(null)
/** Track which row's context menu is currently open */
const openMenuId = ref<number | null>(null)

// --- Computed ---

const filteredTasks = computed<Task[]>(() => {
  if (props.activeFilter === 'all') return props.tasks
  if (props.activeFilter === 'active') {
    return props.tasks.filter(t => t.status === 'downloading' || t.status === 'paused')
  }
  return props.tasks.filter(t => {
    // Map 'failed' UI status to 'error' pill
    if (props.activeFilter === 'failed') return t.status === 'failed'
    return t.status === props.activeFilter
  })
})

// --- Empty state copy ---

interface EmptyState {
  heading: string
  sub: string
  cta?: string
}

const emptyState = computed<EmptyState>(() => {
  switch (props.activeFilter) {
    case 'all':
      return {
        heading: 'No downloads yet',
        sub: 'Add a magnet link, HTTP URL, or YouTube link to get started.',
        cta: 'Try a sample task',
      }
    case 'active':
      return {
        heading: 'Nothing downloading',
        sub: 'All your downloads are paused or completed.',
      }
    case 'completed':
      return {
        heading: 'Nothing completed yet',
        sub: 'Downloads appear here once they finish.',
      }
    case 'failed':
      return {
        heading: 'No failed downloads',
        sub: 'Failed downloads will appear here.',
      }
    default:
      return {
        heading: 'No tasks',
        sub: '',
      }
  }
})

// --- Helpers ---

/** Truncate source URLs for display */
function formatSource(source: string): string {
  if (!source) return ''
  // Shorten long URLs: keep protocol + domain + last path segment
  if (source.startsWith('magnet:')) return 'magnet:?xt=urn:btih:...'
  try {
    const url = new URL(source)
    const domain = url.hostname.replace('www.', '')
    return domain
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

// --- Type icons (inline SVG paths) ---

const typeIconPaths: Record<TaskType, string> = {
  video: 'M23 7l-7 5 7 5V7zM1 5h15v14H1V5z',
  audio: 'M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  document: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  archive: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  torrent: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
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

// --- Filter change ---

function setFilter(value: string): void {
  emit('update:filter', value)
  selectedRowIndex.value = -1
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
    <div class="filter-tabs">
      <button
        v-for="tab in filterTabs"
        :key="tab.value"
        type="button"
        class="filter-tab"
        :class="{ active: activeFilter === tab.value }"
        :aria-current="activeFilter === tab.value ? 'page' : 'false'"
        @click="setFilter(tab.value)"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Table -->
    <table v-if="filteredTasks.length > 0" class="task-table">
      <thead>
        <tr>
          <th class="col-name">Name</th>
          <th class="col-source">Source</th>
          <th class="col-status">Status</th>
          <th class="col-progress">Progress</th>
          <th class="col-speed">Speed</th>
          <th class="col-size">Size</th>
          <th class="col-eta">ETA</th>
          <th class="col-actions" />
        </tr>
      </thead>
      <tbody id="taskTableBody">
        <tr
          v-for="(task, i) in filteredTasks"
          :key="task.id"
          :data-task-id="task.id"
          :style="{ '--row-i': i }"
          :class="{
            selected: selectedRowIndex === i,
            'row-flash': flashingRowId === task.id,
          }"
          @click="handleRowClick(task)"
        >
          <!-- Name -->
          <td class="col-name">
            <div class="col-name-inner">
              <svg class="task-type-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path :d="typeIconPaths[task.type]" />
              </svg>
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
          <td class="col-speed">{{ task.status === 'downloading' ? task.speed : '\u00B7' }}</td>

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

    <!-- Empty state -->
    <div v-else class="empty-state">
      <h3 class="empty-heading">{{ emptyState.heading }}</h3>
      <p class="empty-sub">{{ emptyState.sub }}</p>
    </div>
  </div>
</template>

<style scoped>
.task-table-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
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

/* Column widths: 30% | 14% | 9% | 16% | 9% | 10% | 7% | 5% */
.task-table .col-name { width: 30%; }
.task-table .col-source { width: 14%; }
.task-table .col-status { width: 9%; }
.task-table .col-progress { width: 16%; }
.task-table .col-speed { width: 9%; }
.task-table .col-size { width: 10%; }
.task-table .col-eta { width: 7%; }
.task-table .col-actions { width: 5%; }

/* --- Table body rows --- */

.task-table tbody tr {
  height: var(--row-height, 56px);
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  animation: rowReveal 220ms var(--ease-default, cubic-bezier(0.2, 0.8, 0.2, 1)) backwards;
  animation-delay: calc(var(--row-i, 0) * 28ms);
  transition: background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

@keyframes rowReveal {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
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
  background: linear-gradient(90deg,
    var(--primary) 0%, var(--primary) 40%,
    var(--primary-hover) 50%,
    var(--primary) 60%, var(--primary) 100%
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
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
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
  margin: 0;
  max-width: 380px;
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
