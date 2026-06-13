<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { invoke } from '@tauri-apps/api/core'
import {
  NButton, NIcon, NTag, NProgress, NCheckbox, NSpin, useMessage
} from 'naive-ui'
import {
  SettingsOutline, DownloadOutline, PauseOutline,
  PlayOutline, RefreshOutline, FolderOpenOutline,
  LinkOutline, CloudUploadOutline, ListOutline,
  SearchOutline, MusicalNotesOutline, DocumentTextOutline,
  ArchiveOutline, VideocamOutline, ClipboardOutline
} from '@vicons/ionicons5'
import TaskDetailModal from '@/components/TaskDetailModal.vue'
import SearchResultsModal from '@/components/SearchResultsModal.vue'
import { useAria2 } from '@/composables/useAria2'
import { useOpenCode } from '@/composables/useOpenCode'
import { useSearch } from '@/composables/useSearch'
import type { SearchResult } from '@/composables/useSearch'
import { useSubtitle } from '@/composables/useSubtitle'
import { isDark, language, t } from '@/composables/useSettings'

const router = useRouter()
const message = useMessage()
const { connected: aria2Connected, globalStat, tasks: aria2Tasks, addUri, pause, unpause, remove, onTaskComplete } = useAria2()
const { connected: openCodeConnected, parsing, parseIntent } = useOpenCode()
const { searchResults, searching, searchResources } = useSearch()
const { subtitleResults, searching: subtitleSearching, searchSubtitles, getBestSubtitle, autoSearch } = useSubtitle()

// Search state
const showSearchResults = ref(false)
const searchQuery = ref('')
const currentIntent = ref<any>(null) // Store parsed intent for subtitle search

// ---- Download completion handler: notification + auto-organize ----
onTaskComplete(async (task) => {
  const filename = task.files?.[0]?.path?.split('/').pop() || task.bittorrent?.info?.name || task.gid
  const filePath = task.files?.[0]?.path

  // 1. System notification
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import('@tauri-apps/plugin-notification')
    let granted = await isPermissionGranted()
    if (!granted) {
      const perm = await requestPermission()
      granted = perm === 'granted'
    }
    if (granted) {
      sendNotification({
        title: '✅ 下载完成',
        body: filename,
      })
    }
  } catch (e) {
    console.warn('Notification failed:', e)
  }

  // 2. Auto-organize file (categorize + rename + move)
  if (filePath) {
    try {
      const newPath = await invoke<string>('organize_file', {
        filePath,
        title: currentIntent.value?.title || undefined,
        year: currentIntent.value?.year || undefined,
        quality: currentIntent.value?.quality || undefined,
        resourceType: currentIntent.value?.resource_type || undefined,
      })
      message.success(`已整理: ${newPath.split('/').pop()}`)
      console.log('File organized to:', newPath)
    } catch (e) {
      console.warn('Auto-organize failed:', e)
      // Not critical — file stays in download dir
    }
  }

  // 3. Auto-search subtitles if intent requires it
  if (currentIntent.value?.need_subtitle && filePath) {
    // Will be handled by subtitle composable
  }
})

interface Task {
  id: number
  gid?: string
  name: string
  source: string
  status: 'downloading' | 'completed' | 'paused' | 'failed' | 'waiting'
  progress: number
  speed: string
  size: string
  eta: string
  type: 'video' | 'audio' | 'document' | 'archive' | 'torrent'
  filePath?: string
}

// Mock tasks for demo (when aria2 is empty)
const mockTasks = ref<Task[]>([
  { id: 1, name: 'ubuntu-24.04-desktop-amd64.iso', source: 'releases.ubuntu.com', status: 'downloading', progress: 84, speed: '24.6 MB/s', size: '4.8 GB / 5.7 GB', eta: '38s', type: 'document' },
  { id: 2, name: 'The.Weeknd.-.Dawn.FM.2025.mp3', source: 'qobuz.com', status: 'downloading', progress: 62, speed: '8.2 MB/s', size: '142 MB / 228 MB', eta: '10s', type: 'audio' },
  { id: 3, name: 'ubuntu-24.04-desktop-amd64.iso', source: 'magnet:?xt=urn:btih:...', status: 'downloading', progress: 35, speed: '9.8 MB/s', size: '2.0 GB / 5.7 GB', eta: '6m 24s', type: 'torrent' },
  { id: 4, name: 'Arch_Linux_2025.03.01-x86_64.iso', source: 'archlinux.org', status: 'completed', progress: 100, speed: '—', size: '876 MB / 876 MB', eta: '—', type: 'document' },
  { id: 5, name: 'VSCode_macOS_arm64_1.96.zip', source: 'code.visualstudio.com', status: 'paused', progress: 73, speed: '—', size: '178 MB / 245 MB', eta: '—', type: 'archive' },
  { id: 6, name: 'Big_Buck_Bunny_2160p.mkv', source: 'archive.org', status: 'failed', progress: 12, speed: '—', size: '214 MB / 1.8 GB', eta: '—', type: 'video' },
])

// Convert aria2 status to our Task format
const mapAria2Status = (status: string) => {
  switch (status) {
    case 'active': return 'downloading'
    case 'complete': return 'completed'
    case 'paused': return 'paused'
    case 'error': return 'failed'
    case 'waiting': return 'waiting'
    default: return 'waiting'
  }
}

const getTypeFromFilename = (filename: string): Task['type'] => {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (['mkv', 'mp4', 'avi', 'mov', 'wmv'].includes(ext)) return 'video'
  if (['mp3', 'flac', 'wav', 'aac', 'ogg'].includes(ext)) return 'audio'
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive'
  if (['torrent'].includes(ext)) return 'torrent'
  return 'document'
}

// Merge aria2 tasks with mock tasks
const tasks = computed<Task[]>(() => {
  if (aria2Tasks.value.length > 0) {
    return aria2Tasks.value.map((t, idx) => {
      const total = Number(t.totalLength) || 0
      const completed = Number(t.completedLength) || 0
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0
      const speed = Number(t.downloadSpeed) || 0
      const filename = t.files?.[0]?.path?.split('/').pop() || t.bittorrent?.info?.name || `Task ${t.gid}`
      
      return {
        id: idx + 1,
        gid: t.gid,
        name: filename,
        source: t.files?.[0]?.uris?.[0]?.uri || 'magnet:?xt=urn:btih:...',
        status: mapAria2Status(t.status) as Task['status'],
        progress,
        speed: speed > 0 ? `${(speed / 1024 / 1024).toFixed(1)} MB/s` : '—',
        size: `${(completed / 1024 / 1024).toFixed(0)} MB / ${(total / 1024 / 1024).toFixed(0)} MB`,
        eta: speed > 0 && total > completed ? `${Math.round((total - completed) / speed)}s` : '—',
        type: getTypeFromFilename(filename),
        filePath: t.files?.[0]?.path,
      }
    })
  }
  return mockTasks.value
})

const activeFilter = ref('all')
const urlInput = ref('')
const chatInput = ref('')
const urlInputRef = ref<HTMLInputElement | null>(null)

// Modal state
const showModal = ref(false)
const selectedTask = ref<Task | null>(null)

const filteredTasks = computed(() => {
  if (activeFilter.value === 'all') return tasks.value
  return tasks.value.filter(t => t.status === activeFilter.value)
})

const activeCount = computed(() => tasks.value.filter(t => t.status === 'downloading').length)

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'video': return VideocamOutline
    case 'audio': return MusicalNotesOutline
    case 'document': return DocumentTextOutline
    case 'archive': return ArchiveOutline
    case 'torrent': return DownloadOutline
    default: return DocumentTextOutline
  }
}

const getStatusClass = (status: string) => {
  return status
}

const getProgressColor = (status: string) => {
  switch (status) {
    case 'downloading': return '#3B82F6'
    case 'completed': return '#10B981'
    case 'paused': return '#F59E0B'
    case 'failed': return '#EF4444'
    default: return '#3B82F6'
  }
}

const openDetail = (taskId: number) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (task) {
    selectedTask.value = task
    showModal.value = true
  }
}

const closeModal = () => {
  showModal.value = false
  selectedTask.value = null
}

const pauseTask = async (taskId: number) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (task?.gid) {
    try {
      await pause(task.gid)
    } catch (e) {
      console.error('Failed to pause:', e)
    }
  } else if (task) {
    // Mock mode
    task.status = 'paused'
    task.speed = '—'
    task.eta = '—'
  }
}

const resumeTask = async (taskId: number) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (task?.gid) {
    try {
      await unpause(task.gid)
    } catch (e) {
      console.error('Failed to resume:', e)
    }
  } else if (task) {
    // Mock mode
    task.status = 'downloading'
    task.speed = '24.6 MB/s'
    task.eta = '38s'
  }
}

const retryTask = (taskId: number) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (task) {
    task.status = 'downloading'
    task.progress = 0
    task.speed = '24.6 MB/s'
    task.eta = 'calculating...'
  }
}

const cancelTask = (taskId: number) => {
  // Use aria2 remove function if available
  const task = tasks.value.find(t => t.id === taskId)
  if (task?.source.startsWith('magnet:') || task?.source.startsWith('http')) {
    // For real aria2 tasks, we would need the GID
    // For now, just close the modal
  }
  closeModal()
}

const openLocation = async (taskId: number) => {
  const task = tasks.value.find(t => t.id === taskId)
  if (!task?.filePath) {
    message.warning('No file path available')
    return
  }
  try {
    await invoke('show_in_folder', { path: task.filePath })
  } catch (e) {
    console.error('Failed to open folder:', e)
    // Fallback: copy path to clipboard
    const dir = task.filePath.substring(0, task.filePath.lastIndexOf('/'))
    navigator.clipboard.writeText(dir).then(() => {
      message.success(`Path copied: ${dir}`)
    }).catch(() => {
      message.info(`File location: ${dir}`)
    })
  }
}

const handleClearCompleted = () => {
  mockTasks.value = mockTasks.value.filter(t => t.status !== 'completed')
}

const handlePasteLink = async () => {
  try {
    const text = await navigator.clipboard.readText()
    if (text) {
      urlInput.value = text
      urlInputRef.value?.focus()
    }
  } catch (e) {
    console.error('Failed to read clipboard:', e)
    message.warning('无法读取剪贴板')
  }
}

const handleUrlSubmit = async () => {
  if (!urlInput.value.trim()) return
  const url = urlInput.value.trim()

  try {
    await addUri(url)
    message.success(`${t('msg.added')}: ${url.substring(0, 60)}...`)
    console.log('Added URL to aria2:', url)
    urlInput.value = ''
  } catch (e: any) {
    console.error('Failed to add URL:', e)
    // If aria2 not connected, add as mock task so user sees something
    if (!aria2Connected.value) {
      message.warning('aria2 未连接，已添加到本地列表')
      mockTasks.value.unshift({
        id: Date.now(),
        name: url.split('/').pop()?.split('?')[0] || url.substring(0, 40),
        source: url,
        status: 'downloading',
        progress: 0,
        speed: '—',
        size: '等待中...',
        eta: '—',
        type: getTypeFromFilename(url),
      })
      urlInput.value = ''
    } else {
      message.error(`添加失败: ${e?.message || '未知错误'}`)
    }
  }
}

const handleChatSubmit = async () => {
  if (chatInput.value) {
    const input = chatInput.value
    chatInput.value = ''
    
    try {
      // Parse intent using OpenCode
      const intent = await parseIntent(input)
      console.log('Parsed intent:', intent)
      
      // Show parsed intent to user
      message.success(`识别: ${intent.title} (${intent.quality || '自动'})${intent.need_subtitle ? ' + 字幕' : ''}`)
      
      // Store intent for subtitle search later
      currentIntent.value = intent
      
      // Search for resources
      searchQuery.value = intent.title
      showSearchResults.value = true
      await searchResources(intent)
      
    } catch (e) {
      console.error('Failed:', e)
      message.error('搜索失败，请重试')
    }
  }
}

const handleSelectResult = async (result: SearchResult) => {
  try {
    await addUri(result.magnet)
    message.success(`已添加: ${result.title}`)
    showSearchResults.value = false
    
    // Auto-search subtitles if intent requires it
    if (currentIntent.value?.need_subtitle && autoSearch.value) {
      message.info('正在搜索字幕...')
      await searchSubtitles(currentIntent.value.title)
      
      const best = getBestSubtitle()
      if (best) {
        message.success(`找到字幕: ${best.language} (${best.fileName})`)
        // Auto-download the best subtitle
        // In production, save alongside the video file
      } else {
        message.warning('未找到匹配字幕')
      }
    }
  } catch (e) {
    console.error('Failed to add:', e)
    message.error('添加下载失败')
  }
}

import type { SubtitleResult } from '@/composables/useSubtitle'

const handleSelectSubtitle = async (subtitle: SubtitleResult) => {
  try {
    // In production, download and save alongside the video
    message.success(`下载字幕: ${subtitle.language} - ${subtitle.fileName}`)
    console.log('Selected subtitle:', subtitle)
  } catch (e) {
    console.error('Failed to download subtitle:', e)
    message.error('字幕下载失败')
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
