<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NIcon, NCheckbox, NEmpty, NSpin } from 'naive-ui'
import {
  ArrowBackOutline,
  PauseOutline,
  PlayOutline,
  RefreshOutline,
  FolderOpenOutline,
  MusicalNotesOutline,
  DocumentTextOutline,
  ArchiveOutline,
  VideocamOutline,
  TrashOutline,
  ArrowUpOutline,
  ArrowDownOutline,
  SearchOutline,
  CloseOutline,
} from '@vicons/ionicons5'
import { useAria2Manager, type DownloadItem } from '@/composables/useAria2Manager'
import { useAria2, type TaskStatus } from '@/composables/useAria2'
import TaskDetailModal from '@/components/TaskDetailModal.vue'

const router = useRouter()
const manager = useAria2Manager()
const _aria2 = useAria2()

// ---- Selection & Filter state ----
const selectedGids = ref<Set<string>>(new Set())
const activeFilter = ref<'all' | 'active' | 'paused' | 'complete' | 'error'>('all')
const searchQuery = ref('')
const sortKey = ref<'name' | 'size' | 'speed' | 'status' | 'date'>('date')
const sortAsc = ref(false)

// ---- Detail modal state ----
const detailVisible = ref(false)
const detailTask = ref<DownloadItem | null>(null)

// ---- Category icon map ----
const categoryIcons: Record<string, typeof DocumentTextOutline> = {
  video: VideocamOutline,
  audio: MusicalNotesOutline,
  document: DocumentTextOutline,
  software: ArchiveOutline,
  archive: ArchiveOutline,
  image: DocumentTextOutline,
  other: DocumentTextOutline,
}

const getTypeIcon = (cat: string) => categoryIcons[cat] || DocumentTextOutline

// ---- Status mapping ----
type DisplayStatus = 'downloading' | 'completed' | 'paused' | 'pending' | 'failed'

function toDisplayStatus(s: TaskStatus): DisplayStatus {
  if (s === 'active') return 'downloading'
  if (s === 'complete') return 'completed'
  if (s === 'paused') return 'paused'
  if (s === 'waiting') return 'pending'
  return 'failed' // error, removed
}

function aria2FilterMatch(status: TaskStatus): boolean {
  const d = toDisplayStatus(status)
  if (activeFilter.value === 'all') return true
  if (activeFilter.value === 'active') return d === 'downloading'
  if (activeFilter.value === 'paused') return d === 'paused' || d === 'pending'
  if (activeFilter.value === 'complete') return d === 'completed'
  if (activeFilter.value === 'error') return d === 'failed'
  return true
}

// ---- Formatted task list ----
const filteredTasks = computed(() => {
  let items = manager.downloads.value.filter((t) => aria2FilterMatch(t.status))

  // Search filter
  if (searchQuery.value.trim()) {
    const q = searchQuery.value.toLowerCase().trim()
    items = items.filter((t) => t.name.toLowerCase().includes(q))
  }

  // Sort
  const key = sortKey.value
  const dir = sortAsc.value ? 1 : -1
  items = [...items].sort((a, b) => {
    if (key === 'name') return dir * a.name.localeCompare(b.name)
    if (key === 'size') return dir * (a.totalBytes - b.totalBytes)
    if (key === 'speed') return dir * (a.downloadSpeed - b.downloadSpeed)
    if (key === 'status') return dir * a.status.localeCompare(b.status)
    return dir * a.gid.localeCompare(b.gid)
  })

  return items
})

// ---- Stats ----
const stats = computed(() => {
  const all = manager.downloads.value
  const active = all.filter((t) => t.status === 'active').length
  const completed = all.filter((t) => t.status === 'complete').length
  const failed = all.filter((t) => t.status === 'error' || t.status === 'removed').length

  const totalSpeed = all.filter((t) => t.status === 'active').reduce((sum, t) => sum + t.downloadSpeed, 0)

  return { total: all.length, active, completed, failed, totalSpeed }
})

// ---- Helpers ----
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec <= 0) return '—'
  return `${formatBytes(bytesPerSec)}/s`
}

function formatSize(completed: number, total: number): string {
  if (total === 0) return '—'
  return `${formatBytes(completed)} / ${formatBytes(total)}`
}

function formatETA(item: DownloadItem): string {
  if (item.status !== 'active' || item.downloadSpeed === 0) return '—'
  const remaining = item.totalBytes - item.completedBytes
  if (remaining <= 0) return '—'
  const seconds = remaining / item.downloadSpeed
  if (seconds < 60) return `${Math.round(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

function getSource(item: DownloadItem): string {
  if (item.isBT) return 'BitTorrent'
  const uri = item.uris[0]
  if (!uri) return '—'
  try {
    return new URL(uri).hostname
  } catch {
    return uri.slice(0, 30)
  }
}

function getProgressColor(status: string): string {
  switch (status) {
    case 'active':
      return '#3B82F6'
    case 'complete':
      return '#10B981'
    case 'paused':
      return '#F59E0B'
    case 'waiting':
      return '#94A3B8'
    case 'error':
    case 'removed':
      return '#EF4444'
    default:
      return '#3B82F6'
  }
}

// ---- Selection ----
const allSelected = computed(() => {
  if (filteredTasks.value.length === 0) return false
  return filteredTasks.value.every((t) => selectedGids.value.has(t.gid))
})

function toggleSelectAll() {
  if (allSelected.value) {
    selectedGids.value.clear()
  } else {
    for (const t of filteredTasks.value) {
      selectedGids.value.add(t.gid)
    }
  }
}

function toggleSelect(gid: string) {
  if (selectedGids.value.has(gid)) {
    selectedGids.value.delete(gid)
  } else {
    selectedGids.value.add(gid)
  }
}

// Clear selection when filter changes
watch(activeFilter, () => {
  selectedGids.value.clear()
})

// ---- Actions ----
async function handlePause(gid: string) {
  try {
    await manager.pauseDownload(gid)
  } catch (e) {
    console.error(e)
  }
}

async function handleResume(gid: string) {
  try {
    await manager.resumeDownload(gid)
  } catch (e) {
    console.error(e)
  }
}

async function handleRemove(gid: string) {
  try {
    await manager.cancelDownload(gid)
  } catch (e) {
    console.error(e)
  }
}

async function handleOpenFolder(task: DownloadItem) {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    const filePath = task.dir ? `${task.dir}/${task.name}` : task.name
    await invoke('show_in_folder', { path: filePath })
  } catch (e) {
    console.error('Failed to open folder:', e)
  }
}

async function handleReconnect() {
  try {
    const { useTasksStore } = await import('@/stores/tasks')
    const store = useTasksStore()
    await store.init()
  } catch (e) {
    console.error('Reconnect failed:', e)
  }
}

async function handleRetry(item: DownloadItem) {
  try {
    const uri = item.uris[0]
    if (uri) {
      await manager.cancelDownload(item.gid)
      await manager.addDownload(uri, { dir: item.dir })
    }
  } catch (e) {
    console.error(e)
  }
}

async function handlePauseAll() {
  try {
    await manager.pauseAllDownloads()
  } catch (e) {
    console.error(e)
  }
}

async function handleResumeAll() {
  try {
    await manager.resumeAllDownloads()
  } catch (e) {
    console.error(e)
  }
}

async function handleClearCompleted() {
  try {
    await manager.clearCompleted()
  } catch (e) {
    console.error(e)
  }
}

async function handleMoveUp(gid: string, steps = 1) {
  try {
    await manager.moveDownloadUp(gid, steps)
  } catch (e) {
    console.error(e)
  }
}

async function handleMoveDown(gid: string, steps = 1) {
  try {
    await manager.moveDownloadDown(gid, steps)
  } catch (e) {
    console.error(e)
  }
}

// ---- Bulk actions ----
async function handleBulkPause() {
  for (const gid of selectedGids.value) {
    try {
      await manager.pauseDownload(gid)
    } catch (e) {
      console.error(e)
    }
  }
  selectedGids.value.clear()
}

async function handleBulkResume() {
  for (const gid of selectedGids.value) {
    try {
      await manager.resumeDownload(gid)
    } catch (e) {
      console.error(e)
    }
  }
  selectedGids.value.clear()
}

async function handleBulkRemove() {
  for (const gid of selectedGids.value) {
    try {
      await manager.cancelDownload(gid)
    } catch (e) {
      console.error(e)
    }
  }
  selectedGids.value.clear()
}

// ---- Detail modal ----
function openDetail(item: DownloadItem) {
  detailTask.value = item
  detailVisible.value = true
}

function closeDetail() {
  detailVisible.value = false
  detailTask.value = null
}

// ---- Sort toggle ----
function toggleSort(key: typeof sortKey.value) {
  if (sortKey.value === key) {
    sortAsc.value = !sortAsc.value
  } else {
    sortKey.value = key
    sortAsc.value = false
  }
}

// ---- Drag reorder ----
let draggedGid: string | null = null

function onDragStart(gid: string) {
  draggedGid = gid
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

async function onDrop(targetGid: string) {
  if (!draggedGid || draggedGid === targetGid) return
  const items = filteredTasks.value
  const fromIdx = items.findIndex((t) => t.gid === draggedGid)
  const toIdx = items.findIndex((t) => t.gid === targetGid)
  if (fromIdx < 0 || toIdx < 0) return

  if (fromIdx < toIdx) {
    await handleMoveDown(draggedGid, toIdx - fromIdx)
  } else {
    await handleMoveUp(draggedGid, fromIdx - toIdx)
  }
  draggedGid = null
}

// Map DownloadItem category to TaskDetailModal type
function mapCategoryToType(cat: string): 'video' | 'audio' | 'document' | 'archive' | 'torrent' {
  if (cat === 'video') return 'video'
  if (cat === 'audio') return 'audio'
  if (cat === 'archive' || cat === 'software') return 'archive'
  return 'document'
}

// Convert DisplayStatus to TaskDetailModal status
function toModalStatus(s: TaskStatus): 'downloading' | 'completed' | 'paused' | 'failed' {
  const d = toDisplayStatus(s)
  if (d === 'pending') return 'paused'
  if (d === 'downloading') return 'downloading'
  if (d === 'completed') return 'completed'
  return 'failed'
}
</script>

<template>
  <div class="queue-view">
    <!-- Chrome -->
    <header class="chrome">
      <div class="chrome-left">
        <div class="chrome-logo">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="logo-icon"
          >
            <path d="M12 2a10 10 0 1 0 10 10h-10Z" />
            <path d="M12 12 2.93 5.4" />
            <path d="M12 12 8.15 18.6" />
            <path d="M12 12h10" />
          </svg>
          <span><span class="accent">Download</span> Queue</span>
        </div>
      </div>
      <div class="chrome-center"></div>
      <div class="chrome-right">
        <NButton quaternary size="small" @click="router.push('/')">
          <template #icon
            ><NIcon><ArrowBackOutline /></NIcon
          ></template>
          Back to Chat
        </NButton>
      </div>
    </header>

    <!-- Stats -->
    <div class="stats-bar">
      <div class="stat-item">
        <div class="stat-value">{{ stats.total }}</div>
        <div class="stat-label">Total Tasks</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.active }}</div>
        <div class="stat-label">Active</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.completed }}</div>
        <div class="stat-label">Completed</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">{{ stats.failed }}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat-item stat-speed">
        <div class="stat-value">{{ formatBytes(stats.totalSpeed) }}</div>
        <div class="stat-label">/s Total</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="filter-bar">
      <div class="filter-tabs">
        <NButton
          :type="activeFilter === 'all' ? 'primary' : 'default'"
          size="tiny"
          quaternary
          @click="activeFilter = 'all'"
          >All</NButton
        >
        <NButton
          :type="activeFilter === 'active' ? 'primary' : 'default'"
          size="tiny"
          quaternary
          @click="activeFilter = 'active'"
          >Active</NButton
        >
        <NButton
          :type="activeFilter === 'paused' ? 'primary' : 'default'"
          size="tiny"
          quaternary
          @click="activeFilter = 'paused'"
          >Paused</NButton
        >
        <NButton
          :type="activeFilter === 'complete' ? 'primary' : 'default'"
          size="tiny"
          quaternary
          @click="activeFilter = 'complete'"
          >Completed</NButton
        >
        <NButton
          :type="activeFilter === 'error' ? 'primary' : 'default'"
          size="tiny"
          quaternary
          @click="activeFilter = 'error'"
          >Failed</NButton
        >
      </div>
      <div class="filter-actions">
        <div class="search-box">
          <NIcon size="14"><SearchOutline /></NIcon>
          <input v-model="searchQuery" type="text" placeholder="Search tasks..." class="search-input" />
          <button v-if="searchQuery" class="search-clear" @click="searchQuery = ''">
            <NIcon size="12"><CloseOutline /></NIcon>
          </button>
        </div>
        <NButton size="tiny" quaternary @click="handlePauseAll">Pause All</NButton>
        <NButton size="tiny" quaternary @click="handleResumeAll">Resume All</NButton>
        <NButton size="tiny" quaternary type="error" @click="handleClearCompleted">Clear Completed</NButton>
      </div>
    </div>

    <!-- Bulk action bar -->
    <div v-if="selectedGids.size > 0" class="bulk-bar">
      <span class="bulk-count">{{ selectedGids.size }} selected</span>
      <NButton size="tiny" type="primary" quaternary @click="handleBulkResume">
        <template #icon
          ><NIcon><PlayOutline /></NIcon
        ></template>
        Resume
      </NButton>
      <NButton size="tiny" quaternary @click="handleBulkPause">
        <template #icon
          ><NIcon><PauseOutline /></NIcon
        ></template>
        Pause
      </NButton>
      <NButton size="tiny" type="error" quaternary @click="handleBulkRemove">
        <template #icon
          ><NIcon><TrashOutline /></NIcon
        ></template>
        Remove
      </NButton>
      <NButton size="tiny" quaternary @click="selectedGids.clear()">Cancel</NButton>
    </div>

    <!-- Loading -->
    <div v-if="manager.connecting.value" class="loading-container">
      <NSpin size="large" />
      <span class="loading-text">Connecting to aria2...</span>
    </div>

    <!-- Table -->
    <div v-else class="table-container">
      <table class="queue-table">
        <thead>
          <tr>
            <th class="col-check"><NCheckbox :checked="allSelected" @update:checked="toggleSelectAll" /></th>
            <th class="col-name sortable" @click="toggleSort('name')">
              NAME {{ sortKey === 'name' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="col-source">SOURCE</th>
            <th class="col-status sortable" @click="toggleSort('status')">
              STATUS {{ sortKey === 'status' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="col-progress">PROGRESS</th>
            <th class="col-speed sortable" @click="toggleSort('speed')">
              SPEED {{ sortKey === 'speed' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="col-size sortable" @click="toggleSort('size')">
              SIZE {{ sortKey === 'size' ? (sortAsc ? '↑' : '↓') : '' }}
            </th>
            <th class="col-eta">ETA</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="task in filteredTasks"
            :key="task.gid"
            :class="{ selected: selectedGids.has(task.gid) }"
            draggable="true"
            @dragstart="onDragStart(task.gid)"
            @dragover="onDragOver"
            @drop="onDrop(task.gid)"
            @click="openDetail(task)"
          >
            <td class="col-check" @click.stop>
              <NCheckbox :checked="selectedGids.has(task.gid)" @update:checked="toggleSelect(task.gid)" />
            </td>
            <td class="col-name">
              <div class="task-name-cell">
                <div class="task-name-icon" :class="task.category">
                  <NIcon :size="14"><component :is="getTypeIcon(task.category)" /></NIcon>
                </div>
                <span class="task-name-text">{{ task.name }}</span>
              </div>
            </td>
            <td class="col-source">
              <span class="task-source-text">{{ getSource(task) }}</span>
            </td>
            <td class="col-status">
              <span class="task-status-badge" :class="toDisplayStatus(task.status)">
                {{ toDisplayStatus(task.status).toUpperCase() }}
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
              <span class="task-speed-text" :class="{ active: task.status === 'active' }">
                {{ task.status === 'active' ? formatSpeed(task.downloadSpeed) : '—' }}
              </span>
            </td>
            <td class="col-size">{{ formatSize(task.completedBytes, task.totalBytes) }}</td>
            <td class="col-eta">{{ formatETA(task) }}</td>
            <td class="col-actions" @click.stop>
              <div class="action-btns">
                <NButton v-if="task.status === 'active'" size="tiny" quaternary @click="handlePause(task.gid)">
                  <template #icon
                    ><NIcon><PauseOutline /></NIcon
                  ></template>
                </NButton>
                <NButton
                  v-if="task.status === 'paused' || task.status === 'waiting'"
                  size="tiny"
                  quaternary
                  @click="handleResume(task.gid)"
                >
                  <template #icon
                    ><NIcon><PlayOutline /></NIcon
                  ></template>
                </NButton>
                <NButton
                  v-if="task.status === 'error' || task.status === 'removed'"
                  size="tiny"
                  quaternary
                  @click="handleRetry(task)"
                >
                  <template #icon
                    ><NIcon><RefreshOutline /></NIcon
                  ></template>
                </NButton>
                <NButton v-if="task.status === 'complete'" size="tiny" quaternary @click="handleOpenFolder(task)">
                  <template #icon
                    ><NIcon><FolderOpenOutline /></NIcon
                  ></template>
                </NButton>
                <NButton
                  v-if="task.status === 'waiting' || task.status === 'paused'"
                  size="tiny"
                  quaternary
                  @click="handleMoveUp(task.gid)"
                >
                  <template #icon
                    ><NIcon><ArrowUpOutline /></NIcon
                  ></template>
                </NButton>
                <NButton
                  v-if="task.status === 'waiting' || task.status === 'paused'"
                  size="tiny"
                  quaternary
                  @click="handleMoveDown(task.gid)"
                >
                  <template #icon
                    ><NIcon><ArrowDownOutline /></NIcon
                  ></template>
                </NButton>
                <NButton size="tiny" quaternary type="error" @click="handleRemove(task.gid)">
                  <template #icon
                    ><NIcon><TrashOutline /></NIcon
                  ></template>
                </NButton>
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Empty state -->
      <div v-if="filteredTasks.length === 0" class="empty-state">
        <NEmpty :description="searchQuery ? 'No tasks match your search' : 'No downloads in queue'" />
      </div>
    </div>

    <!-- Bottom Bar -->
    <div class="bottom-bar">
      <div class="bottom-left">
        <span class="speed-text">↓ {{ formatSpeed(stats.totalSpeed) }}</span>
        <span class="divider">total</span>
        <span class="divider">•</span>
        <span>{{ stats.active }} active tasks</span>
      </div>
      <div class="bottom-right">
        <span :class="['connection-dot', manager.connected.value ? 'connected' : 'disconnected']"></span>
        <span class="connection-text">{{ manager.connected.value ? 'aria2 connected' : 'aria2 disconnected' }}</span>
        <NButton v-if="!manager.connected.value" size="tiny" type="primary" quaternary @click="handleReconnect"
          >Reconnect</NButton
        >
      </div>
    </div>

    <!-- Task Detail Modal -->
    <TaskDetailModal
      :visible="detailVisible"
      :task="
        detailTask
          ? {
              id: 0,
              name: detailTask.name,
              source: getSource(detailTask),
              status: toModalStatus(detailTask.status),
              progress: detailTask.progress,
              speed: detailTask.status === 'active' ? formatSpeed(detailTask.downloadSpeed) : '—',
              size: formatSize(detailTask.completedBytes, detailTask.totalBytes),
              eta: formatETA(detailTask),
              type: mapCategoryToType(detailTask.category),
              filePath: detailTask.dir,
            }
          : null
      "
      @close="closeDetail"
      @pause="detailTask && handlePause(detailTask.gid)"
      @resume="detailTask && handleResume(detailTask.gid)"
      @retry="detailTask && handleRetry(detailTask)"
      @cancel="detailTask && handleRemove(detailTask.gid)"
    />
  </div>
</template>

<style scoped>
.queue-view {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
}

.chrome {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}

.chrome-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 13px;
}

.logo-icon {
  width: 18px;
  height: 18px;
}

.accent {
  color: var(--primary);
}

.stats-bar {
  display: flex;
  gap: 16px;
  padding: 16px;
  margin: 16px;
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.stat-item {
  flex: 1;
  text-align: center;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 600;
}

.stat-label {
  font-size: 11px;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.stat-speed .stat-value {
  color: var(--primary);
}

.filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  margin-bottom: 12px;
  gap: 12px;
  flex-wrap: wrap;
}

.filter-tabs,
.filter-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  min-width: 180px;
}

.search-input {
  background: transparent;
  border: none;
  color: var(--fg);
  font-size: 12px;
  width: 100%;
}

.search-input:focus {
  outline: none;
}

.search-input::placeholder {
  color: var(--fg-muted);
}

.search-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--fg-muted);
  display: flex;
  align-items: center;
}

.bulk-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin: 0 16px 8px;
  background: var(--primary-muted);
  border-radius: var(--radius-sm);
}

.bulk-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  margin-right: 8px;
}

.loading-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.loading-text {
  color: var(--fg-muted);
  font-size: 13px;
}

.table-container {
  flex: 1;
  overflow: auto;
  margin: 0 16px;
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.queue-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.queue-table thead {
  position: sticky;
  top: 0;
  z-index: 2;
}

.queue-table th {
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

.queue-table th.sortable {
  cursor: pointer;
}

.queue-table th.sortable:hover {
  color: var(--fg);
}

.queue-table td {
  padding: 8px 16px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}

.queue-table tbody tr {
  cursor: pointer;
}

.queue-table tbody tr:hover {
  background: var(--surface-hover);
}

.queue-table tbody tr.selected {
  background: var(--primary-muted);
}

.col-check {
  width: 40px;
}
.col-name {
  width: 25%;
}
.col-source {
  width: 15%;
}
.col-status {
  width: 9%;
}
.col-progress {
  width: 16%;
}
.col-speed {
  width: 10%;
}
.col-size {
  width: 12%;
}
.col-eta {
  width: 7%;
}
.col-actions {
  width: 8%;
}

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
}

.task-name-icon.video {
  background: var(--primary-muted);
  color: var(--primary);
}
.task-name-icon.document {
  background: var(--accent-muted);
  color: var(--accent);
}
.task-name-icon.archive {
  background: var(--warning-muted);
  color: var(--warning);
}
.task-name-icon.software {
  background: var(--warning-muted);
  color: var(--warning);
}
.task-name-icon.image {
  background: var(--accent-muted);
  color: var(--accent);
}
.task-name-icon.other {
  background: var(--accent-muted);
  color: var(--accent);
}

.task-name-text {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-source-text {
  font-size: 12px;
  color: var(--fg-tertiary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

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
  color: var(--primary);
}

.task-status-badge.pending {
  background: var(--surface);
  color: var(--fg-muted);
}

.task-status-badge.paused {
  background: var(--warning-muted);
  color: var(--warning);
}

.task-status-badge.completed {
  background: var(--accent-muted);
  color: var(--accent);
}

.task-status-badge.failed {
  background: var(--error-muted);
  color: var(--error);
}

.task-progress-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-progress-bar {
  flex: 1;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
  min-width: 60px;
}

.task-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
  background: #3b82f6;
}

.task-progress-text {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg-secondary);
  min-width: 32px;
  text-align: right;
}

.task-speed-text {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg-tertiary);
}

.task-speed-text.active {
  color: var(--primary);
}

.action-btns {
  display: flex;
  gap: 2px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 16px;
}

.bottom-bar {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  margin: 16px;
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--fg-muted);
}

.bottom-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bottom-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.speed-text {
  font-family: var(--font-mono);
  color: var(--primary);
}

.divider {
  color: var(--fg-muted);
}

.connection-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.connection-dot.connected {
  background: #10b981;
}

.connection-dot.disconnected {
  background: #ef4444;
}

.connection-text {
  font-size: 11px;
  color: var(--fg-tertiary);
}

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    transition-duration: 100ms !important;
  }
}
</style>
