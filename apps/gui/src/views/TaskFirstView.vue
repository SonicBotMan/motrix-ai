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

import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import { theme, toggleTheme as settingsToggleTheme } from '@/composables/useSettings'
import ChromeBar from '@/components/chrome/ChromeBar.vue'
import TaskTable from '@/components/task/TaskTable.vue'
import DetailPanel from '@/components/task/DetailPanel.vue'
import RowMenu from '@/components/task/RowMenu.vue'
import BottomChat from '@/components/chat/BottomChat.vue'
import ToastStack from '@/components/toast/ToastStack.vue'
import OnboardingCard from '@/components/onboarding/OnboardingCard.vue'
import SearchResultsModal from '@/components/SearchResultsModal.vue'
import { useTasksStore, type Task } from '@/stores/tasks'
import { formatSpeed } from '@/shared/utils/format'
import { useToastStore } from '@/stores/toasts'
import { useDownloadPipeline } from '@/composables/useDownloadPipeline'

const tasksStore = useTasksStore()
const toastStore = useToastStore()
const { toasts, dismissToast } = toastStore

// ---------------------------------------------------------------------------
// Task list comes from the Pinia store (aria2-backed with local fallback)
// ---------------------------------------------------------------------------

const tasks = computed(() => {
  const all = tasksStore.tasks
  if (!taskSearchQuery.value.trim()) return all
  const q = taskSearchQuery.value.toLowerCase().trim()
  return all.filter((t) => t.name.toLowerCase().includes(q) || t.source.toLowerCase().includes(q))
})

const globalDownloadSpeed = computed(() => {
  const raw = tasksStore.globalStat?.downloadSpeed
  return raw ? formatSpeed(Number(raw) || 0) : undefined
})
const globalUploadSpeed = computed(() => {
  const raw = tasksStore.globalStat?.uploadSpeed
  return raw ? formatSpeed(Number(raw) || 0) : undefined
})

// ---------------------------------------------------------------------------
// View-level state
// ---------------------------------------------------------------------------

const router = useRouter()
// theme + settingsToggleTheme are imported at the top of the file from
// @/composables/useSettings so we can call toggleTheme() without re-binding.
// (We no longer emit 'navigate'; router.push() goes directly through useRouter)

const activeFilter = ref('all')
const taskSearchQuery = ref('')
const selectedTask = ref<Task | null>(null)
const selectedTaskId = ref<number | null>(null)
const liveSelectedTask = computed<Task | null>(() => {
  if (!selectedTaskId.value) return null
  return tasks.value.find((t) => t.id === selectedTaskId.value) ?? null
})

watch(liveSelectedTask, (task) => {
  if (!task && showDetail.value) closeDetail()
})

watch([activeFilter, taskSearchQuery], () => {
  keyboardIndex.value = -1
  selectedIds.value = new Set()
})
const showDetail = ref(false)
const showMenu = ref(false)
const menuTask = ref<Task | null>(null)
const menuPosition = ref<{ x: number; y: number } | null>(null)
const showOnboarding = ref(false)
const keyboardIndex = ref(-1)
const bottomChatRef = ref<{ focus: () => void } | null>(null)
const selectedIds = ref<Set<number>>(new Set())

function handleToggleSelect(id: number) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

function handleToggleSelectAll() {
  if (selectedIds.value.size === tasks.value.length && tasks.value.length > 0) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(tasks.value.map((t) => t.id))
  }
}

async function batchDeleteSelected() {
  const count = selectedIds.value.size
  if (count === 0) return
  try {
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    const accepted = await confirm(`Delete ${count} downloads?`, { title: 'Batch Delete', kind: 'warning' })
    if (!accepted) return
  } catch {
    /* non-Tauri */
  }
  for (const id of selectedIds.value) {
    const task = tasks.value.find((t) => t.id === id)
    if (task) await tasksStore.removeTaskWithFiles(task.gid || String(task.id))
  }
  toastStore.addToast({
    id: toastStore.generateToastId(),
    type: 'error',
    text: `${count} tasks deleted`,
    createdAt: Date.now(),
  })
  selectedIds.value = new Set()
}

// Download pipeline composable
const {
  showSearchResults,
  searchResults,
  searching,
  searchQuery,
  handleSendMessage,
  handleSelectSearchResult,
  handleQuickAction,
  handleAttach,
  closeSearchResults,
} = useDownloadPipeline({ activeFilter, bottomChatRef })

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function openDetail(task: Task): void {
  selectedTaskId.value = task.id
  selectedTask.value = task
  showDetail.value = true
  keyboardIndex.value = -1
  fileSelection.value.clear()
}

function closeDetail(): void {
  showDetail.value = false
  selectedTask.value = null
  selectedTaskId.value = null
  fileSelection.value.clear()
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
  toastStore.addToast({
    id: toastStore.generateToastId(),
    type: 'info',
    text: `"${target.name}" paused`,
    createdAt: Date.now(),
  })
  await tasksStore.pauseTask(target.gid || String(target.id))
}

async function resumeTask(): Promise<void> {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  closeMenu()
  toastStore.addToast({
    id: toastStore.generateToastId(),
    type: 'success',
    text: `"${target.name}" resumed`,
    createdAt: Date.now(),
  })
  await tasksStore.resumeTask(target.gid || String(target.id))
}

async function retryTask(): Promise<void> {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  closeMenu()
  toastStore.addToast({
    id: toastStore.generateToastId(),
    type: 'info',
    text: `Retrying "${target.name}"`,
    createdAt: Date.now(),
  })
  await tasksStore.retryTask(target.gid || String(target.id))
}

async function deleteTask(): Promise<void> {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  try {
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    const accepted = await confirm(`Remove "${target.name}" and delete the downloaded file?`, {
      title: 'Delete Download',
      kind: 'warning',
    })
    if (!accepted) return
  } catch {
    /* dialog not available in non-Tauri context */
  }
  closeDetail()
  closeMenu()
  toastStore.addToast({
    id: toastStore.generateToastId(),
    type: 'error',
    text: `"${target.name}" removed`,
    createdAt: Date.now(),
  })
  await tasksStore.removeTaskWithFiles(target.gid || String(target.id))
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
  let absolutePath: string
  if (target.filePath) {
    absolutePath = target.filePath
  } else if (
    target.source.startsWith('magnet:') ||
    target.source.startsWith('ed2k:') ||
    target.source.startsWith('thunder:')
  ) {
    absolutePath = downloadDir
  } else {
    const fileSegment = target.source.split('/').pop() || target.name
    absolutePath = `${downloadDir}/${fileSegment.replace(/^\/+/, '')}`
  }

  try {
    await invoke('show_in_folder', { path: absolutePath })
    toastStore.addToast({
      id: toastStore.generateToastId(),
      type: 'success',
      text: `Revealed ${target.name} in folder`,
      createdAt: Date.now(),
    })
  } catch (err) {
    // Fallback if the Rust command is missing or the file doesn't exist yet:
    // try revealing the parent folder, then fall back to a toast.
    try {
      await invoke('show_in_folder', { path: downloadDir })
      toastStore.addToast({
        id: toastStore.generateToastId(),
        type: 'info',
        text: `Opened download folder for ${target.name}`,
        createdAt: Date.now(),
      })
    } catch {
      toastStore.addToast({
        id: toastStore.generateToastId(),
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
    toastStore.addToast({
      id: toastStore.generateToastId(),
      type: 'success',
      text: 'Source copied to clipboard',
      createdAt: Date.now(),
    })
  } catch (err) {
    toastStore.addToast({
      id: toastStore.generateToastId(),
      type: 'error',
      text: `Copy failed: ${String(err)}`,
      createdAt: Date.now(),
    })
  }
}

/**
 * Handle a file checkbox toggle from the DetailPanel.
 */
const fileSelection = ref<Map<number, boolean>>(new Map())

function onToggleFile(payload: { index: number; name: string; checked: boolean }): void {
  fileSelection.value.set(payload.index, payload.checked)
  toastStore.addToast({
    id: toastStore.generateToastId(),
    type: 'info',
    text: `${payload.checked ? 'Selected' : 'Deselected'}: ${payload.name}`,
    createdAt: Date.now(),
  })
  void applyFileSelectionToAria2()
}

async function applyFileSelectionToAria2(): Promise<void> {
  const target = selectedTask.value
  if (!target?.gid) return
  try {
    const selected = Array.from(fileSelection.value.entries())
      .filter(([, checked]) => checked)
      .map(([index]) => index + 1)
      .join(',')
    if (selected) {
      const { useAria2 } = await import('@/composables/useAria2')
      await useAria2().changeOption(target.gid, { 'select-file': selected })
    }
  } catch (e) {
    console.warn('File selection apply failed:', e)
  }
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
    toastStore.addToast({
      id: toastStore.generateToastId(),
      type: 'info',
      text: `Local task — nothing to prioritize`,
      createdAt: Date.now(),
    })
    return
  }
  try {
    await tasksStore.bumpPriority(target.gid)
    toastStore.addToast({
      id: toastStore.generateToastId(),
      type: 'success',
      text: `"${target.name}" priority raised`,
      createdAt: Date.now(),
    })
  } catch (err) {
    toastStore.addToast({
      id: toastStore.generateToastId(),
      type: 'error',
      text: `Priority change failed: ${String(err)}`,
      createdAt: Date.now(),
    })
  }
}

// ---------------------------------------------------------------------------
// Chrome bar handlers
// ---------------------------------------------------------------------------

function handleTrySample(): void {
  const ubuntuMagnet =
    'magnet:?xt=urn:btih:c9e15763f722f23e98a29decdfae341b51d5c4ea&dn=ubuntu-24.04.2-desktop-amd64.iso&tr=https%3A%2F%2Ftorrent.ubuntu.com%2Fannounce&tr=https%3A%2F%2Fipv6.torrent.ubuntu.com%2Fannounce'
  handleSendMessage(ubuntuMagnet)
}

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

function completeOnboarding(selectedTheme?: string): void {
  if (selectedTheme) {
    theme.value = selectedTheme as 'dark' | 'light' | 'system'
  }
  try {
    localStorage.setItem('motrix-ai:onboarded', 'true')
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
    showOnboarding.value = !localStorage.getItem('motrix-ai:onboarded')
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
      :current-theme="theme === 'system' ? 'dark' : theme"
      :download-speed="globalDownloadSpeed"
      :upload-speed="globalUploadSpeed"
      @go-home="goHome"
      @toggle-theme="toggleTheme"
      @open-settings="openSettings"
    />

    <!-- Main content: task table (remaining space) -->
    <main class="main-content">
      <div v-if="tasksStore.tasks.length > 0" class="task-search-bar">
        <input
          v-model="taskSearchQuery"
          class="task-search-input"
          type="text"
          placeholder="Filter tasks…"
          aria-label="Filter tasks"
        />
        <span v-if="taskSearchQuery" class="task-search-count">{{ tasks.length }} / {{ tasksStore.tasks.length }}</span>
      </div>
      <TaskTable
        :tasks="tasks"
        :active-filter="activeFilter"
        :keyboard-index="keyboardIndex"
        :connecting="tasksStore.aria2Connecting"
        :connected="tasksStore.aria2Connected"
        :error-message="tasksStore.aria2ConnectionError"
        :selected-ids="selectedIds"
        @update:filter="activeFilter = $event"
        @toggle-menu="toggleRowMenu"
        @open-detail="openDetail"
        @retry-connect="tasksStore.init().catch((e) => console.warn('retry failed:', e))"
        @try-sample="handleTrySample"
        @toggle-select="handleToggleSelect"
        @toggle-select-all="handleToggleSelectAll"
      />
      <div v-if="selectedIds.size > 0" class="batch-bar">
        <span class="batch-count">{{ selectedIds.size }} selected</span>
        <button class="batch-btn" type="button" aria-label="Delete selected tasks" @click="batchDeleteSelected">
          Delete
        </button>
        <button
          class="batch-btn batch-btn--ghost"
          type="button"
          aria-label="Clear selection"
          @click="selectedIds = new Set()"
        >
          Clear
        </button>
      </div>
    </main>

    <!-- Bottom chat input (96px, sticky bottom) -->
    <BottomChat
      ref="bottomChatRef"
      @send="handleSendMessage"
      @quick-action="handleQuickAction"
      @attach="handleAttach"
    />

    <!-- Toast stack (floating above bottom chat) -->
    <ToastStack :toasts="toasts" @dismiss="dismissToast" />

    <!-- Detail panel overlay (when task clicked) -->
    <DetailPanel
      :show="showDetail"
      :task="liveSelectedTask"
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

    <SearchResultsModal
      :visible="showSearchResults"
      :results="searchResults"
      :searching="searching"
      :query="searchQuery"
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

.task-search-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  background: var(--primary-muted, rgba(59, 130, 246, 0.1));
  border-bottom: 1px solid var(--border, #e2e8f0);
}
.batch-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary, #3b82f6);
}
.batch-btn {
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--error, #ef4444);
  background: transparent;
  border: 1px solid var(--error, #ef4444);
  border-radius: 4px;
  cursor: pointer;
}
.batch-btn--ghost {
  color: var(--fg-tertiary, #6b7280);
  border-color: var(--border, #e2e8f0);
}

.task-search-input {
  flex: 1;
  height: 28px;
  padding: 0 12px;
  font-size: 13px;
  color: var(--fg, #1e293b);
  background: var(--bg-elevated, #f1f5f9);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  outline: none;
}

.task-search-input:focus {
  border-color: var(--primary, #3b82f6);
}

.task-search-input::placeholder {
  color: var(--fg-muted, #94a3b8);
}

.task-search-count {
  font-size: 12px;
  color: var(--fg-muted, #94a3b8);
  white-space: nowrap;
}
</style>
