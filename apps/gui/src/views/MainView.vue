<script setup lang="ts">
import { ref, computed, onMounted } from "vue"
import { useRouter } from "vue-router"
import { invoke } from "@tauri-apps/api/core"
import {
  NButton, NIcon, NTag, useMessage,
} from "naive-ui"
import {
  SettingsOutline, DownloadOutline, PauseOutline,
  PlayOutline, RefreshOutline, FolderOpenOutline,
  MusicalNotesOutline, DocumentTextOutline,
  ArchiveOutline, VideocamOutline,
} from "@vicons/ionicons5"
import TaskDetailModal from "@/components/TaskDetailModal.vue"
import SearchResultsModal from "@/components/SearchResultsModal.vue"
import { useTasksStore, type Task } from "@/stores/tasks"
import { useChatStore } from "@/composables/useChatStore"
import { useConfigStore } from "@/stores/config"
import { useOpenCode, type DownloadIntent } from "@/composables/useOpenCode"
import { useSearch } from "@/composables/useSearch"
import type { SearchResult } from "@/composables/useSearch"
import { useSubtitle } from "@/composables/useSubtitle"
import type { SubtitleResult } from "@/composables/useSubtitle"
import { t } from "@/composables/useSettings"

// ---- Stores & composables ----

const router = useRouter()
const message = useMessage()
const tasksStore = useTasksStore()
const chatStore = useChatStore()
const configStore = useConfigStore()

const { connected: openCodeConnected, parseIntent } = useOpenCode()
const { searchResults, searching, searchResources } = useSearch()
const {
  subtitleResults, searching: subtitleSearching,
  searchSubtitles, getBestSubtitle, autoSearch,
} = useSubtitle()

// ---- Store-derived reactive state ----

/** All tasks (used for the header count badge). */
const tasks = computed<Task[]>(() => tasksStore.tasks)
/** Tasks filtered by the active filter (used in the table body). */
const filteredTasks = computed<Task[]>(() => tasksStore.filteredTasks)
/** Number of tasks currently downloading. */
const activeCount = computed(() => tasksStore.activeCount)
/** Whether aria2 RPC is connected. */
const aria2Connected = computed(() => tasksStore.aria2Connected)
/** Global aria2 statistics (download speed, etc.). */
const globalStat = computed(() => tasksStore.globalStat)
/** Whether subtitles are enabled in the config. */
const subtitlesEnabled = computed(() => configStore.config.subtitles.enabled)

/**
 * Two-way binding for the task filter that delegates to the store.
 * The template reads and writes this computed transparently.
 */
const activeFilter = computed<string>({
  get: () => tasksStore.activeFilter,
  set: (v: string) => tasksStore.setFilter(v),
})

// ---- Search / intent state ----

const showSearchResults = ref(false)
const searchQuery = ref("")
const currentIntent = ref<DownloadIntent | null>(null)

// ---- Input state ----

const urlInput = ref("")
const chatInput = ref("")
const urlInputRef = ref<HTMLInputElement | null>(null)

// ---- Modal state ----

const showModal = ref(false)
const selectedTask = ref<Task | null>(null)

// ---- Demo tasks (seeded into the store on mount) ----

/**
 * Demo tasks shown when aria2 has no active downloads.
 * Seeded into the store's `localTasks` so the UI stays populated.
 */
const demoTasks: Task[] = [
  { id: 1, name: "ubuntu-24.04-desktop-amd64.iso", source: "releases.ubuntu.com", status: "downloading", progress: 84, speed: "24.6 MB/s", size: "4.8 GB / 5.7 GB", eta: "38s", type: "document" },
  { id: 2, name: "The.Weeknd.-.Dawn.FM.2025.mp3", source: "qobuz.com", status: "downloading", progress: 62, speed: "8.2 MB/s", size: "142 MB / 228 MB", eta: "10s", type: "audio" },
  { id: 3, name: "ubuntu-24.04-desktop-amd64.iso", source: "magnet:?xt=urn:btih:...", status: "downloading", progress: 35, speed: "9.8 MB/s", size: "2.0 GB / 5.7 GB", eta: "6m 24s", type: "torrent" },
  { id: 4, name: "Arch_Linux_2025.03.01-x86_64.iso", source: "archlinux.org", status: "completed", progress: 100, speed: "—", size: "876 MB / 876 MB", eta: "—", type: "document" },
  { id: 5, name: "VSCode_macOS_arm64_1.96.zip", source: "code.visualstudio.com", status: "paused", progress: 73, speed: "—", size: "178 MB / 245 MB", eta: "—", type: "archive" },
  { id: 6, name: "Big_Buck_Bunny_2160p.mkv", source: "archive.org", status: "failed", progress: 12, speed: "—", size: "214 MB / 1.8 GB", eta: "—", type: "video" },
]

onMounted(async () => {
  // The store's useAria2 lifecycle hooks don't fire inside a Pinia setup
  // store, so we must call init() explicitly from a real component.
  await tasksStore.init()
  // Seed demo tasks when aria2 is unavailable so the UI stays populated.
  if (!tasksStore.aria2Connected && tasksStore.localTasks.length === 0) {
    tasksStore.localTasks.push(...demoTasks)
  }
})

// ---- Download completion handler: notification + auto-organize ----

tasksStore.onTaskComplete(async (task) => {
  const filename = task.files?.[0]?.path?.split("/").pop()
    || task.bittorrent?.info?.name
    || task.gid
  const filePath = task.files?.[0]?.path

  // 1. System notification
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification")
    let granted = await isPermissionGranted()
    if (!granted) {
      const perm = await requestPermission()
      granted = perm === "granted"
    }
    if (granted) {
      sendNotification({
        title: t("msg.downloadComplete"),
        body: filename,
      })
    }
  } catch (e) {
    console.warn("Notification failed:", e)
  }

  // 2. Auto-organize file (categorize + rename + move)
  if (filePath) {
    try {
      const newPath = await invoke<string>("organize_file", {
        filePath,
        title: currentIntent.value?.title || undefined,
        year: currentIntent.value?.year || undefined,
        quality: currentIntent.value?.quality || undefined,
        resourceType: currentIntent.value?.resource_type || undefined,
      })
      message.success(`${t("msg.organized")}: ${newPath.split("/").pop()}`)
      console.log("File organized to:", newPath)
    } catch (e) {
      console.warn("Auto-organize failed:", e)
      // Not critical — file stays in download dir
    }
  }

  // 3. Auto-search subtitles if intent requires it
  if (currentIntent.value?.need_subtitle && filePath) {
    // Handled by subtitle composable flow
  }
})

// ---- UI helpers ----

/** Map a task type to its icon component. */
const getTypeIcon = (type: string) => {
  switch (type) {
    case "video": return VideocamOutline
    case "audio": return MusicalNotesOutline
    case "document": return DocumentTextOutline
    case "archive": return ArchiveOutline
    case "torrent": return DownloadOutline
    default: return DocumentTextOutline
  }
}

/** Return the status string for CSS class binding. */
const getStatusClass = (status: string) => {
  return status
}

/** Return a hex progress-bar color for the given status. */
const getProgressColor = (status: string) => {
  switch (status) {
    case "downloading": return "#3B82F6"
    case "completed": return "#10B981"
    case "paused": return "#F59E0B"
    case "failed": return "#EF4444"
    default: return "#3B82F6"
  }
}

// ---- Task actions (delegate to store) ----

/** Pause a downloading task via the store. */
const pauseTask = (taskId: number) => {
  void tasksStore.pauseTask(taskId)
}

/** Resume a paused task via the store. */
const resumeTask = (taskId: number) => {
  void tasksStore.resumeTask(taskId)
}

/** Retry a failed task via the store (handles both aria2 and local). */
const retryTask = (taskId: number) => {
  void tasksStore.retryTask(taskId)
}

/** Cancel and remove a task via the store, then close the detail modal. */
const cancelTask = async (taskId: number) => {
  await tasksStore.removeTask(taskId)
  closeModal()
}

// ---- Modal ----

/** Open the detail modal for a task by id. */
const openDetail = (taskId: number) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (task) {
    selectedTask.value = task
    showModal.value = true
  }
}

/** Close the detail modal. */
const closeModal = () => {
  showModal.value = false
  selectedTask.value = null
}

/** Open the folder containing a completed task's file. */
const openLocation = async (taskId: number) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task?.filePath) {
    message.warning(t("msg.noFilePath"))
    return
  }
  try {
    await invoke("show_in_folder", { path: task.filePath })
  } catch (e) {
    console.error("Failed to open folder:", e)
    // Fallback: copy path to clipboard
    const dir = task.filePath.substring(0, task.filePath.lastIndexOf("/"))
    navigator.clipboard.writeText(dir).then(() => {
      message.success(`${t("msg.pathCopied")}: ${dir}`)
    }).catch(() => {
      message.info(`${t("msg.fileLocation")}: ${dir}`)
    })
  }
}

// ---- Input handlers ----

/** Clear all completed tasks via the store. */
const handleClearCompleted = () => {
  void tasksStore.clearCompleted()
}

/** Paste a URL from the clipboard into the URL input field. */
const handlePasteLink = async () => {
  try {
    const text = await navigator.clipboard.readText()
    if (text) {
      urlInput.value = text
      urlInputRef.value?.focus()
    }
  } catch (e) {
    console.error("Failed to read clipboard:", e)
    message.warning(t("msg.clipboardReadFailed"))
  }
}

/** Submit a URL or magnet link to start a download via the store. */
const handleUrlSubmit = async () => {
  if (!urlInput.value.trim()) return
  const url = urlInput.value.trim()

  try {
    await tasksStore.addTask(url)
    if (tasksStore.aria2Connected) {
      message.success(`${t("msg.added")}: ${url.substring(0, 60)}...`)
    } else {
      message.warning(t("msg.aria2NotConnected"))
    }
    urlInput.value = ""
  } catch (e: unknown) {
    console.error("Failed to add URL:", e)
    const msg = e instanceof Error ? e.message : String(e)
    message.error(`${t("msg.addFailed")}: ${msg || t("msg.unknownError")}`)
  }
}

/**
 * Submit a natural-language chat message.
 * Records the user message and assistant response in the chat store,
 * then triggers resource search.
 */
const handleChatSubmit = async () => {
  if (!chatInput.value) return
  const input = chatInput.value
  chatInput.value = ""

  // Record the user message in the chat store
  chatStore.addUserMessage(input)

  try {
    // Parse intent using OpenCode
    const intent = await parseIntent(input)
    console.log("Parsed intent:", intent)

    // Build a human-readable summary
    const summary = `${t("msg.recognized")}: ${intent.title} (${intent.quality || t("msg.auto")})${intent.need_subtitle ? " + " + t("msg.subtitle") : ""}`

    // Record the assistant response in the chat store
    chatStore.addAssistantMessage(summary, intent)
    message.success(summary)

    // Store intent for subtitle search later
    currentIntent.value = intent

    // Search for resources
    searchQuery.value = intent.title
    showSearchResults.value = true
    await searchResources(intent)
  } catch (e) {
    console.error("Failed:", e)
    message.error(t("msg.searchFailed"))
    chatStore.addAssistantMessage(t("msg.searchFailed"), null, true)
  }
}

/** Select a search result and add it as a download via the store. */
const handleSelectResult = async (result: SearchResult) => {
  try {
    await tasksStore.addTask(result.magnet)
    message.success(`${t("msg.added")}: ${result.title}`)
    showSearchResults.value = false

    // Auto-search subtitles if intent requires it
    if (currentIntent.value?.need_subtitle && subtitlesEnabled.value && autoSearch.value) {
      message.info(t("msg.subtitleSearching"))
      await searchSubtitles(currentIntent.value.title)

      const best = getBestSubtitle()
      if (best) {
        message.success(`${t("msg.subtitleFound")}: ${best.language} (${best.fileName})`)
        // Auto-download the best subtitle
        // In production, save alongside the video file
      } else {
        message.warning(t("msg.subtitleNotFound"))
      }
    }
  } catch (e) {
    console.error("Failed to add:", e)
    message.error(t("msg.addDownloadFailed"))
  }
}

/** Select a subtitle result for download. */
const handleSelectSubtitle = async (subtitle: SubtitleResult) => {
  try {
    // In production, download and save alongside the video
    message.success(`${t("msg.subtitleDownload")}: ${subtitle.language} - ${subtitle.fileName}`)
    console.log("Selected subtitle:", subtitle)
  } catch (e) {
    console.error("Failed to download subtitle:", e)
    message.error(t("msg.subtitleDownloadFailed"))
  }
}

</script>

<template>
  <div class="main-view">
    <!-- Chrome Bar -->
    <header class="chrome">
      <div class="chrome-left">
        <div class="chrome-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="logo-icon">
            <path d="M12 2a10 10 0 1 0 10 10h-10Z"/>
            <path d="M12 12 2.93 5.4"/>
            <path d="M12 12 8.15 18.6"/>
            <path d="M12 12h10"/>
          </svg>
          <span><span class="accent">Motrix</span> AI</span>
        </div>
      </div>
      <div class="chrome-center"></div>
      <div class="chrome-right">
        <NButton quaternary circle size="small" @click="router.push('/settings')">
          <template #icon><NIcon><SettingsOutline /></NIcon></template>
        </NButton>
      </div>
    </header>

    <!-- Task Area -->
    <div class="task-area">
      <!-- Header -->
      <div class="task-header">
        <div class="task-header-left">
          <h2 class="task-title">
            <DownloadOutline :size="16" />
            {{ t('nav.downloads') }}
            <NTag size="small" round :bordered="false" class="count-tag">{{ tasks.length }}</NTag>
          </h2>
          <div class="task-filters">
            <NButton :type="activeFilter === 'all' ? 'primary' : 'default'" size="tiny" quaternary @click="activeFilter = 'all'">{{ t('filter.all') }}</NButton>
            <NButton :type="activeFilter === 'downloading' ? 'primary' : 'default'" size="tiny" quaternary @click="activeFilter = 'downloading'">{{ t('filter.active') }}</NButton>
            <NButton :type="activeFilter === 'completed' ? 'primary' : 'default'" size="tiny" quaternary @click="activeFilter = 'completed'">{{ t('filter.completed') }}</NButton>
            <NButton :type="activeFilter === 'failed' ? 'primary' : 'default'" size="tiny" quaternary @click="activeFilter = 'failed'">{{ t('filter.failed') }}</NButton>
          </div>
        </div>
        <div class="task-header-right">
          <span v-if="aria2Connected" class="connection-status connected">● aria2</span>
          <span v-else class="connection-status disconnected">○ aria2</span>
          <span v-if="openCodeConnected" class="connection-status connected">● OpenCode</span>
          <span v-else class="connection-status disconnected">○ OpenCode</span>
          <span class="speed-indicator">↓ {{ globalStat ? (Number(globalStat.downloadSpeed) / 1024 / 1024).toFixed(1) : '0.0' }} MB/s</span>
          <span class="active-count">{{ activeCount }} {{ t('status.active') }}</span>
          <NButton size="tiny" quaternary @click="handleClearCompleted">{{ t('btn.clear') }}</NButton>
        </div>
      </div>

      <!-- Table -->
      <div class="task-table-wrap">
        <table class="task-table">
          <thead>
            <tr>
              <th class="col-name">{{ t('table.name') }}</th>
              <th class="col-source">{{ t('table.source') }}</th>
              <th class="col-status">{{ t('table.status') }}</th>
              <th class="col-progress">{{ t('table.progress') }}</th>
              <th class="col-speed">{{ t('table.speed') }}</th>
              <th class="col-size">{{ t('table.size') }}</th>
              <th class="col-eta">{{ t('table.eta') }}</th>
              <th class="col-actions"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in filteredTasks" :key="task.id" @click="openDetail(task.id)">
              <td class="col-name">
                <div class="task-name-cell">
                  <div class="task-name-icon" :class="task.type">
                    <NIcon :size="14"><component :is="getTypeIcon(task.type)" /></NIcon>
                  </div>
                  <span class="task-name-text">{{ task.name }}</span>
                </div>
              </td>
              <td class="col-source">
                <span class="task-source-text">{{ task.source }}</span>
              </td>
              <td class="col-status">
                <span class="task-status-badge" :class="getStatusClass(task.status)">
                  {{ task.status.toUpperCase() }}
                </span>
              </td>
              <td class="col-progress">
                <div class="task-progress-cell">
                  <div class="task-progress-bar">
                    <div
                      class="task-progress-fill"
                      :style="{ width: task.progress + '%', background: getProgressColor(task.status) }"
                    ></div>
                  </div>
                  <span class="task-progress-text">{{ task.progress }}%</span>
                </div>
              </td>
              <td class="col-speed">
                <span class="task-speed-text" :class="{ active: task.status === 'downloading' }">{{ task.speed }}</span>
              </td>
              <td class="col-size">{{ task.size }}</td>
              <td class="col-eta">{{ task.eta }}</td>
              <td class="col-actions">
                <NButton v-if="task.status === 'downloading'" size="tiny" quaternary @click.stop="pauseTask(task.id)">
                  <template #icon><NIcon><PauseOutline /></NIcon></template>
                </NButton>
                <NButton v-else-if="task.status === 'paused'" size="tiny" quaternary @click.stop="resumeTask(task.id)">
                  <template #icon><NIcon><PlayOutline /></NIcon></template>
                </NButton>
                <NButton v-else-if="task.status === 'failed'" size="tiny" quaternary @click.stop="retryTask(task.id)">
                  <template #icon><NIcon><RefreshOutline /></NIcon></template>
                </NButton>
                <NButton v-else-if="task.status === 'completed'" size="tiny" quaternary @click.stop="openLocation(task.id)">
                  <template #icon><NIcon><FolderOpenOutline /></NIcon></template>
                </NButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Bottom Area -->
    <div class="bottom-area">
      <!-- Quick Actions -->
      <div class="quick-actions">
        <NButton size="small" class="action-chip action-chip-primary" @click="handlePasteLink">
          🔗 {{ t('action.pasteLink') }}
        </NButton>
        <NButton size="small" class="action-chip">
          📁 {{ t('action.uploadTorrent') }}
        </NButton>
        <NButton size="small" class="action-chip">
          ⬇️ {{ t('action.quickDownload') }}
        </NButton>
        <NButton size="small" class="action-chip" @click="router.push('/queue')">
          📋 {{ t('action.queue') }}
        </NButton>
        <NButton size="small" class="action-chip">
          ⏸ {{ t('btn.pauseAll') }}
        </NButton>
      </div>

      <!-- Input Row -->
      <div class="input-row">
        <div class="input-container">
          <input
            ref="urlInputRef"
            v-model="urlInput"
            class="input-field"
            :placeholder="t('search.placeholder')"
            @keyup.enter="handleUrlSubmit"
          />
          <NButton quaternary circle size="tiny" class="input-action-btn" @click="handleUrlSubmit">
            ⬇️
          </NButton>
          <div class="input-divider"></div>
          <input
            v-model="chatInput"
            class="input-field"
            :placeholder="t('search.chatPlaceholder')"
            @keyup.enter="handleChatSubmit"
          />
          <NButton type="primary" circle size="tiny" class="send-btn" @click="handleChatSubmit">
            ➤
          </NButton>
        </div>
      </div>
    </div>

    <!-- Task Detail Modal -->
    <TaskDetailModal
      :visible="showModal"
      :task="selectedTask"
      @close="closeModal"
      @pause="pauseTask"
      @resume="resumeTask"
      @retry="retryTask"
      @cancel="cancelTask"
      @open-location="openLocation"
    />

    <!-- Search Results Modal -->
    <SearchResultsModal
      :visible="showSearchResults"
      :results="searchResults"
      :searching="searching"
      :query="searchQuery"
      :subtitle-results="subtitleResults"
      :subtitle-searching="subtitleSearching"
      @close="showSearchResults = false"
      @select="handleSelectResult"
      @select-subtitle="handleSelectSubtitle"
    />
  </div>
</template>

<style scoped>
.main-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
}

/* Chrome */
.chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
  -webkit-app-region: drag;
}

.chrome-left {
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

.chrome-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
  letter-spacing: -0.01em;
}

.logo-icon {
  width: 18px;
  height: 18px;
}

.accent {
  color: var(--primary);
}

.chrome-right {
  display: flex;
  align-items: center;
  gap: 4px;
  -webkit-app-region: no-drag;
}

/* Task Area */
.task-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 12px 0 0;
}

.task-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px 12px;
}

.task-header-left {
  display: flex;
  align-items: center;
  gap: 24px; /* 增加间距匹配设计稿 */
}

.task-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
  min-width: 120px; /* 增加宽度匹配设计稿 */
}

.count-tag {
  font-size: 11px;
}

.task-filters {
  display: flex;
  gap: 4px;
}

.task-header-right {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}

.connection-status.connected {
  color: var(--accent);
}

.connection-status.disconnected {
  color: var(--fg-muted);
}

.speed-indicator {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--primary);
}

.active-count {
  color: var(--fg-tertiary);
}

/* Task Table */
.task-table-wrap {
  flex: 1;
  overflow: auto;
}

.task-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.task-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.task-table th {
  padding: 8px 16px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-muted);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
  text-align: left;
  user-select: none;
}

.task-table td {
  padding: 8px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.task-table tbody tr {
  cursor: pointer;
  transition: background var(--transition-fast);
}

.task-table tbody tr:hover {
  background: var(--surface);
}

/* Column widths */
.col-name { width: 25%; }
.col-source { width: 20%; }
.col-status { width: 10%; }
.col-progress { width: 18%; }
.col-speed { width: 10%; }
.col-size { width: 12%; }
.col-eta { width: 8%; }
.col-actions { width: 7%; }

/* Name cell */
.task-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-name-icon {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
}

.task-name-icon.video { background: var(--primary-muted); color: var(--primary); }
.task-name-icon.document { background: var(--accent-muted); color: var(--accent); }
.task-name-icon.archive { background: var(--warning-muted); color: var(--warning); }
.task-name-icon.torrent { background: var(--error-muted); color: var(--error); }
.task-name-icon.audio { background: rgba(139, 92, 246, 0.12); color: #8B5CF6; }

.task-name-text {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Source cell */
.task-source-text {
  font-size: 12px;
  color: var(--fg-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
  max-width: 100%;
}

/* Status badge */
.task-status-badge {
  display: inline-flex;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: var(--radius-full);
}

.task-status-badge.downloading {
  background: var(--primary-muted);
  color: var(--primary); /* 蓝色文字 */
}

.task-status-badge.paused {
  background: var(--warning-muted);
  color: var(--warning); /* 黄色文字 */
}

.task-status-badge.completed {
  background: var(--accent-muted);
  color: var(--accent); /* 绿色文字 */
}

.task-status-badge.failed {
  background: var(--error-muted);
  color: var(--error); /* 红色文字 */
}

/* Progress cell */
.task-progress-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.task-progress-bar {
  flex: 1;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  position: relative;
  min-width: 80px; /* 确保最小宽度 */
}

.task-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
  background: #3B82F6; /* 使用设计稿蓝色 */
}

.task-progress-text {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg-secondary);
  min-width: 32px;
  text-align: right;
}

/* Speed cell */
.task-speed-text {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg-tertiary);
}

.task-speed-text.active {
  color: var(--primary);
}

/* Bottom Area */
.bottom-area {
  padding: 12px 16px;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border);
}

.quick-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.action-chip {
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 12px;
}

.action-chip:hover {
  background: var(--surface-hover);
  border-color: var(--border-hover);
}

.action-chip-primary {
  background: var(--primary-muted);
  border-color: rgba(59, 130, 246, 0.2);
  color: var(--primary);
}

.action-chip-primary:hover {
  background: rgba(59, 130, 246, 0.18);
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-container {
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 8px;
  transition: all var(--transition-fast);
}

.input-container:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-muted);
}

.input-field {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--fg);
  font-size: 13px;
  font-family: var(--font-ui);
  padding: 8px 0;
  min-width: 0;
}

.input-field::placeholder {
  color: var(--fg-muted);
}

.input-divider {
  width: 1px;
  height: 20px;
  background: var(--border);
  margin: 0 8px;
  flex-shrink: 0;
}

.input-action-btn {
  flex-shrink: 0;
}

.send-btn {
  flex-shrink: 0;
}
</style>
