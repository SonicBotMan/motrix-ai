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
import { useOpenCode } from '@/composables/useOpenCode'
import { KeywordGenerator, ResultEvaluator } from '@motrix-ai/core/browser'
import ChromeBar from '@/components/chrome/ChromeBar.vue'
import TaskTable from '@/components/task/TaskTable.vue'
import DetailPanel from '@/components/task/DetailPanel.vue'
import RowMenu from '@/components/task/RowMenu.vue'
import BottomChat from '@/components/chat/BottomChat.vue'
import ToastStack, { type Toast } from '@/components/toast/ToastStack.vue'
import OnboardingCard from '@/components/onboarding/OnboardingCard.vue'
import SearchResultsModal from '@/components/SearchResultsModal.vue'
import { useTasksStore, type Task } from '@/stores/tasks'
import type { SearchResult } from '@/composables/useSearch'

const tasksStore = useTasksStore()
const openCode = useOpenCode()
const keywordGen = new KeywordGenerator()
const evaluator = new ResultEvaluator()

// ---------------------------------------------------------------------------
// Task list comes from the Pinia store (aria2-backed with local fallback)
// ---------------------------------------------------------------------------

const tasks = computed(() => {
  const all = tasksStore.tasks
  if (!taskSearchQuery.value.trim()) return all
  const q = taskSearchQuery.value.toLowerCase().trim()
  return all.filter((t) => t.name.toLowerCase().includes(q) || t.source.toLowerCase().includes(q))
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
  const found = tasks.value.find((t) => t.id === selectedTaskId.value) ?? null
  if (!found && showDetail.value) {
    closeDetail()
  }
  return found
})
const showDetail = ref(false)
const showMenu = ref(false)
const menuTask = ref<Task | null>(null)
const menuPosition = ref<{ x: number; y: number } | null>(null)
const toasts = ref<Toast[]>([])
const showOnboarding = ref(false)
const keyboardIndex = ref(-1)

const showSearchResults = ref(false)
const searchResults = ref<SearchResult[]>([])
const searching = ref(false)
const searchQuery = ref('')
const pendingIntent = ref<{ title?: string; year?: number; quality?: string; resource_type?: string } | null>(null)

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
  while (toasts.value.length > TOAST_STACK_MAX) {
    const oldestDone = toasts.value.findIndex((t) => !t.exiting)
    if (oldestDone !== -1) {
      toasts.value.splice(oldestDone, 1)
    } else {
      toasts.value.shift()
    }
  }
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
async function aria2AddUri(
  uri: string,
  intent?: { title?: string; year?: number; quality?: string; resource_type?: string },
): Promise<void> {
  try {
    await tasksStore.addTask(
      uri,
      undefined,
      intent
        ? {
            title: intent.title,
            year: intent.year,
            quality: intent.quality,
            resourceType: intent.resource_type,
          }
        : undefined,
    )
  } catch (e) {
    throw new Error(e instanceof Error ? e.message : String(e), { cause: e })
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

  const lines = message
    .trim()
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length > 1) {
    addToast({ id: generateToastId(), type: 'info', text: `Adding ${lines.length} downloads…`, createdAt: Date.now() })
    let succeeded = 0
    let failed = 0
    for (const line of lines) {
      if (/^(magnet:|ed2k:\/\/|https?:\/\/|ftp:\/\/)/i.test(line)) {
        try {
          await aria2AddUri(line)
          succeeded++
        } catch {
          failed++
        }
      }
    }
    addToast({
      id: generateToastId(),
      type: failed > 0 ? 'error' : 'success',
      text: failed > 0 ? `Batch: ${succeeded} added, ${failed} failed` : `Batch complete: ${succeeded} downloads added`,
      createdAt: Date.now(),
    })
    return
  }

  const trimmed = lines[0]

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

  // --- Natural language → parse intent → search → show results ---
  addToast({ id: generateToastId(), type: 'info', text: `Searching: "${trimmed}"…`, createdAt: Date.now() })
  try {
    const intent = await invoke<{
      title: string
      resource_type: string
      search_keywords: string[]
      quality: string
      year?: number
    }>('parse_nl_intent', { input: trimmed, llmConfig: openCode.getLLMConfig() })

    pendingIntent.value = intent
    const expandedKeywords = keywordGen.generate({
      title: intent.title,
      resource_type: intent.resource_type as 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other',
      year: intent.year,
      quality: intent.quality as '4K' | '1080p' | '720p' | 'other',
      need_subtitle: false,
      search_keywords: intent.search_keywords,
    })
    searchQuery.value = expandedKeywords[0] || intent.search_keywords[0] || intent.title
    searching.value = true
    showSearchResults.value = true
    searchResults.value = []

    try {
      const SEARCH_SOURCES = ['btdig', '1337x', 'nyaa', 'mikan'] as const
      const responses = await Promise.allSettled(
        SEARCH_SOURCES.map((source) =>
          invoke<{ results: SearchResult[]; total: number; source: string }>('search_proxy', {
            query: searchQuery.value,
            source,
            page: 0,
          }),
        ),
      )
      const allResults: SearchResult[] = []
      const seenHashes = new Set<string>()
      for (const r of responses) {
        if (r.status === 'fulfilled') {
          for (const result of r.value.results ?? []) {
            const hash = result.magnet.match(/btih:([a-zA-Z0-9]+)/i)?.[1]
            const key = hash || result.magnet || `${result.title}_${result.size}`
            if (key && !seenHashes.has(key)) {
              seenHashes.add(key)
              allResults.push(result)
            }
          }
        }
      }
      const ranked = evaluator.evaluate(allResults, {
        title: intent.title,
        resource_type: intent.resource_type as 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other',
        year: intent.year,
        quality: intent.quality as '4K' | '1080p' | '720p' | 'other',
        need_subtitle: false,
        search_keywords: expandedKeywords,
      })
      searchResults.value = ranked
      if (searchResults.value.length === 0) {
        addToast({
          id: generateToastId(),
          type: 'info',
          text: `No results for "${intent.title}"`,
          createdAt: Date.now(),
        })
        showSearchResults.value = false
      }
    } catch (searchErr) {
      addToast({
        id: generateToastId(),
        type: 'error',
        text: `Search failed: ${String(searchErr).slice(0, 60)}`,
        createdAt: Date.now(),
      })
      showSearchResults.value = false
    } finally {
      searching.value = false
    }
  } catch {
    addToast({
      id: generateToastId(),
      type: 'info',
      text: 'Hint: paste a magnet link or HTTP URL to download directly',
      createdAt: Date.now(),
    })
  }
}

function handleSelectSearchResult(result: SearchResult): void {
  showSearchResults.value = false
  if (result.magnet) {
    void aria2AddUri(result.magnet, pendingIntent.value || undefined)
    addToast({
      id: generateToastId(),
      type: 'success',
      text: `Downloading: ${result.title.slice(0, 40)}`,
      createdAt: Date.now(),
    })
    pendingIntent.value = null
  } else {
    addToast({ id: generateToastId(), type: 'error', text: 'No magnet link for this result', createdAt: Date.now() })
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
      handleSendMessage(
        'magnet:?xt=urn:btih:c9e15763f722f23e98a29decdfae341b51d5c4ea&dn=ubuntu-24.04.2-desktop-amd64.iso&tr=https%3A%2F%2Ftorrent.ubuntu.com%2Fannounce&tr=https%3A%2F%2Fipv6.torrent.ubuntu.com%2Fannounce',
      )
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
  selectedTaskId.value = task.id
  selectedTask.value = task
  showDetail.value = true
  keyboardIndex.value = -1
}

function closeDetail(): void {
  showDetail.value = false
  selectedTask.value = null
  selectedTaskId.value = null
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
  await tasksStore.pauseTask(target.gid || String(target.id))
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
  await tasksStore.resumeTask(target.gid || String(target.id))
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
  await tasksStore.retryTask(target.gid || String(target.id))
}

async function deleteTask(): Promise<void> {
  const target = showDetail.value ? selectedTask.value : menuTask.value
  if (!target) return
  try {
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    const accepted = await confirm(`Remove "${target.name}" from the download list?`, {
      title: 'Delete Download',
      kind: 'warning',
    })
    if (!accepted) return
  } catch {
    /* dialog not available in non-Tauri context */
  }
  closeDetail()
  closeMenu()
  addToast({
    id: generateToastId(),
    type: 'error',
    text: `"${target.name}" removed`,
    createdAt: Date.now(),
  })
  await tasksStore.removeTask(target.gid || String(target.id))
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
const fileSelection = ref<Map<number, boolean>>(new Map())

function onToggleFile(payload: { index: number; name: string; checked: boolean }): void {
  fileSelection.value.set(payload.index, payload.checked)
  addToast({
    id: generateToastId(),
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
    addToast({
      id: generateToastId(),
      type: 'info',
      text: `Local task — nothing to prioritize`,
      createdAt: Date.now(),
    })
    return
  }
  try {
    await tasksStore.bumpPriority(target.gid)
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

function completeOnboarding(): void {
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
      @go-home="goHome"
      @toggle-theme="toggleTheme"
      @open-settings="openSettings"
      @open-queue="router.push('/queue')"
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
        @update:filter="activeFilter = $event"
        @toggle-menu="toggleRowMenu"
        @open-detail="openDetail"
        @retry-connect="tasksStore.init().catch((e) => console.warn('retry failed:', e))"
        @try-sample="handleTrySample"
      />
    </main>

    <!-- Bottom chat input (96px, sticky bottom) -->
    <BottomChat @send="handleSendMessage" @quick-action="handleQuickAction" @attach="handleAttach" />

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
      @close="showSearchResults = false"
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
