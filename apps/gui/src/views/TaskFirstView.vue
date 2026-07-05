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
import { useSearch, type SearchResult } from '@/composables/useSearch'
import ChromeBar from '@/components/chrome/ChromeBar.vue'
import TaskTable from '@/components/task/TaskTable.vue'
import DetailPanel from '@/components/task/DetailPanel.vue'
import RowMenu from '@/components/task/RowMenu.vue'
import BottomChat from '@/components/chat/BottomChat.vue'
import ToastStack, { type Toast } from '@/components/toast/ToastStack.vue'
import OnboardingCard from '@/components/onboarding/OnboardingCard.vue'
import SearchResultsModal from '@/components/SearchResultsModal.vue'
import { useTasksStore, type Task, type DownloadIntentMeta } from '@/stores/tasks'

const tasksStore = useTasksStore()

// Search composable — drives the NL → search → results modal flow.
// Captured at view scope so the SearchResultsModal can bind to its reactive
// state and the select-handler can close the modal after a pick.
const { searchResults, searching, searchResources } = useSearch()

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

// Search modal state — shown after a successful NL parse so the user can
// pick which source/quality to actually download.
const showSearchResults = ref(false)
const searchQueryDisplay = ref('')
// Intent captured at parse time and forwarded to addTask when the user picks
// a search result. Cleared after the pick so the next NL turn starts clean.
const pendingIntent = ref<DownloadIntentMeta | null>(null)

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
 * @returns the aria2 GID string on success
 */
async function aria2AddUri(uri: string): Promise<string> {
  const resp = await fetch('http://127.0.0.1:6800/jsonrpc', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'motrix-gui',
      method: 'aria2.addUri',
      params: [[uri]],
    }),
  })
  const data = await resp.json()
  if (data.error) {
    throw new Error(data.error.message || 'aria2 RPC error')
  }
  return data.result as string
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
      const gid = await aria2AddUri(trimmed)
      addToast({
        id: generateToastId(),
        type: 'success',
        text: `Magnet added: ${gid.slice(0, 8)}…`,
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
      const gid = await aria2AddUri(trimmed)
      addToast({
        id: generateToastId(),
        type: 'success',
        text: `Download added: ${gid.slice(0, 8)}…`,
        createdAt: Date.now(),
      })
    } catch (err) {
      addToast({ id: generateToastId(), type: 'error', text: `Add failed: ${String(err)}`, createdAt: Date.now() })
    }
    return
  }

  // --- Natural language → parse intent → search providers → modal ---
  addToast({ id: generateToastId(), type: 'info', text: `Recognising: "${trimmed}"…`, createdAt: Date.now() })
  try {
    const intent = await invoke<{
      title?: string
      year?: number | null
      quality?: string
      need_subtitle?: boolean
      resource_type?: string
      search_keywords?: string[]
    }>('parse_nl_intent', { input: trimmed, llmConfig: null })

    const title = intent.title || trimmed
    const rtype = intent.resource_type || 'unknown'

    // Capture intent so we can attach it to the download when the user
    // picks a search result. This is what makes the post-download pipeline
    // able to name the file correctly and search for subtitles.
    pendingIntent.value = {
      title,
      year: intent.year ?? null,
      quality: intent.quality,
      resourceType: rtype,
      needSubtitle: intent.need_subtitle ?? false,
    }
    searchQueryDisplay.value = title

    addToast({
      id: generateToastId(),
      type: 'info',
      text: `Searching for "${title}"…`,
      createdAt: Date.now(),
    })

    // searchResources is async but we deliberately do NOT await here —
    // the SearchResultsModal binds to the reactive `searching` and
    // `searchResults` refs and updates as results arrive.
    void searchResources({
      title,
      year: intent.year ?? null,
      quality: (intent.quality as '4K' | '1080p' | '720p' | 'other') ?? 'other',
      need_subtitle: intent.need_subtitle ?? false,
      search_keywords: intent.search_keywords ?? [title],
      resource_type: rtype as 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other',
      raw_input: trimmed,
    })

    showSearchResults.value = true
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
 * Handle a search-result pick from SearchResultsModal.
 *
 * Forwards the chosen magnet to aria2 via the store (which captures the
 * pending intent so the post-download pipeline can name/organize the file),
 * then closes the modal.
 */
async function handleSelectSearchResult(result: SearchResult): Promise<void> {
  showSearchResults.value = false
  const intent = pendingIntent.value ?? undefined
  pendingIntent.value = null

  addToast({
    id: generateToastId(),
    type: 'info',
    text: `Adding "${result.title.slice(0, 50)}"…`,
    createdAt: Date.now(),
  })

  try {
    await tasksStore.addTask(result.magnet, result.title, intent)
    addToast({
      id: generateToastId(),
      type: 'success',
      text: `Download added: ${result.title.slice(0, 50)}`,
      createdAt: Date.now(),
    })
  } catch (err) {
    addToast({
      id: generateToastId(),
      type: 'error',
      text: `Add failed: ${String(err)}`,
      createdAt: Date.now(),
    })
  }
}

/** Close the search results modal and discard any pending intent. */
function closeSearchResults(): void {
  showSearchResults.value = false
  pendingIntent.value = null
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
 * Reveal a downloaded file in the OS file manager.
 *
 * Prefers the task's actual file path (aria2 tells us where it landed);
 * falls back to the configured download folder if no path is known yet
 * (e.g. download still in progress).
 */
async function openLocation(task?: Task | null): Promise<void> {
  const target = task ?? menuTask.value ?? selectedTask.value
  if (!target) return
  closeMenu()

  // Prefer the concrete file path; aria2's --dir config puts downloads
  // under ~/Downloads/Motrix AI/. Falling back to the folder is still
  // useful so the user sees *something* open if the file path is unknown.
  const path = target.filePath || '~/Downloads/Motrix AI'
  try {
    await invoke('show_in_folder', { path })
    addToast({
      id: generateToastId(),
      type: 'success',
      text: `Revealed "${target.name}" in folder`,
      createdAt: Date.now(),
    })
  } catch (err) {
    addToast({
      id: generateToastId(),
      type: 'error',
      text: `Could not open folder: ${String(err)}`,
      createdAt: Date.now(),
    })
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
 * Bump a task's priority by moving it to the top of the aria2 queue.
 *
 * Delegates to `tasksStore.bumpPriority` which uses the real
 * `aria2.changePosition(gid, 0, POS_SET)` RPC. Previously this called
 * `invoke('aria2_change_option', ...)` — a command that was never
 * registered in `lib.rs invoke_handler!`, so the call always failed
 * silently behind a `.catch(() => {})`.
 */
async function bumpPriority(): Promise<void> {
  const target = selectedTask.value
  if (!target) return
  const ok = await tasksStore.bumpPriority(target.id)
  addToast({
    id: generateToastId(),
    type: ok ? 'success' : 'error',
    text: ok ? `"${target.name}" moved to top of queue` : `Could not change priority for "${target.name}"`,
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

function toggleTheme(): void {
  // Delegates to the shared settings store. The store updates the
  // `data-theme` attribute on <html> which lets tokens.css take over.
  settingsToggleTheme()
}

function openSettings(): void {
  router.push('/settings')
}

function openQueue(): void {
  router.push('/queue')
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
  // Initialize the aria2 connection through the store
  tasksStore.init().catch((e) => console.warn('aria2 init failed:', e))
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="app-layout">
    <!-- Chrome bar (48px, sticky top) -->
    <ChromeBar
      :current-theme="theme === 'system' ? 'dark' : theme"
      :queue-count="tasksStore.activeCount"
      @go-home="goHome"
      @toggle-theme="toggleTheme"
      @open-settings="openSettings"
      @open-queue="openQueue"
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
      @cancel="deleteTask"
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

    <!-- Search results modal (after NL parse) -->
    <SearchResultsModal
      :visible="showSearchResults"
      :results="searchResults"
      :searching="searching"
      :query="searchQueryDisplay"
      @close="closeSearchResults"
      @select="handleSelectSearchResult"
    />
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
