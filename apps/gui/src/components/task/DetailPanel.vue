<script setup lang="ts">
/**
 * DetailPanel — 5-zone task detail overlay
 *
 * Spec: docs/design/handoff/02-components.md §4
 * Sizing: 720 × min(88vh, 760px), centered horizontally + vertically.
 *
 * 5 zones:
 *   1. Sticky header: icon + filename + status chip + more menu + close
 *   2. 4-col stat strip: Size / Speed / ETA / Connections
 *   3. Progress ring (SVG circular progress, 120×120)
 *   4. Collapsible sections: Files list, Timeline (native <details>)
 *   5. Sticky footer: Pause/Resume + Retry + Delete
 *
 * Open:  modalScaleIn (400ms) — applied via .detail-panel
 * Close: modalScaleOut (220ms) — applied via .detail-panel--closing,
 *        then @close fires. Backdrop click + Esc also close.
 *
 * The ring rotation lives on a <g> wrapper (not the <svg> itself) so the
 * centered percentage text stays upright — a real bug from the handoff spec.
 */

import { computed, ref, watch, onUnmounted, nextTick } from 'vue'
import { NIcon } from 'naive-ui'
import {
  DownloadOutline,
  EllipsisHorizontal,
  CopyOutline,
  FolderOutline,
  TrashOutline,
  CloseOutline,
  ChevronDownOutline,
} from '@vicons/ionicons5'
import type { Task } from '@/stores/tasks'
import { bytesToSize } from '@/shared/utils/format'

interface TimelineEvent {
  time: string
  text: string
  type?: 'active' | 'completed' | 'info'
}

interface DetailTask extends Task {
  timeline?: TimelineEvent[]
}

const props = defineProps<{
  show: boolean
  task: DetailTask | null
}>()

const emit = defineEmits<{
  close: []
  pause: []
  resume: []
  retry: []
  delete: []
  openLocation: []
  copySource: []
  toggleFile: [payload: { index: number; name: string; checked: boolean }]
  priority: []
}>()

const panelRef = ref<HTMLElement | null>(null)

const peers = ref<Array<{ ip: string; port: string; downloadSpeed: string; uploadSpeed: string }>>([])

function formatPeerSpeed(speedStr: string): string {
  const speed = Number(speedStr) || 0
  if (speed >= 1_000_000) return `${(speed / 1_000_000).toFixed(1)}MB/s`
  if (speed >= 1_000) return `${(speed / 1_000).toFixed(0)}KB/s`
  return `${speed}B/s`
}

let peerPollTimer: ReturnType<typeof setInterval> | null = null

async function fetchPeers(): Promise<void> {
  if (!props.task?.gid) {
    peers.value = []
    return
  }
  try {
    const { useAria2 } = await import('@/composables/useAria2')
    const aria2 = useAria2()
    if (aria2.connected.value) {
      peers.value = await aria2.getPeers(props.task.gid)
    }
  } catch {
    peers.value = []
  }
}

watch(
  () => props.task?.gid,
  (gid) => {
    if (peerPollTimer) {
      clearInterval(peerPollTimer)
      peerPollTimer = null
    }
    if (gid) {
      void fetchPeers()
      peerPollTimer = setInterval(() => void fetchPeers(), 3000)
    } else {
      peers.value = []
    }
  },
)

onUnmounted(() => {
  if (peerPollTimer) clearInterval(peerPollTimer)
})
const isClosing = ref(false)
const showMoreMenu = ref(false)
const moreMenuRef = ref<HTMLElement | null>(null)

/** Status → label + color token for the status chip */
const statusInfo = computed(() => {
  if (!props.task) return { label: '', cls: '' }
  switch (props.task.status) {
    case 'downloading':
      return { label: 'DOWNLOADING', cls: 'downloading' }
    case 'paused':
      return { label: 'PAUSED', cls: 'paused' }
    case 'completed':
      return { label: 'COMPLETED', cls: 'completed' }
    case 'failed':
      return { label: 'FAILED', cls: 'error' }
    default:
      return { label: 'PENDING', cls: '' }
  }
})

/** Ring stroke color follows status, same mapping as the progress bar */
const ringColor = computed(() => {
  if (!props.task) return 'var(--border)'
  switch (props.task.status) {
    case 'downloading':
      return 'var(--primary)'
    case 'paused':
      return 'var(--warning)'
    case 'completed':
      return 'var(--accent)'
    case 'failed':
      return 'var(--error)'
    default:
      return 'var(--border)'
  }
})

/** Circumference of r=48 ring → 2π·48 ≈ 301.6 */
const RING_CIRC = 2 * Math.PI * 48
const ringDashoffset = computed(() => {
  const pct = Math.max(0, Math.min(100, props.task?.progress ?? 0))
  return RING_CIRC * (1 - pct / 100)
})

/** Caption under the ring */
const ringCaption = computed(() => {
  if (!props.task) return ''
  switch (props.task.status) {
    case 'downloading':
      return `Downloading · ${props.task.eta || '—'} remaining`
    case 'paused':
      return 'Paused'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed. Retry to resume.'
    default:
      return 'Queued'
  }
})

const files = computed(() => props.task?.files ?? [])
const timeline = computed(() => props.task?.timeline ?? [])
const isPaused = computed(() => props.task?.status === 'paused')

function formatFileSize(bytes: number): string {
  return bytesToSize(bytes)
}

/** Sub-line under the filename in the header */
const subLine = computed(() => {
  if (!props.task) return ''
  return [props.task.size, props.task.type, props.task.source].filter(Boolean).join(' · ')
})

/** Esc handler bound while open */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.show && !isClosing.value) {
    requestClose()
  }
}

/** Animate close (220ms) then emit @close so the parent can hide us */
function requestClose() {
  if (isClosing.value) return
  isClosing.value = true
  setTimeout(() => {
    isClosing.value = false
    emit('close')
  }, 220)
}

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.removeEventListener('click', handleMoreMenuOutsideClick, true)
})

function onPause() {
  emit('pause')
}
function onResume() {
  emit('resume')
}
function onRetry() {
  emit('retry')
}

/** Toggle the more-actions dropdown */
function toggleMoreMenu() {
  showMoreMenu.value = !showMoreMenu.value
}

/** Run an action from the more-menu */
function onMoreAction(action: 'copySource' | 'openLocation' | 'delete') {
  showMoreMenu.value = false
  if (action === 'copySource') emit('copySource')
  else if (action === 'openLocation') emit('openLocation')
  else if (action === 'delete') emit('delete')
}

/** Outside-click handler for the more-menu dropdown */
function handleMoreMenuOutsideClick(e: MouseEvent) {
  if (!showMoreMenu.value) return
  const target = e.target as Node
  if (moreMenuRef.value && !moreMenuRef.value.contains(target)) {
    showMoreMenu.value = false
  }
}

watch(
  () => props.show,
  async (visible) => {
    if (visible) {
      document.addEventListener('keydown', handleKeydown)
      await nextTick()
      panelRef.value?.focus()
    } else {
      document.removeEventListener('keydown', handleKeydown)
      isClosing.value = false
      showMoreMenu.value = false
    }
  },
)

/** Bind/unbind the more-menu outside-click listener */
watch(showMoreMenu, (visible) => {
  if (visible) {
    document.addEventListener('click', handleMoreMenuOutsideClick, true)
  } else {
    document.removeEventListener('click', handleMoreMenuOutsideClick, true)
  }
})
</script>

<template>
  <Teleport to="body">
    <div v-if="props.show" class="detail-overlay" @click.self="requestClose">
      <div
        ref="panelRef"
        class="detail-panel"
        :class="{ 'detail-panel--closing': isClosing }"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="props.task ? 'detailName' : undefined"
        tabindex="-1"
      >
        <template v-if="props.task">
          <!-- ── Zone 1: Sticky header ────────────────────────────── -->
          <header class="detail-header">
            <div class="detail-header-left">
              <div class="detail-icon" aria-hidden="true">
                <NIcon :component="DownloadOutline" :size="20" />
              </div>
              <div class="detail-header-text">
                <h2 id="detailName" class="detail-name" :title="props.task.name">
                  {{ props.task.name }}
                </h2>
                <p class="detail-sub">{{ subLine }}</p>
              </div>
            </div>
            <div class="detail-header-right">
              <span v-if="statusInfo.label" class="detail-status-chip" :class="statusInfo.cls">{{
                statusInfo.label
              }}</span>
              <div ref="moreMenuRef" class="detail-more-menu-wrap">
                <button
                  class="detail-icon-btn detail-more-menu"
                  title="More actions"
                  aria-haspopup="menu"
                  :aria-expanded="showMoreMenu"
                  type="button"
                  @click.stop="toggleMoreMenu"
                >
                  <NIcon :component="EllipsisHorizontal" :size="16" aria-hidden="true" />
                </button>
                <Transition name="row-menu">
                  <div v-if="showMoreMenu" class="detail-more-dropdown" role="menu" aria-label="More actions">
                    <button
                      class="row-menu-item"
                      role="menuitem"
                      type="button"
                      @click.stop="onMoreAction('copySource')"
                    >
                      <NIcon class="row-menu-icon" :component="CopyOutline" :size="14" aria-hidden="true" />
                      <span>Copy source</span>
                    </button>
                    <button
                      class="row-menu-item"
                      role="menuitem"
                      type="button"
                      @click.stop="onMoreAction('openLocation')"
                    >
                      <NIcon class="row-menu-icon" :component="FolderOutline" :size="14" aria-hidden="true" />
                      <span>Open file location</span>
                    </button>
                    <div class="row-menu-sep" role="separator" />
                    <button
                      class="row-menu-item row-menu-item--danger"
                      role="menuitem"
                      type="button"
                      @click.stop="onMoreAction('delete')"
                    >
                      <NIcon class="row-menu-icon" :component="TrashOutline" :size="14" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>
                </Transition>
              </div>
              <button
                class="detail-icon-btn detail-close"
                title="Close (Esc)"
                aria-label="Close detail panel"
                type="button"
                @click="requestClose"
              >
                <NIcon :component="CloseOutline" :size="16" aria-hidden="true" />
              </button>
            </div>
          </header>

          <!-- ── Zone 2: 4-col stat strip ─────────────────────────── -->
          <section class="detail-stats" aria-label="Task statistics">
            <div class="stat-cell">
              <div class="stat-label">Size</div>
              <div class="stat-value">{{ props.task.size }}</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">↓ Speed</div>
              <div class="stat-value">{{ props.task.speed || '·' }}</div>
            </div>
            <div v-if="props.task.uploadSpeed" class="stat-cell">
              <div class="stat-label">↑ Upload</div>
              <div class="stat-value">{{ props.task.uploadSpeed }}</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">ETA</div>
              <div class="stat-value">{{ props.task.eta || '—' }}</div>
            </div>
            <div class="stat-cell">
              <div class="stat-label">Seeders</div>
              <div class="stat-value">{{ props.task.seeders ?? '—' }}</div>
            </div>
            <div v-if="props.task.gid" class="stat-cell">
              <div class="stat-label">GID</div>
              <div class="stat-value stat-mono">{{ props.task.gid.slice(0, 12) }}</div>
            </div>
            <div v-if="peers.length > 0" class="stat-cell">
              <div class="stat-label">Peers</div>
              <div class="stat-value">{{ peers.length }}</div>
            </div>
          </section>
          <div v-if="peers.length > 0" class="peer-list-section">
            <div class="peer-list-header">Peer Details</div>
            <div v-for="(peer, i) in peers.slice(0, 10)" :key="i" class="peer-row">
              <span class="peer-ip">{{ peer.ip }}:{{ peer.port }}</span>
              <span class="peer-speed">↓{{ formatPeerSpeed(peer.downloadSpeed) }}</span>
            </div>
          </div>
          <div v-if="props.task.errorMessage" class="detail-error-banner">
            {{ props.task.errorMessage }}
          </div>

          <!-- ── Zone 3: Progress ring ────────────────────────────── -->
          <section class="detail-ring" aria-label="Download progress">
            <svg
              class="ring-svg"
              width="120"
              height="120"
              viewBox="0 0 120 120"
              role="progressbar"
              :aria-valuenow="props.task.progress"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-valuetext="`${props.task.progress}% complete`"
            >
              <!-- background ring -->
              <circle cx="60" cy="60" r="48" fill="none" stroke="var(--border)" stroke-width="4" />
              <!-- foreground ring (rotate on the <g> so text stays upright) -->
              <g transform="rotate(-90 60 60)">
                <circle
                  cx="60"
                  cy="60"
                  r="48"
                  fill="none"
                  :stroke="ringColor"
                  stroke-width="4"
                  stroke-linecap="round"
                  :stroke-dasharray="RING_CIRC"
                  :stroke-dashoffset="ringDashoffset"
                />
              </g>
              <text x="60" y="60" text-anchor="middle" dominant-baseline="central" class="ring-text">
                {{ props.task.progress }}%
              </text>
            </svg>
            <p class="ring-caption">{{ ringCaption }}</p>
          </section>

          <!-- ── Zone 4: Collapsible sections ──────────────────────── -->
          <section class="detail-sections">
            <details class="detail-section" open>
              <summary class="detail-summary">
                <span class="summary-title"
                  >Files <span class="summary-count">({{ files.length }})</span></span
                >
                <NIcon class="summary-chevron" :component="ChevronDownOutline" :size="14" aria-hidden="true" />
              </summary>
              <div v-if="files.length" class="files-list">
                <div v-for="(f, i) in files" :key="i" class="file-row">
                  <input
                    type="checkbox"
                    class="file-check"
                    :checked="f.selected"
                    :aria-label="f.name"
                    @change="
                      emit('toggleFile', {
                        index: i,
                        name: f.name,
                        checked: ($event.target as HTMLInputElement).checked,
                      })
                    "
                  />
                  <span class="file-name" :title="f.name">{{ f.name }}</span>
                  <span class="file-size">{{ formatFileSize(f.size) }}</span>
                </div>
              </div>
              <p v-else class="empty-note">No file list available.</p>
            </details>

            <details class="detail-section">
              <summary class="detail-summary">
                <span class="summary-title">Sources</span>
                <NIcon class="summary-chevron" :component="ChevronDownOutline" :size="14" aria-hidden="true" />
              </summary>
              <div class="sources-list">
                <p class="source-url" :title="props.task.source">{{ props.task.source }}</p>
              </div>
            </details>

            <details class="detail-section" open>
              <summary class="detail-summary">
                <span class="summary-title"
                  >Timeline <span class="summary-count">({{ timeline.length }})</span></span
                >
                <NIcon class="summary-chevron" :component="ChevronDownOutline" :size="14" aria-hidden="true" />
              </summary>
              <div v-if="timeline.length" class="timeline-list">
                <div v-for="(ev, i) in timeline" :key="i" class="timeline-row">
                  <span class="timeline-dot" :class="ev.type ?? 'info'" aria-hidden="true" />
                  <span class="timeline-time">{{ ev.time }}</span>
                  <span class="timeline-text">{{ ev.text }}</span>
                </div>
              </div>
              <p v-else class="empty-note">No activity yet.</p>
            </details>
          </section>

          <!-- ── Zone 5: Sticky footer ────────────────────────────── -->
          <footer class="detail-footer">
            <button v-if="isPaused" class="footer-btn footer-btn--primary" type="button" @click="onResume">
              Resume
            </button>
            <button
              v-else-if="props.task.status === 'downloading'"
              class="footer-btn footer-btn--primary"
              type="button"
              @click="onPause"
            >
              Pause
            </button>
            <button
              v-if="props.task.status === 'failed'"
              class="footer-btn footer-btn--ghost"
              type="button"
              @click="onRetry"
            >
              Retry
            </button>
            <button
              v-if="props.task.status === 'downloading' || props.task.status === 'pending'"
              class="footer-btn footer-btn--ghost"
              type="button"
              @click="emit('priority')"
            >
              Priority
            </button>
          </footer>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Overlay + backdrop ──────────────────────────────────────────── */
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal-backdrop);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  animation: fadeSlideUp 250ms var(--ease-out);
}

/* ── Panel ───────────────────────────────────────────────────────── */
.detail-panel {
  width: 720px;
  max-width: 94vw;
  height: min(88vh, 760px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xl);
  z-index: var(--z-modal-panel);
  outline: none;
  overflow: hidden;
  animation: modalScaleIn 400ms var(--ease-default);
}

.detail-panel--closing {
  animation: modalScaleOut 220ms var(--ease-default) forwards;
}

/* ── Zone 1: Header ──────────────────────────────────────────────── */
.detail-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  height: 64px;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.detail-header-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  flex: 1 1 auto;
}

.detail-icon {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  background: var(--primary-muted);
  color: var(--primary);
}

.detail-header-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.detail-name {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-sub {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-caption);
  color: var(--fg-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-header-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: 0 0 auto;
}

.detail-status-chip {
  font-family: var(--font-ui);
  font-size: var(--text-caption);
  font-weight: 500;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 4px var(--space-2);
  border-radius: var(--radius-full);
  background: var(--surface-hover);
  color: var(--fg-secondary);
}

.detail-status-chip.downloading {
  background: var(--primary-muted);
  color: var(--primary);
}

.detail-status-chip.paused {
  background: var(--warning-muted);
  color: var(--warning);
}

.detail-status-chip.completed {
  background: var(--accent-muted);
  color: var(--accent);
}

.detail-status-chip.error {
  background: var(--error-muted);
  color: var(--error);
}

.detail-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--fg-tertiary);
  cursor: pointer;
  transition:
    background var(--transition-fast) var(--ease-out),
    color var(--transition-fast) var(--ease-out);
}

.detail-icon-btn:hover {
  background: var(--surface-hover);
  color: var(--fg);
}

.detail-icon-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

/* ── More-menu dropdown ──────────────────────────────────────────── */

.detail-more-menu-wrap {
  position: relative;
  display: inline-flex;
}

.detail-more-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
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

.detail-more-dropdown .row-menu-item {
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

.detail-more-dropdown .row-menu-item:hover {
  background: var(--surface-hover);
}

.detail-more-dropdown .row-menu-icon {
  flex: 0 0 auto;
  color: var(--fg-tertiary);
}

.detail-more-dropdown .row-menu-item--danger {
  color: var(--error);
}

.detail-more-dropdown .row-menu-item--danger .row-menu-icon {
  color: var(--error);
}

.detail-more-dropdown .row-menu-item--danger:hover {
  background: var(--error-muted);
}

.detail-more-dropdown .row-menu-sep {
  height: 1px;
  margin: var(--space-1) 0;
  background: var(--border);
}

/* Enter / leave transition (reuses row-menu transition name) */
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

/* ── Zone 2: Stat strip ──────────────────────────────────────────── */
.detail-stats {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  min-height: 80px;
  border-bottom: 1px solid var(--border);
}

.stat-cell {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-right: 1px solid var(--border);
}

.stat-cell:last-child {
  border-right: none;
}

.stat-label {
  font-family: var(--font-ui);
  font-size: var(--text-micro);
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-tertiary);
}

.stat-value {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum' 1;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-h2);
  font-weight: 600;
  color: var(--fg);
  white-space: nowrap;
}

.stat-mono {
  font-size: var(--text-body-sm);
}

.detail-error-banner {
  flex: 0 0 auto;
  padding: var(--space-2) var(--space-5);
  background: var(--error-muted, rgba(239, 68, 68, 0.1));
  color: var(--error, #ef4444);
  font-size: var(--text-body-sm);
  border-bottom: 1px solid var(--border);
}

/* ── Zone 3: Progress ring ───────────────────────────────────────── */
.detail-ring {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-5) var(--space-5);
}

.ring-svg {
  display: block;
}

.ring-text {
  font-family: var(--font-ui);
  font-size: 26px;
  font-weight: 600;
  fill: var(--fg);
}

.ring-caption {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-body-sm);
  color: var(--fg-tertiary);
  text-align: center;
}

/* ── Zone 4: Sections (scrollable) ───────────────────────────────── */
.detail-sections {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 var(--space-5) var(--space-6);
}

.detail-section {
  border-bottom: 1px solid var(--border);
}

.detail-section:last-child {
  border-bottom: none;
}

.detail-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-4) 0;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.detail-summary::-webkit-details-marker {
  display: none;
}

.summary-title {
  font-family: var(--font-ui);
  font-size: var(--text-body-lg);
  font-weight: 600;
  color: var(--fg);
}

.summary-count {
  font-weight: 400;
  color: var(--fg-tertiary);
}

.summary-chevron {
  color: var(--fg-tertiary);
  transition: transform var(--transition-fast) var(--ease-out);
}

.detail-section[open] .summary-chevron {
  transform: rotate(180deg);
}

/* Files list */
.files-list {
  display: flex;
  flex-direction: column;
  padding-bottom: var(--space-4);
}

.file-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}

.file-check {
  flex: 0 0 auto;
  width: 14px;
  height: 14px;
  accent-color: var(--primary);
  cursor: pointer;
}

.file-name {
  flex: 1 1 auto;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: var(--text-body-sm);
  color: var(--fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-feature-settings: 'tnum' 1;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-body-sm);
  color: var(--fg-tertiary);
  white-space: nowrap;
}

/* Timeline */
.timeline-list {
  display: flex;
  flex-direction: column;
  padding-bottom: var(--space-4);
}

.timeline-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) 0;
}

.timeline-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--fg-muted);
}

.timeline-dot.active {
  background: var(--primary);
}

.timeline-dot.completed {
  background: var(--accent);
}

.timeline-time {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-feature-settings: 'tnum' 1;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-micro);
  color: var(--fg-tertiary);
}

.timeline-text {
  font-family: var(--font-ui);
  font-size: var(--text-body-sm);
  color: var(--fg);
}

.empty-note {
  margin: 0;
  padding-bottom: var(--space-4);
  font-family: var(--font-ui);
  font-size: var(--text-body-sm);
  color: var(--fg-tertiary);
}

/* Sources section */
.sources-list {
  padding-bottom: var(--space-4);
}

.source-url {
  margin: 0;
  font-family: var(--font-mono);
  font-size: var(--text-body-sm);
  color: var(--fg-secondary);
  word-break: break-all;
  line-height: 1.5;
}

/* ── Zone 5: Footer ──────────────────────────────────────────────── */
.detail-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.footer-btn {
  flex: 1 1 0;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  font-size: var(--text-body-sm);
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition:
    background var(--transition-fast) var(--ease-out),
    border-color var(--transition-fast) var(--ease-out),
    color var(--transition-fast) var(--ease-out);
}

.footer-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.footer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer-btn--primary {
  background: var(--primary);
  color: #fff;
}

.footer-btn--primary:not(:disabled):hover {
  background: var(--primary-hover);
}

.footer-btn--ghost {
  background: transparent;
  color: var(--fg-secondary);
  border-color: var(--border);
}

.footer-btn--ghost:not(:disabled):hover {
  background: var(--surface-hover);
  color: var(--fg);
  border-color: var(--border-hover);
}

.footer-btn--danger {
  background: transparent;
  color: var(--error);
  border-color: var(--error);
}

.footer-btn--danger:not(:disabled):hover {
  background: var(--error-muted);
}
</style>
