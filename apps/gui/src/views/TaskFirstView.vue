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
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { theme, toggleTheme as settingsToggleTheme } from '@/composables/useSettings'
import ChromeBar from '@/components/chrome/ChromeBar.vue'
import TaskTable from '@/components/task/TaskTable.vue'
import DetailPanel from '@/components/task/DetailPanel.vue'
import RowMenu from '@/components/task/RowMenu.vue'
import BottomChat from '@/components/chat/BottomChat.vue'
import ToastStack, { type Toast } from '@/components/toast/ToastStack.vue'
import OnboardingCard from '@/components/onboarding/OnboardingCard.vue'
import { useTasksStore, type Task } from '@/stores/tasks'

const tasksStore = useTasksStore()

// ---------------------------------------------------------------------------
// Task list comes from the Pinia store (aria2-backed with local fallback)
// ---------------------------------------------------------------------------

const tasks = computed(() => tasksStore.tasks)

// ---------------------------------------------------------------------------
// View-level state
// ---------------------------------------------------------------------------

const router = useRouter()
// theme + settingsToggleTheme are imported at the top of the file from
// @/composables/useSettings so we can call toggleTheme() without re-binding.
// (We no longer emit 'navigate'; router.push() goes directly through useRouter)

const activeFilter = ref('all')
const selectedTask = ref<Task | null>(null)
const showDetail = ref(false)
const showMenu = ref(false)
const menuTask = ref<Task | null>(null)
const menuPosition = ref<{ x: number; y: number } | null>(null)
const toasts = ref<Toast[]>([])
const showOnboarding = ref(false)
const keyboardIndex = ref(-1)

// ---------------------------------------------------------------------------
// Toast system (docs/design/handoff/02-components.md §5)
// ---------------------------------------------------------------------------

const TOAST_LIFETIME = 2000
const TOAST_STACK_MAX = 4
const TOAST_EXIT_DELAY = 300
// (TOAST_THINK_MIN/MAX were removed when the chat input was rewired to call
//  aria2 directly instead of the local "thinking" simulation.)

let toastCounter = 0

function generateToastId(): string {
  toastCounter += 1
  return `toast-${Date.now()}-${toastCounter}`
}

// (deriveToastType was removed; the addUri/addMagnet paths emit typed
//  toasts directly based on the actual aria2 response.)

function addToast(toast: Toast): void {
  toasts.value.push(toast)
  // Prune oldest done toasts if exceeding stack max
  while (toasts.value.length > TOAST_STACK_MAX) {
    const oldestDone = toasts.value.findIndex((t) => !t.exiting)
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
  const idx = toasts.value.findIndex((t) => t.id === id)
  if (idx === -1) return
  toasts.value[idx].exiting = true
  setTimeout(() => {
    const i = toasts.value.findIndex((t) => t.id === id)
    if (i !== -1) toasts.value.splice(i, 1)
  }, TOAST_EXIT_DELAY)
}

// ---------------------------------------------------------------------------
// Chat handlers
// ---------------------------------------------------------------------------

/**
 * Add a URI (HTTP/HTTPS/FTP/magnet) to the running aria2 daemon via JSON-RPC.
 * aria2.addUri accepts magnet URIs as well as regular HTTP URLs.
 * Routes through the tasks store so a local placeholder appears in the
 * table immediately (the store picks up the real aria2 task on next poll).
 * @returns the aria2 GID string on success
 */
async function aria2AddUri(uri: string): Promise<void> {
  try {
    await tasksStore.addTask(uri)
  } catch (e) {
    // addTask only throws if aria2 is connected AND the RPC fails; fall
    // back to a raw JSON-RPC call so the user still gets the real error.
    const data = await fetch('http://127.0.0.1:6800/jsonrpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'motrix-gui',
        method: 'aria2.addUri',
        params: [[uri]],
      }),
    }).then((r) => r.json())
    if (data.error) {
      throw new Error(data.error.message || 'aria2 RPC error', { cause: e })
    }
  }
}

/**
 * Handle a chat input submission.
 * - magnet:? → aria2.addUri (treated as torrent)
 * - http(s)/ftp → aria2.addUri (direct download)
 * - otherwise → parse as natural-language intent via Tauri command
 */
async function handleSendMessage(message: string): Promise<void> {
  if (!message.trim()) return
  const trimmed = message.trim()

  // --- Magnet link → torrent download ---
  if (trimmed.startsWith('magnet:')) {
    addToast({ id: generateToastId(), type: 'info', text: 'Adding magnet link…', createdAt: Date.now() })
    try {
      await aria2AddUri(trimmed)
      addToast({
        id: generateToastId(),
        type: 'success',
        text: 'Magnet added to queue',
        createdAt: Date.now(),
      })
    } catch (err) {
      addToast({ id: generateToastId(), type: 'error', text: `Add failed: ${String(err)}`, createdAt: Date.now() })
    }
    return
  }

  // --- HTTP / HTTPS / FTP URL → direct download ---
  if (/^(https?|ftp):\/\//i.test(trimmed)) {
    addToast({ id: generateToastId(), type: 'info', text: 'Adding download…', createdAt: Date.now() })
    try {
      await aria2AddUri(trimmed)
      addToast({
        id: generateToastId(),
        type: 'success',
        text: 'Download added to queue',
        createdAt: Date.now(),
      })
    } catch (err) {
      addToast({ id: generateToastId(), type: 'error', text: `Add failed: ${String(err)}`, createdAt: Date.now() })
    }
    return
  }

  // --- Natural language → parse intent ---
  addToast({ id: generateToastId(), type: 'info', text: `Recognising: "${trimmed}"…`, createdAt: Date.now() })
  try {
    const intent = await invoke<{ title?: string; resource_type?: string; search_keywords?: string[] }>(
      'parse_nl_intent',
      { input: trimmed, llmConfig: null },
    )
    const title = intent.title || trimmed
    const rtype = intent.resource_type || 'unknown'
    addToast({
      id: generateToastId(),
      type: 'success',
      text: `Found: "${title}" (${rtype}). Paste a URL or magnet to download.`,
      createdAt: Date.now(),
    })
  } catch {
    addToast({
      id: generateToastId(),
      type: 'info',
      text: `Hint: try pasting a magnet link or HTTP URL`,
      createdAt: Date.now(),
    })
  }
}

/**
 * Quick action chips bypass the NL intent parser and instead drive the
 * filter / aria2 directly. Each label maps to exactly one action; we do
 * NOT forward the label through `handleSendMessage` (that would mislead
 * the user into thinking "Pause all" parses as natural language).
 */
function handleQuickAction(index: number): void {
  switch (index) {
    case 0: // Download Ubuntu 24.04 LTS ISO
      handleSendMessage('Download Ubuntu 24.04 LTS ISO')
      return
    case 1: // What is downloading?  → switch to Active filter
      activeFilter.value = 'active'
      addToast({ id: generateToastId(), type: 'info', text: 'Showing active downloads', createdAt: Date.now() })
      return
    case 2: // Pause all
      pauseAllTasks()
      return
    case 3: // Show completed  → switch to Completed filter
      activeFilter.value = 'completed'
      addToast({ id: generateToastId(), type: 'info', text: 'Showing completed downloads', createdAt: Date.now() })
      return
    case 4: // Add magnet URL → focus the bottom chat input
      addToast({
        id: generateToastId(),
        type: 'info',
        text: 'Paste a magnet or URL in the input below',
        createdAt: Date.now(),
      })
      return
  }
}

async function pauseAllTasks(): Promise<void> {
  try {
    await invoke('pause_all')
    addToast({ id: generateToastId(), type: 'success', text: 'Paused all downloads', createdAt: Date.now() })
  } catch (err) {
    addToast({ id: generateToastId(), type: 'error', text: `Pause all failed: ${String(err)}`, createdAt: Date.now() })
  }
}

/**
 * Open a native file dialog to select a .torrent file, then add it to aria2
 * via the Rust command `add_torrent_file` (which reads the file server-side
 * and calls aria2.addTorrent). This avoids asset-protocol hassles in Tauri 2.
 */
async function handleAttach(): Promise<void> {
  let selected: string | null = null
  try {
    const result = await openDialog({
      multiple: false,
      filters: [{ name: 'Torrent', extensions: ['torrent'] }],
    })
    if (typeof result === 'string') {
      selected = result
    }
  } catch (err) {
    addToast({
      id: generateToastId(),
      type: 'error',
      text: `Could not open file: ${String(err)}`,
      createdAt: Date.now(),
    })
    return
  }
  if (!selected) return

  const fileName = selected.split('/').pop() || selected
  addToast({ id: generateToastId(), type: 'info', text: `Loading ${fileName}...`, createdAt: Date.now() })

  try {
    const gid = await invoke<string>('add_torrent_file', { path: selected })
    addToast({
      id: generateToastId(),
      type: 'success',
      text: `Torrent added: ${String(gid).slice(0, 8)}`,
      createdAt: Date.now(),
    })
  } catch (err) {
    addToast({
      id: generateToastId(),
      type: 'error',
      text: `Could not add torrent: ${String(err)}`,
      createdAt: Date.now(),
    })
  }
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

function toggleRowMenu(taskId: number, event: MouseEvent): void {
  if (showMenu.value && menuTask.value?.id === taskId) {
    closeMenu()
  } else {
    const task = tasks.value.find((t) => t.id === taskId)
    if (task) {
      menuTask.value = task
      menuPosition.value = { x: event.clientX, y: event.clientY }
      showMenu.value = true
    }
  }
}

function closeMenu(): void {
  showMenu.value = false
  menuTask.value = null
  menuPosition.value = null
}

// ---------------------------------------------------------------------------
// Task actions (shared by detail panel + row menu)
// ---------------------------------------------------------------------------

async function pauseTask(): Promise<void> {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'info',
    text: `"${target.name}" paused`,
    createdAt: Date.now(),
  })
  await tasksStore.pauseTask(target.id)
}

async function resumeTask(): Promise<void> {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'success',
    text: `"${target.name}" resumed`,
    createdAt: Date.now(),
  })
  await tasksStore.resumeTask(target.id)
}

async function retryTask(): Promise<void> {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'info',
    text: `Retrying "${target.name}"`,
    createdAt: Date.now(),
  })
  await tasksStore.retryTask(target.id)
}

async function deleteTask(): Promise<void> {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  closeDetail()
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'error',
    text: `"${target.name}" removed`,
    createdAt: Date.now(),
  })
  await tasksStore.removeTask(target.id)
}

/**
 * Reveal a downloaded file in the OS file manager. Called from both the row
 * ··· menu (with the row's task) and the detail-panel "Open file location"
 * menu item (no task passed, fall back to the currently-selected one).
 *
 * The path is built from the task's actual `filePath` (aria2-reported) when
 * available, falling back to `<download_dir>/<source_filename>`. We pass
 * the *file* path (not just the folder) because macOS `open -R` reveals a
 * specific file in Finder; passing a folder would only open the folder.
 */
async function openLocation(task?: Task | null): Promise<void> {
  const target = task ?? menuTask.value ?? selectedTask.value
  if (!target) return
  closeMenu()

  // Prefer aria2's reported file path; otherwise reconstruct from source.
  // `filePath` on a Task is the absolute path aria2 wrote (set in
  // fromAria2Status). If it's missing (e.g. magnet-only), we fall back.
  const downloadDir = await getDownloadDir()
  const fileSegment = target.filePath?.split('/').pop() || target.source.split('/').pop() || target.name
  // Collapse leading slashes; preserve extension if any
  const cleanSegment = fileSegment.replace(/^\/+/, '')
  const absolutePath = target.filePath || `${downloadDir}/${cleanSegment}`

  try {
    await invoke('show_in_folder', { path: absolutePath })
    addToast({
      id: generateToastId(),
      type: 'success',
      text: `Revealed ${target.name} in folder`,
      createdAt: Date.now(),
    })
  } catch (err) {
    // Fallback if the Rust command is missing or the file doesn't exist yet:
    // try revealing the parent folder, then fall back to a toast.
    try {
      await invoke('show_in_folder', { path: downloadDir })
      addToast({
        id: generateToastId(),
        type: 'info',
        text: `Opened download folder for ${target.name}`,
        createdAt: Date.now(),
      })
    } catch {
      addToast({
        id: generateToastId(),
        type: 'info',
        text: `Reveal in folder: ${absolutePath} (${String(err).slice(0, 60)})`,
        createdAt: Date.now(),
      })
    }
  }
}

/**
 * Resolve the configured download directory. Uses the Rust `get_download_path`
 * command when available, otherwise falls back to a relative path. We avoid
 * guessing a platform-specific home directory because navigator.platform
 * only tells us Win vs Unix, not the actual user name.
 */
async function getDownloadDir(): Promise<string> {
  try {
    return await invoke<string>('get_download_path')
  } catch {
    // Not in Tauri context (e.g. vite dev server). Return a relative path
    // so show_in_folder's fallback toast is at least non-misleading.
    return './Downloads/Motrix AI'
  }
}

/**
 * Copy a task's source URL/magnet to the system clipboard. Called from
 * the detail-panel "Copy source" menu item.
 */
async function handleCopySource(): Promise<void> {
  const target = selectedTask.value
  if (!target) return
  const text = target.source
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
    } else {
      // Tauri fallback: use the shell or just skip
      throw new Error('clipboard API unavailable')
    }
    addToast({
      id: generateToastId(),
      type: 'success',
      text: 'Source copied to clipboard',
      createdAt: Date.now(),
    })
  } catch (err) {
    addToast({
      id: generateToastId(),
      type: 'error',
      text: `Copy failed: ${String(err)}`,
      createdAt: Date.now(),
    })
  }
}

/**
 * Handle a file checkbox toggle from the DetailPanel.
 */
function onToggleFile(payload: { name: string; checked: boolean }): void {
  addToast({
    id: generateToastId(),
    type: 'info',
    text: `${payload.checked ? 'Selected' : 'Deselected'}: ${payload.name}`,
    createdAt: Date.now(),
  })
}

/**
 * Bump a task's priority in aria2 by calling `aria2.changeOption` JSON-RPC
 * with `priority=pri-high` via the tasks store. The store is connected to
 * the live aria2 daemon and surfaces real RPC errors instead of swallowing
 * them. Returns true on success so the caller can show the right toast.
 */
async function bumpPriority(): Promise<void> {
  const target = selectedTask.value
  if (!target) return
  if (!target.gid) {
    addToast({
      id: generateToastId(),
      type: 'info',
      text: `Local task — nothing to prioritize`,
      createdAt: Date.now(),
    })
    return
  }
  try {
    await tasksStore.bumpPriority(target.id)
    addToast({
      id: generateToastId(),
      type: 'success',
      text: `"${target.name}" priority raised`,
      createdAt: Date.now(),
    })
  } catch (err) {
    addToast({
      id: generateToastId(),
      type: 'error',
      text: `Priority change failed: ${String(err)}`,
      createdAt: Date.now(),
    })
  }
}

// ---------------------------------------------------------------------------
// Chrome bar handlers
// ---------------------------------------------------------------------------

function goHome(): void {
  closeDetail()
  closeMenu()
}

function toggleTheme(): void {
  // Delegates to the shared settings store. The store updates the
  // `data-theme` attribute on <html> which lets tokens.css take over.
  settingsToggleTheme()
}

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
const filteredForKb = computed<Task[]>(() => {
  if (activeFilter.value === 'all') return tasks.value
  if (activeFilter.value === 'active') {
    return tasks.value.filter((t) => t.status === 'downloading' || t.status === 'paused')
  }
  return tasks.value.filter((t) => t.status === activeFilter.value)
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
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

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
    keyboardIndex.value = keyboardIndex.value < 0 || keyboardIndex.value >= len - 1 ? 0 : keyboardIndex.value + 1
    return
  }

  // k / ArrowUp: previous row
  if (e.key === 'k' || e.key === 'ArrowUp') {
    e.preventDefault()
    const len = filteredForKb.value.length
    if (len === 0) return
    keyboardIndex.value = keyboardIndex.value <= 0 ? len - 1 : keyboardIndex.value - 1
    return
  }

  // Enter: open detail for the keyboard-selected row
  if (e.key === 'Enter' && keyboardIndex.value >= 0 && keyboardIndex.value < filteredForKb.value.length) {
    e.preventDefault()
    const task = filteredForKb.value[keyboardIndex.value]
    if (task) openDetail(task)
    return
  }

  // m: open the row ··· menu for the keyboard-selected row
  if (e.key === 'm' && keyboardIndex.value >= 0 && keyboardIndex.value < filteredForKb.value.length) {
    e.preventDefault()
    const task = filteredForKb.value[keyboardIndex.value]
    if (task) {
      const row = document.querySelector<HTMLTableRowElement>(`tr[data-task-id="${task.id}"]`)
      const x = row ? row.getBoundingClientRect().right - 16 : window.innerWidth / 2
      const y = row ? row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 : window.innerHeight / 2
      toggleRowMenu(task.id, { clientX: x, clientY: y } as MouseEvent)
    }
    return
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  try {
    showOnboarding.value = !localStorage.getItem('motrix:onboarded')
  } catch {
    showOnboarding.value = false
  }
  document.addEventListener('keydown', handleKeydown)
  tasksStore.init().catch((e) => console.warn('aria2 init failed:', e))
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  tasksStore.dispose().catch((e) => console.warn('aria2 dispose failed:', e))
})
</script>

<template>
  <div class="app-layout">
    <!-- Chrome bar (48px, sticky top) -->
    <ChromeBar
      :current-theme="theme === 'system' ? 'dark' : theme"
      @go-home="goHome"
      @toggle-theme="toggleTheme"
      @open-settings="openSettings"
    />

    <!-- Main content: task table (remaining space) -->
    <main class="main-content">
      <TaskTable
        :tasks="tasks"
        :active-filter="activeFilter"
        :keyboard-index="keyboardIndex"
        @update:filter="activeFilter = $event"
        @toggle-menu="toggleRowMenu"
        @open-detail="openDetail"
      />
    </main>

    <!-- Bottom chat input (96px, sticky bottom) -->
    <BottomChat @send="handleSendMessage" @quick-action="handleQuickAction" @attach="handleAttach" />

    <!-- Toast stack (floating above bottom chat) -->
    <ToastStack :toasts="toasts" @dismiss="dismissToast" />

    <!-- Detail panel overlay (when task clicked) -->
    <DetailPanel
      :show="showDetail"
      :task="selectedTask"
      @close="closeDetail"
      @pause="pauseTask"
      @resume="resumeTask"
      @retry="retryTask"
      @delete="deleteTask"
      @priority="bumpPriority"
      @open-location="openLocation"
      @copy-source="handleCopySource"
      @toggle-file="onToggleFile"
    />

    <!-- Row menu dropdown (when ··· clicked) -->
    <RowMenu
      v-if="menuTask && menuPosition"
      :show="showMenu"
      :task="menuTask"
      :x="menuPosition.x"
      :y="menuPosition.y"
      @close="closeMenu"
      @pause="pauseTask"
      @resume="resumeTask"
      @retry="retryTask"
      @delete="deleteTask"
      @open-location="openLocation"
    />

    <!-- Onboarding card (first visit) -->
    <OnboardingCard v-if="showOnboarding" :show="showOnboarding" @complete="completeOnboarding" />
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--bg, #0a0a0b);
  color: var(--fg, #fafafa);
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
