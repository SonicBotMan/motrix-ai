<script setup lang="ts">
/**
 * RowMenu — per-row ··· dropdown
 *
 * Spec: docs/design/handoff/02-components.md §6
 *
 * 4 items: Pause/Resume (status-dependent), Retry, Delete, Open file location.
 * Positioned below the trigger; closes on outside click or Escape.
 *
 * The trigger button is rendered by the parent; this component renders the
 * dropdown itself. Bind `show` to the parent's open state and listen for
 * `close` to reset it.
 */

import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import type { Task } from '@/stores/tasks'

const props = defineProps<{
  task: Task
  show: boolean
  /** Click X coordinate for fixed positioning (from MouseEvent.clientX) */
  x?: number
  /** Click Y coordinate for fixed positioning (from MouseEvent.clientY) */
  y?: number
}>()

/** Clamp the menu within the viewport so it never overflows the right edge */
const menuLeft = computed(() => {
  const x = props.x ?? 0
  const approxWidth = 184
  if (x + approxWidth > window.innerWidth) {
    return Math.max(8, window.innerWidth - approxWidth - 8) + 'px'
  }
  return x + 'px'
})

/** Position 4px below the click point */
const menuTop = computed(() => (props.y ?? 0) + 4 + 'px')

const emit = defineEmits<{
  pause: []
  resume: []
  retry: []
  delete: []
  openLocation: []
  close: []
}>()

const menuRef = ref<HTMLElement | null>(null)

/** When `downloading`, the primary action is Pause; otherwise Resume */
const isDownloading = () => props.task.status === 'downloading'
const isPaused = () => props.task.status === 'paused'

/** Outside-click handler — bound while open */
function handleDocumentClick(e: MouseEvent) {
  if (!props.show) return
  const target = e.target as Node
  if (menuRef.value && !menuRef.value.contains(target)) {
    emit('close')
  }
}

/** Escape closes */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.show) {
    e.stopPropagation()
    emit('close')
  }
}

watch(
  () => props.show,
  async (visible) => {
    if (visible) {
      document.addEventListener('click', handleDocumentClick, true)
      document.addEventListener('keydown', handleKeydown, true)
      await nextTick()
    } else {
      document.removeEventListener('click', handleDocumentClick, true)
      document.removeEventListener('keydown', handleKeydown, true)
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick, true)
  document.removeEventListener('keydown', handleKeydown, true)
})

function run(action: 'pause' | 'resume' | 'retry' | 'delete' | 'openLocation') {
  switch (action) {
    case 'pause':
      emit('pause')
      break
    case 'resume':
      emit('resume')
      break
    case 'retry':
      emit('retry')
      break
    case 'delete':
      emit('delete')
      break
    case 'openLocation':
      emit('openLocation')
      break
  }
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="row-menu">
      <div
        v-if="props.show"
        ref="menuRef"
        class="row-menu"
        :style="{ left: menuLeft, top: menuTop }"
        role="menu"
        aria-label="Task actions"
      >
        <!-- Pause / Resume (status-dependent) -->
        <button v-if="isDownloading()" class="row-menu-item" role="menuitem" type="button" @click="run('pause')">
          <svg
            class="row-menu-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
          <span>Pause</span>
        </button>
        <button v-if="isPaused()" class="row-menu-item" role="menuitem" type="button" @click="run('resume')">
          <svg
            class="row-menu-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span>Resume</span>
        </button>

        <!-- Retry -->
        <button class="row-menu-item" role="menuitem" type="button" @click="run('retry')">
          <svg
            class="row-menu-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span>Retry</span>
        </button>

        <div class="row-menu-sep" role="separator" />

        <!-- Delete (danger) -->
        <button class="row-menu-item row-menu-item--danger" role="menuitem" type="button" @click="run('delete')">
          <svg
            class="row-menu-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          <span>Delete</span>
        </button>

        <div class="row-menu-sep" role="separator" />

        <!-- Open file location -->
        <button class="row-menu-item" role="menuitem" type="button" @click="run('openLocation')">
          <svg
            class="row-menu-icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          <span>Open file location</span>
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.row-menu {
  position: fixed;
  z-index: var(--z-hover-menu);
  min-width: 168px;
  padding: var(--space-1);
  background: var(--surface-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
}

.row-menu-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  padding: var(--space-2) var(--space-3);
  font-family: var(--font-ui);
  font-size: var(--text-body-sm);
  font-weight: 400;
  color: var(--fg);
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--transition-fast) var(--ease-out),
    color var(--transition-fast) var(--ease-out);
}

.row-menu-item:hover {
  background: var(--surface-hover);
}

.row-menu-item:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
  box-shadow: 0 0 0 4px var(--focus-ring-soft);
}

.row-menu-item--danger {
  color: var(--error);
}

.row-menu-item--danger:hover {
  background: var(--error-muted);
}

.row-menu-icon {
  flex: 0 0 auto;
  color: var(--fg-tertiary);
}

.row-menu-item--danger .row-menu-icon {
  color: var(--error);
}

.row-menu-sep {
  height: 1px;
  margin: var(--space-1) 0;
  background: var(--border);
}

/* --- Enter / leave transition (140ms fade + translateY 8px → 0) --- */
.row-menu-enter-active,
.row-menu-leave-active {
  transition:
    opacity 140ms var(--ease-out),
    transform 140ms var(--ease-out);
}

.row-menu-enter-from,
.row-menu-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
