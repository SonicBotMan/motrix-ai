<script setup lang="ts">
/**
 * TaskRow — single task row for TaskTable's <tbody>.
 *
 * Renders a <tr> with 9 cells: checkbox, name+icon, source, status pill,
 * progress bar, speed, size, ETA, actions button.
 *
 * Visual state (selected/flashing/menu-open) is passed as props — TaskRow
 * does NOT own cross-row state. Click events are emitted raw; the flash
 * animation coordination stays in TaskTable (single-row-at-a-time).
 *
 * Exposes scrollIntoView() for TaskTable's keyboard j/k navigation.
 */

import { ref } from 'vue'
import { NIcon } from 'naive-ui'
import type { Task } from '@/stores/tasks'
import { formatSource, statusPillClass, statusLabel, fillClass, typeIcons } from '@/shared/utils/task-utils'

interface Props {
  task: Task
  rowIndex: number
  selected: boolean
  keyboardSelected: boolean
  flashing: boolean
  menuOpen: boolean
}

const _props = defineProps<Props>()

const emit = defineEmits<{
  click: [task: Task]
  toggleMenu: [payload: { taskId: number; event: MouseEvent }]
  toggleSelect: [taskId: number]
}>()

// Root <tr> ref — exposed for parent's keyboard scrollIntoView.
const rootRef = ref<HTMLTableRowElement | null>(null)

function scrollIntoView(options?: globalThis.ScrollIntoViewOptions): void {
  rootRef.value?.scrollIntoView(options)
}

defineExpose({ scrollIntoView })
</script>

<template>
  <tr
    :ref="
      (el) => {
        rootRef = el as HTMLTableRowElement | null
      }
    "
    :data-task-id="task.id"
    :style="{ '--row-i': rowIndex }"
    :class="{
      selected: keyboardSelected,
      'row-flash': flashing,
    }"
    @click="emit('click', task)"
  >
    <!-- Checkbox -->
    <td class="col-check" @click.stop>
      <input type="checkbox" :checked="selected" @change="emit('toggleSelect', task.id)" />
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
          <div class="task-progress-fill" :class="fillClass(task.status)" :style="{ width: task.progress + '%' }" />
        </div>
        <span class="task-progress-pct">{{ task.progress }}%</span>
      </div>
    </td>

    <!-- Speed -->
    <td class="col-speed">
      <span v-if="task.status === 'downloading'">{{ task.speed }}</span>
      <span v-if="task.status === 'downloading' && task.uploadSpeed" class="upload-speed">↑{{ task.uploadSpeed }}</span>
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
        :aria-expanded="menuOpen"
        @click.stop="emit('toggleMenu', { taskId: task.id, event: $event })"
      >
        &#8943;
      </button>
    </td>
  </tr>
</template>

<style scoped>
/* --- Row --- */
/* Note: TaskRow renders <tr> directly (no .task-table tbody ancestor in scope).
   These styles target the <tr> root element via the component's own scoping. */

tr {
  min-height: var(--row-height, 56px);
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  animation: rowReveal 220ms var(--ease-default, cubic-bezier(0.2, 0.8, 0.2, 1)) backwards;
  animation-delay: calc(var(--row-i, 0) * 28ms);
  transition: background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

tr:hover {
  background: var(--primary-subtle);
}

tr.selected {
  background: var(--primary-muted);
  box-shadow: inset 2px 0 0 0 var(--primary);
}

tr.row-flash {
  background: var(--primary-muted);
  transform: scale(1.005);
  transition: all 180ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
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

/* --- Cells --- */
td {
  padding: 0 var(--space-3, 12px);
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--fg);
  vertical-align: middle;
  overflow: hidden;
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

.col-source {
  color: var(--fg-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

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

.upload-speed {
  display: block;
  font-size: 11px;
  opacity: 0.6;
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

/* --- Progress bar --- */
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

/* --- Reduced motion --- */
@media (prefers-reduced-motion: reduce) {
  tr {
    animation: none !important;
  }

  tr.row-flash {
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

/* Responsive: match TaskTable's Source column hide + reduced padding */
@media (max-width: 900px) {
  .col-source {
    display: none;
  }
  td {
    padding-left: 8px;
    padding-right: 8px;
  }
}
</style>
