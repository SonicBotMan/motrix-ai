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
import type { Task } from '@/stores/tasks'
import FilterTabs from './FilterTabs.vue'
import EmptyState from './EmptyState.vue'
import TaskRow from './TaskRow.vue'

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

type ScrollableElement = {
  scrollIntoView(options?: { block?: string; behavior?: string; inline?: string }): void
}

const flashingRowId = ref<number | null>(null)
const openMenuId = ref<number | null>(null)
const rowRefs = ref<Array<ScrollableElement | null>>([])

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

// --- Ref helpers for template ---

function setRowRef(el: unknown, i: number) {
  rowRefs.value[i] = el as ScrollableElement | null
}

function handleToggleMenuPayload(p: { taskId: number; event: MouseEvent }) {
  handleMenuToggle(p.taskId, p.event)
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

// --- Computed ---

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
        <TaskRow
          v-for="(task, i) in displayTasks"
          :key="task.id"
          :ref="(el) => setRowRef(el, i)"
          :task="task"
          :row-index="i"
          :selected="selectedIds.has(task.id)"
          :keyboard-selected="keyboardIndex === i"
          :flashing="flashingRowId === task.id"
          :menu-open="openMenuId === task.id"
          @click="handleRowClick"
          @toggle-menu="handleToggleMenuPayload"
          @toggle-select="(id: number) => emit('toggleSelect', id)"
        />
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
.task-table :deep(.col-check) {
  width: 3%;
  text-align: center;
}
.task-table :deep(.col-name) {
  width: 25%;
}
.task-table :deep(.col-source) {
  width: 16%;
}
.task-table :deep(.col-status) {
  width: 8%;
}
.task-table :deep(.col-progress) {
  width: 17%;
}
.task-table :deep(.col-speed) {
  width: 8%;
}
.task-table :deep(.col-size) {
  width: 11%;
}
.task-table :deep(.col-eta) {
  width: 7%;
}
.task-table :deep(.col-actions) {
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
</style>
