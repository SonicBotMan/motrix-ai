<script setup lang="ts">
/**
 * TaskFirstView — Task-first main layout for Motrix AI
 *
 * Layout (per HANDOFF.md §3):
 *   - ChromeBar at top (48px)
 *   - TaskTable in middle (remaining space, ~80%)
 *   - BottomChat at bottom (96px)
 *   - ToastStack floating above BottomChat
 *   - DetailPanel as overlay (when task clicked)
 *   - RowMenu as dropdown (when ··· clicked)
 *
 * The task table is the hero. The chat input is the input bar.
 * This is NOT a chat-first design (HANDOFF §2.1).
 *
 * Design ref: docs/design/handoff/HANDOFF.md §3, 02-components.md
 */

import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import ChromeBar from '@/components/chrome/ChromeBar.vue'
import TaskTable from '@/components/task/TaskTable.vue'
import DetailPanel from '@/components/task/DetailPanel.vue'
import RowMenu from '@/components/task/RowMenu.vue'
import BottomChat from '@/components/chat/BottomChat.vue'
import ToastStack, { type Toast, type ToastType } from '@/components/toast/ToastStack.vue'
import OnboardingCard from '@/components/onboarding/OnboardingCard.vue'
import type { Task } from '@/stores/tasks'

// ---------------------------------------------------------------------------
// Extended task shape for the mock data (adds detail-panel fields)
// ---------------------------------------------------------------------------

interface MockTask extends Task {
  total: string
  connections: number
  seeders?: number
  leechers?: number
  files: Array<{ name: string; size: string; checked: boolean }>
  timeline: Array<{ time: string; text: string; type: 'active' | 'completed' | 'info' }>
}

// ---------------------------------------------------------------------------
// Mock data — 14 tasks (docs/design/handoff/05-mock-data.md)
// ---------------------------------------------------------------------------

const tasks = ref<MockTask[]>([
  {
    id: 1,
    name: 'ubuntu-24.04-desktop-amd64.iso',
    source: 'https://releases.ubuntu.com/24.04/ubuntu-24.04-desktop-amd64.iso',
    type: 'document',
    status: 'downloading',
    progress: 84,
    speed: '24.6 MB/s',
    size: '4.8 GB',
    total: '5.7 GB',
    eta: '38s',
    connections: 12,
    seeders: 47,
    leechers: 3,
    files: [{ name: 'ubuntu-24.04-desktop-amd64.iso', size: '5.7 GB', checked: true }],
    timeline: [
      { time: '14:23:05', text: 'Downloading at 84% complete', type: 'active' },
      { time: '14:22:30', text: 'Connecting to peers (47 seeders)', type: 'info' },
      { time: '14:22:10', text: 'Metadata received', type: 'completed' },
      { time: '14:21:45', text: 'Resolving redirect from ubuntu.com', type: 'info' },
      { time: '14:21:30', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 2,
    name: 'The.Weeknd.-.Dawn.FM.2025.mp3',
    source: 'https://qobuz.com/stream/dawn-fm-2025',
    type: 'audio',
    status: 'downloading',
    progress: 62,
    speed: '8.2 MB/s',
    size: '142 MB',
    total: '228 MB',
    eta: '11s',
    connections: 4,
    files: [{ name: 'The.Weeknd.-.Dawn.FM.2025.mp3', size: '228 MB', checked: true }],
    timeline: [
      { time: '14:22:50', text: 'Downloading at 62% complete', type: 'active' },
      { time: '14:22:20', text: 'Stream started from qobuz.com', type: 'info' },
      { time: '14:22:00', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 3,
    name: 'debian-12.10.0-amd64-netinst.iso',
    source: 'https://cdimage.debian.org/12.10.0/amd64/iso-cd/debian-12.10.0-amd64-netinst.iso',
    type: 'document',
    status: 'downloading',
    progress: 0,
    speed: '\u00B7',
    size: '0 MB',
    total: '870 MB',
    eta: '\u2014',
    connections: 0,
    files: [{ name: 'debian-12.10.0-amd64-netinst.iso', size: '870 MB', checked: false }],
    timeline: [
      { time: '14:23:10', text: 'Queued for download', type: 'active' },
      { time: '14:23:08', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 4,
    name: 'archlinux-2025.05.01-x86_64.iso',
    source: 'https://archlinux.org/download/archlinux-2025.05.01-x86_64.iso',
    type: 'document',
    status: 'paused',
    progress: 45,
    speed: '0 B/s',
    size: '360 MB',
    total: '798 MB',
    eta: '\u2014',
    connections: 6,
    files: [{ name: 'archlinux-2025.05.01-x86_64.iso', size: '798 MB', checked: false }],
    timeline: [
      { time: '14:20:15', text: 'Paused by user', type: 'info' },
      { time: '14:18:30', text: 'Downloading at 45% complete', type: 'completed' },
      { time: '14:17:00', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 5,
    name: 'code-visual-studio-code-linux-x64.deb',
    source: 'https://code.visualstudio.com/download/linux-deb-x64',
    type: 'archive',
    status: 'downloading',
    progress: 28,
    speed: '9.8 MB/s',
    size: '25 MB',
    total: '89 MB',
    eta: '7s',
    connections: 8,
    files: [{ name: 'code-visual-studio-code-linux-x64.deb', size: '89 MB', checked: false }],
    timeline: [
      { time: '14:23:00', text: 'Downloading at 28% complete', type: 'active' },
      { time: '14:22:45', text: 'Connection established', type: 'info' },
      { time: '14:22:40', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 6,
    name: 'big-buck-bunny-1080p.mp4',
    source: 'https://archive.org/download/BigBuckBunny_124/big-buck-bunny-1080p.mp4',
    type: 'video',
    status: 'completed',
    progress: 100,
    speed: '\u00B7',
    size: '2.4 GB',
    total: '2.4 GB',
    eta: '\u2014',
    connections: 0,
    files: [{ name: 'big-buck-bunny-1080p.mp4', size: '2.4 GB', checked: true }],
    timeline: [
      { time: '14:15:00', text: 'Download completed', type: 'completed' },
      { time: '14:10:00', text: 'Downloading at 50% complete', type: 'completed' },
      { time: '14:05:00', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 7,
    name: 'ubuntu-magnet-share.torrent',
    source: 'magnet:?xt=urn:btih:b7b0fbab74a85d4ac170662c645982a862826455&dn=ubuntu',
    type: 'torrent',
    status: 'downloading',
    progress: 12,
    speed: '4.8 MB/s',
    size: '156 MB',
    total: '1.3 GB',
    eta: '6m',
    connections: 23,
    seeders: 19,
    leechers: 8,
    files: [{ name: 'ubuntu-magnet-share.torrent', size: '1.3 GB', checked: false }],
    timeline: [
      { time: '14:22:40', text: 'Downloading at 12% (19 seeders, 8 leechers)', type: 'active' },
      { time: '14:22:00', text: 'Peer exchange started', type: 'info' },
      { time: '14:21:30', text: 'Metadata received from DHT', type: 'completed' },
      { time: '14:21:10', text: 'Resolving magnet link', type: 'info' },
      { time: '14:21:00', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 8,
    name: 'macOS-Sonoma-14.5-installer.app',
    source: 'https://swcdn.apple.com/content/downloads/50/14/052-88462-A_7LLYP9QW2W/xs1uh5e2qfw5gk/Sonoma_Installer.app',
    type: 'archive',
    status: 'paused',
    progress: 73,
    speed: '0 B/s',
    size: '9.2 GB',
    total: '12.6 GB',
    eta: '\u2014',
    connections: 4,
    files: [{ name: 'macOS-Sonoma-14.5-installer.app', size: '12.6 GB', checked: false }],
    timeline: [
      { time: '13:45:00', text: 'Paused by user', type: 'info' },
      { time: '13:30:00', text: 'Downloading at 73% complete', type: 'completed' },
      { time: '13:00:00', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 9,
    name: 'openSUSE-Leap-15.6-DVD-x86_64.iso',
    source: 'https://download.opensuse.org/distribution/leap/15.6/iso/openSUSE-Leap-15.6-DVD-x86_64.iso',
    type: 'document',
    status: 'downloading',
    progress: 18,
    speed: '18.2 MB/s',
    size: '850 MB',
    total: '4.7 GB',
    eta: '4m 18s',
    connections: 10,
    files: [{ name: 'openSUSE-Leap-15.6-DVD-x86_64.iso', size: '4.7 GB', checked: false }],
    timeline: [
      { time: '14:20:30', text: 'Downloading at 18% complete', type: 'active' },
      { time: '14:19:00', text: 'Connection established', type: 'info' },
      { time: '14:18:45', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 10,
    name: 'Fedora-Workstation-Live-x86_64-40.iso',
    source: 'https://download.fedoraproject.org/pub/fedora/linux/releases/40/Workstation/x86_64/iso/Fedora-Workstation-Live-x86_64-40.iso',
    type: 'document',
    status: 'downloading',
    progress: 91,
    speed: '12.4 MB/s',
    size: '1.8 GB',
    total: '1.9 GB',
    eta: '14s',
    connections: 6,
    files: [{ name: 'Fedora-Workstation-Live-x86_64-40.iso', size: '1.9 GB', checked: false }],
    timeline: [
      { time: '14:22:55', text: 'Downloading at 91% complete', type: 'active' },
      { time: '14:22:15', text: 'Connection established', type: 'info' },
      { time: '14:22:05', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 11,
    name: 'blender-4.2.0-linux-x64.tar.xz',
    source: 'https://mirror.blender.org/BLF/release/blender-4.2.0/blender-4.2.0-linux-x64.tar.xz',
    type: 'archive',
    status: 'downloading',
    progress: 6,
    speed: '6.2 MB/s',
    size: '88 MB',
    total: '1.4 GB',
    eta: '3m 52s',
    connections: 5,
    files: [{ name: 'blender-4.2.0-linux-x64.tar.xz', size: '1.4 GB', checked: false }],
    timeline: [
      { time: '14:22:25', text: 'Downloading at 6% complete', type: 'active' },
      { time: '14:21:55', text: 'Connection established', type: 'info' },
      { time: '14:21:50', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 12,
    name: 'rust-1.78.0-x86_64-unknown-linux-gnu.tar.gz',
    source: 'https://static.rust-lang.org/dist/rust-1.78.0-x86_64-unknown-linux-gnu.tar.gz',
    type: 'archive',
    status: 'failed',
    progress: 34,
    speed: '0 B/s',
    size: '22 MB',
    total: '67 MB',
    eta: '\u2014',
    connections: 0,
    files: [{ name: 'rust-1.78.0-x86_64-unknown-linux-gnu.tar.gz', size: '67 MB', checked: false }],
    timeline: [
      { time: '14:15:30', text: 'Download failed: connection reset by peer', type: 'info' },
      { time: '14:14:00', text: 'Downloading at 34% complete', type: 'completed' },
      { time: '14:12:00', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 13,
    name: 'Docker-Desktop-4.30.0-x86_64.AppImage',
    source: 'https://desktop.docker.com/linux/main/amd64/docker-desktop-4.30.0-x86_64.AppImage',
    type: 'archive',
    status: 'failed',
    progress: 0,
    speed: '0 B/s',
    size: '0 MB',
    total: '1.2 GB',
    eta: '\u2014',
    connections: 0,
    files: [{ name: 'Docker-Desktop-4.30.0-x86_64.AppImage', size: '1.2 GB', checked: false }],
    timeline: [
      { time: '14:10:00', text: 'Download failed: HTTP 502 Bad Gateway', type: 'info' },
      { time: '14:09:55', text: 'Attempting connection', type: 'info' },
      { time: '14:09:50', text: 'Task created', type: 'completed' },
    ],
  },
  {
    id: 14,
    name: 'kali-linux-2024.2-installer-amd64.iso',
    source: 'https://cdimage.kali.org/kali-2024.2/kali-linux-2024.2-installer-amd64.iso',
    type: 'document',
    status: 'paused',
    progress: 0,
    speed: '0 B/s',
    size: '0 MB',
    total: '4.1 GB',
    eta: '\u2014',
    connections: 0,
    files: [{ name: 'kali-linux-2024.2-installer-amd64.iso', size: '4.1 GB', checked: false }],
    timeline: [
      { time: '14:00:00', text: 'Paused before start', type: 'info' },
      { time: '13:58:00', text: 'Task created', type: 'completed' },
    ],
  },
])

// ---------------------------------------------------------------------------
// View-level state
// ---------------------------------------------------------------------------

const router = useRouter()
// (We no longer emit 'navigate'; router.push() goes directly through useRouter)

const activeFilter = ref('all')
const selectedTask = ref<Task | null>(null)
const showDetail = ref(false)
const showMenu = ref(false)
const menuTask = ref<Task | null>(null)
const toasts = ref<Toast[]>([])
const showOnboarding = ref(false)
const keyboardIndex = ref(-1)

// Quick-action chip labels (mirrors BottomChat's chips)
const quickActions = [
  'Download Ubuntu 24.04 LTS ISO',
  'What is downloading?',
  'Pause all',
  'Show completed',
  'Add magnet URL',
] as const

// ---------------------------------------------------------------------------
// Toast system (docs/design/handoff/02-components.md §5)
// ---------------------------------------------------------------------------

const TOAST_LIFETIME = 2000
const TOAST_STACK_MAX = 4
const TOAST_EXIT_DELAY = 300
const TOAST_THINK_MIN = 700
const TOAST_THINK_MAX = 1100

let toastCounter = 0

function generateToastId(): string {
  toastCounter += 1
  return `toast-${Date.now()}-${toastCounter}`
}

function deriveToastType(text: string): ToastType {
  const lower = text.toLowerCase()
  if (lower.includes('cancel') || lower.includes('remove') || lower.includes('delete')) return 'error'
  if (lower.includes('error') || lower.includes('fail') || lower.includes('hash')) return 'error'
  return 'info'
}

function addToast(toast: Toast): void {
  toasts.value.push(toast)
  // Prune oldest done toasts if exceeding stack max
  while (toasts.value.length > TOAST_STACK_MAX) {
    const oldestDone = toasts.value.findIndex(t => !t.exiting)
    if (oldestDone !== -1) {
      toasts.value.splice(oldestDone, 1)
    } else {
      break
    }
  }
  // Schedule auto-dismiss
  setTimeout(() => dismissToast(toast.id), TOAST_LIFETIME)
}

function dismissToast(id: string): void {
  const idx = toasts.value.findIndex(t => t.id === id)
  if (idx === -1) return
  toasts.value[idx].exiting = true
  setTimeout(() => {
    const i = toasts.value.findIndex(t => t.id === id)
    if (i !== -1) toasts.value.splice(i, 1)
  }, TOAST_EXIT_DELAY)
}

// ---------------------------------------------------------------------------
// Chat handlers
// ---------------------------------------------------------------------------

function handleSendMessage(message: string): void {
  const type = deriveToastType(message)
  const thinkDelay = TOAST_THINK_MIN + Math.random() * (TOAST_THINK_MAX - TOAST_THINK_MIN)
  const toast: Toast = {
    id: generateToastId(),
    type,
    text: message,
    createdAt: Date.now(),
  }
  addToast(toast)
  // Simulate "thinking" → "done" transition (just refresh createdAt for visual)
  setTimeout(() => {
    const t = toasts.value.find(x => x.id === toast.id)
    if (t) t.createdAt = Date.now()
  }, thinkDelay)
}

function handleQuickAction(index: number): void {
  const message = quickActions[index] || ''
  if (message) handleSendMessage(message)
}

function handleAttach(): void {
  addToast({
    id: generateToastId(),
    type: 'info',
    text: 'Attach a magnet or URL',
    createdAt: Date.now(),
  })
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function openDetail(task: Task): void {
  selectedTask.value = task
  showDetail.value = true
  keyboardIndex.value = -1
}

function closeDetail(): void {
  showDetail.value = false
  selectedTask.value = null
}

// ---------------------------------------------------------------------------
// Row menu
// ---------------------------------------------------------------------------

function toggleRowMenu(taskId: number, _event: MouseEvent): void {
  if (showMenu.value && menuTask.value?.id === taskId) {
    closeMenu()
  } else {
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      menuTask.value = task
      showMenu.value = true
    }
  }
}

function closeMenu(): void {
  showMenu.value = false
  menuTask.value = null
}

// ---------------------------------------------------------------------------
// Task actions (shared by detail panel + row menu)
// ---------------------------------------------------------------------------

function pauseTask(): void {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  const t = tasks.value.find(x => x.id === target.id)
  if (t) {
    t.status = 'paused'
    t.speed = '0 B/s'
  }
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'info',
    text: `"${target.name}" paused`,
    createdAt: Date.now(),
  })
}

function resumeTask(): void {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  const t = tasks.value.find(x => x.id === target.id)
  if (t) {
    t.status = 'downloading'
    t.speed = '12.4 MB/s'
  }
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'success',
    text: `"${target.name}" resumed`,
    createdAt: Date.now(),
  })
}

function retryTask(): void {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  const t = tasks.value.find(x => x.id === target.id)
  if (t) {
    t.status = 'downloading'
    t.speed = '8.7 MB/s'
    t.progress = 12
  }
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'info',
    text: `Retrying "${target.name}"`,
    createdAt: Date.now(),
  })
}

function deleteTask(): void {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  tasks.value = tasks.value.filter(x => x.id !== target.id)
  closeDetail()
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'error',
    text: `"${target.name}" removed`,
    createdAt: Date.now(),
  })
}

function openLocation(): void {
  const target = menuTask.value
  if (!target) return
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'info',
    text: `Reveal in folder: ~/Downloads/Motrix/${target.name}`,
    createdAt: Date.now(),
  })
}

// ---------------------------------------------------------------------------
// Chrome bar handlers
// ---------------------------------------------------------------------------

function goHome(): void {
  closeDetail()
  closeMenu()
}

// Theme state — 'dark' is the design-system default.
// We persist this so a reload remembers the user's choice.
const currentTheme = ref<'dark' | 'light'>('dark')
try {
  const saved = localStorage.getItem('motrix:theme')
  if (saved === 'light' || saved === 'dark') {
    currentTheme.value = saved
  }
} catch {
  // localStorage may be unavailable; fall back to dark
}

function toggleTheme(): void {
  const next: 'dark' | 'light' = currentTheme.value === 'dark' ? 'light' : 'dark'
  currentTheme.value = next
  try {
    localStorage.setItem('motrix:theme', next)
  } catch {
    // ignore — persistence is best-effort
  }
  // Sync the html attribute so the design-token CSS responds
  const html = document.documentElement
  if (next === 'light') {
    html.setAttribute('data-theme', 'light')
  } else {
    html.removeAttribute('data-theme')
  }
}

// Initialise the html attribute on mount
onMounted(() => {
  const html = document.documentElement
  if (currentTheme.value === 'light') {
    html.setAttribute('data-theme', 'light')
  } else {
    html.removeAttribute('data-theme')
  }
})

function openSettings(): void {
  router.push('/settings')
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

function completeOnboarding(): void {
  try {
    localStorage.setItem('motrix:onboarded', 'true')
  } catch {
    // localStorage may be unavailable (SSR / sandbox)
  }
  showOnboarding.value = false
}

// ---------------------------------------------------------------------------
// Keyboard navigation (docs/design/handoff/04-accessibility.md §3)
// ---------------------------------------------------------------------------

/** Filtered tasks for keyboard j/k navigation (mirrors TaskTable filter) */
const filteredForKb = computed<MockTask[]>(() => {
  if (activeFilter.value === 'all') return tasks.value
  if (activeFilter.value === 'active') {
    return tasks.value.filter(t => t.status === 'downloading' || t.status === 'paused')
  }
  if (activeFilter.value === 'failed') {
    return tasks.value.filter(t => t.status === 'failed')
  }
  return tasks.value.filter(t => t.status === activeFilter.value)
})

function handleKeydown(e: KeyboardEvent): void {
  // Cmd/Ctrl + 1-5: trigger quick actions
  if ((e.metaKey || e.ctrlKey) && /^[1-5]$/.test(e.key)) {
    e.preventDefault()
    handleQuickAction(Number(e.key) - 1)
    return
  }

  // Don't interfere with text input fields
  const target = e.target as HTMLElement
  if (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  ) return

  // Esc: close detail panel or row menu
  if (e.key === 'Escape') {
    if (showDetail.value) {
      // DetailPanel handles its own Esc; this is a fallback
      return
    }
    if (showMenu.value) {
      closeMenu()
      return
    }
    return
  }

  // j / ArrowDown: next row
  if (e.key === 'j' || e.key === 'ArrowDown') {
    e.preventDefault()
    const len = filteredForKb.value.length
    if (len === 0) return
    keyboardIndex.value =
      keyboardIndex.value < 0 || keyboardIndex.value >= len - 1
        ? 0
        : keyboardIndex.value + 1
    return
  }

  // k / ArrowUp: previous row
  if (e.key === 'k' || e.key === 'ArrowUp') {
    e.preventDefault()
    const len = filteredForKb.value.length
    if (len === 0) return
    keyboardIndex.value =
      keyboardIndex.value <= 0 ? len - 1 : keyboardIndex.value - 1
    return
  }

  // Enter: open detail for the keyboard-selected row
  if (
    e.key === 'Enter' &&
    keyboardIndex.value >= 0 &&
    keyboardIndex.value < filteredForKb.value.length
  ) {
    e.preventDefault()
    const task = filteredForKb.value[keyboardIndex.value]
    if (task) openDetail(task)
    return
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  // Check onboarding status (first visit)
  try {
    showOnboarding.value = !localStorage.getItem('motrix:onboarded')
  } catch {
    showOnboarding.value = false
  }
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="app-layout">
    <!-- Chrome bar (48px, sticky top) -->
    <ChromeBar
      :current-theme="currentTheme"
      @go-home="goHome"
      @toggle-theme="toggleTheme"
      @open-settings="openSettings"
    />

    <!-- Main content: task table (remaining space) -->
    <main class="main-content">
      <TaskTable
        :tasks="tasks"
        :active-filter="activeFilter"
        @update:filter="activeFilter = $event"
        @toggle-menu="toggleRowMenu"
        @open-detail="openDetail"
      />
    </main>

    <!-- Bottom chat input (96px, sticky bottom) -->
    <BottomChat
      @send="handleSendMessage"
      @quick-action="handleQuickAction"
      @attach="handleAttach"
    />

    <!-- Toast stack (floating above bottom chat) -->
    <ToastStack
      :toasts="toasts"
      @dismiss="dismissToast"
    />

    <!-- Detail panel overlay (when task clicked) -->
    <DetailPanel
      :show="showDetail"
      :task="selectedTask"
      @close="closeDetail"
      @pause="pauseTask"
      @resume="resumeTask"
      @retry="retryTask"
      @delete="deleteTask"
    />

    <!-- Row menu dropdown (when ··· clicked) -->
    <RowMenu
      v-if="menuTask"
      :show="showMenu"
      :task="menuTask"
      @close="closeMenu"
      @pause="pauseTask"
      @resume="resumeTask"
      @retry="retryTask"
      @delete="deleteTask"
      @open-location="openLocation"
    />

    <!-- Onboarding card (first visit) -->
    <OnboardingCard
      v-if="showOnboarding"
      :show="showOnboarding"
      @complete="completeOnboarding"
    />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg, #0A0A0B);
  color: var(--fg, #FAFAFA);
  font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  position: relative;
}

/* --- Main content: takes all remaining space between chrome and chat --- */

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* The task table wrapper fills the area and scrolls internally */
.main-content > :deep(.task-table-wrapper) {
  flex: 1;
  min-height: 0;
}

/* --- Reduced motion: compress transitions --- */

@media (prefers-reduced-motion: reduce) {
  .app-layout * {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
</style>
