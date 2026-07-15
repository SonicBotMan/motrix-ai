<script setup lang="ts">
import { computed } from 'vue'
import { NModal, NButton, NIcon } from 'naive-ui'
import {
  PauseOutline,
  PlayOutline,
  RefreshOutline,
  FolderOpenOutline,
  TrashOutline,
  CloseOutline,
  DownloadOutline,
  MusicalNotesOutline,
  DocumentTextOutline,
  ArchiveOutline,
  VideocamOutline,
} from '@vicons/ionicons5'

interface Task {
  id: number
  name: string
  source: string
  status: 'downloading' | 'completed' | 'paused' | 'failed' | 'pending'
  progress: number
  speed: string
  size: string
  eta: string
  type: 'video' | 'audio' | 'document' | 'archive' | 'torrent'
  filePath?: string
}

const props = defineProps<{
  visible: boolean
  task: Task | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'pause', id: number): void
  (e: 'resume', id: number): void
  (e: 'retry', id: number): void
  (e: 'cancel', id: number): void
  (e: 'openLocation', id: number): void
}>()

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'video':
      return VideocamOutline
    case 'audio':
      return MusicalNotesOutline
    case 'document':
      return DocumentTextOutline
    case 'archive':
      return ArchiveOutline
    case 'torrent':
      return DownloadOutline
    default:
      return DocumentTextOutline
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'downloading':
      return 'var(--primary)'
    case 'completed':
      return 'var(--accent)'
    case 'paused':
      return 'var(--warning)'
    case 'pending':
      return 'var(--fg-tertiary)'
    case 'failed':
      return 'var(--error)'
    default:
      return '#3B82F6'
  }
}

const circumference = 2 * Math.PI * 40
const dashoffset = computed(() => {
  if (!props.task) return circumference
  return circumference - (props.task.progress / 100) * circumference
})

// Mock files for demo
const files = computed(() => {
  if (!props.task) return []
  return [{ name: props.task.name, size: props.task.size, checked: true }]
})

// Mock timeline for demo
const timeline = computed(() => {
  if (!props.task) return []
  const now = new Date()
  return [
    {
      time: formatTime(now),
      text: `${props.task.status.toUpperCase()} — ${props.task.progress}% complete`,
      type: props.task.status,
    },
    { time: formatTime(new Date(now.getTime() - 60000)), text: 'Connecting to peers (47 seeders)', type: 'completed' },
    { time: formatTime(new Date(now.getTime() - 120000)), text: 'Metadata received', type: 'completed' },
    { time: formatTime(new Date(now.getTime() - 180000)), text: 'Resolving magnet link', type: 'completed' },
    { time: formatTime(new Date(now.getTime() - 240000)), text: 'Task created', type: 'completed' },
  ]
})

const formatTime = (date: Date) => {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`
}
</script>

<template>
  <NModal
    :show="visible"
    :mask-closable="true"
    :close-on-esc="true"
    transform-origin="center"
    @update:show="(val) => !val && emit('close')"
  >
    <div v-if="task" class="detail-panel">
      <!-- Header -->
      <div class="detail-header">
        <div class="detail-header-left">
          <div class="detail-icon" :class="task.type">
            <NIcon :size="20"><component :is="getTypeIcon(task.type)" /></NIcon>
          </div>
          <div class="detail-title-area">
            <h2 class="detail-title">{{ task.name }}</h2>
            <span class="detail-source">{{ task.source }}</span>
          </div>
        </div>
        <NButton quaternary circle size="small" @click="emit('close')">
          <template #icon
            ><NIcon><CloseOutline /></NIcon
          ></template>
        </NButton>
      </div>

      <!-- Body -->
      <div class="detail-body">
        <!-- Progress Ring -->
        <div class="detail-progress-ring">
          <svg class="progress-ring-svg" width="96" height="96" viewBox="0 0 96 96">
            <circle class="progress-ring-bg" cx="48" cy="48" r="40" stroke-width="6" />
            <circle
              class="progress-ring-fill"
              cx="48"
              cy="48"
              r="40"
              stroke-width="6"
              :stroke-dasharray="circumference"
              :stroke-dashoffset="dashoffset"
              :stroke="getStatusColor(task.status)"
            />
            <text class="progress-ring-text" x="48" y="52" text-anchor="middle" dominant-baseline="central">
              {{ task.progress }}%
            </text>
          </svg>
          <div class="detail-progress-info">
            <div class="detail-size">{{ task.size }}</div>
            <div class="detail-meta">
              <span v-if="task.status === 'downloading'">↓ {{ task.speed }} · ETA {{ task.eta }}</span>
              <span v-else-if="task.status === 'completed'">Download complete</span>
              <span v-else-if="task.status === 'paused'">Paused</span>
              <span v-else-if="task.status === 'pending'">Pending</span>
              <span v-else-if="task.status === 'failed'">Download failed</span>
            </div>
          </div>
        </div>

        <!-- Stats Grid -->
        <div class="detail-stats">
          <div class="stat-item">
            <div class="stat-label">Downloaded</div>
            <div id="statDownloaded" class="stat-value">{{ task.size.split(' / ')[0] }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Total</div>
            <div id="statTotal" class="stat-value">{{ task.size.split(' / ')[1] || task.size }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Speed</div>
            <div id="statSpeed" class="stat-value">{{ task.speed }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">ETA</div>
            <div id="statEta" class="stat-value">{{ task.eta }}</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Connections</div>
            <div class="stat-value">47</div>
          </div>
          <div class="stat-item">
            <div class="stat-label">Seeders</div>
            <div class="stat-value">23</div>
          </div>
        </div>

        <!-- File List -->
        <div class="detail-section">
          <div class="detail-section-title">Files</div>
          <div class="file-list">
            <div v-for="(file, index) in files" :key="index" class="file-row">
              <input type="checkbox" :checked="file.checked" />
              <span class="file-name">{{ file.name }}</span>
              <span class="file-size">{{ file.size }}</span>
            </div>
          </div>
        </div>

        <!-- Timeline -->
        <div class="detail-section">
          <div class="detail-section-title">Activity</div>
          <div class="timeline">
            <div v-for="(item, index) in timeline" :key="index" class="timeline-item" :class="item.type">
              <div class="timeline-time">{{ item.time }}</div>
              <div class="timeline-text">{{ item.text }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="detail-actions">
        <NButton v-if="task.status === 'downloading'" type="primary" @click="emit('pause', task.id)">
          <template #icon
            ><NIcon><PauseOutline /></NIcon
          ></template>
          Pause
        </NButton>
        <NButton v-else-if="task.status === 'paused'" type="primary" @click="emit('resume', task.id)">
          <template #icon
            ><NIcon><PlayOutline /></NIcon
          ></template>
          Resume
        </NButton>
        <NButton v-else-if="task.status === 'failed'" type="primary" @click="emit('retry', task.id)">
          <template #icon
            ><NIcon><RefreshOutline /></NIcon
          ></template>
          Retry
        </NButton>

        <NButton v-if="task.status === 'downloading'" @click="emit('pause', task.id)">
          <template #icon
            ><NIcon><PauseOutline /></NIcon
          ></template>
          Pause
        </NButton>

        <NButton @click="emit('openLocation', task.id)">
          <template #icon
            ><NIcon><FolderOpenOutline /></NIcon
          ></template>
          Open Location
        </NButton>

        <NButton type="error" style="margin-left: auto" @click="emit('cancel', task.id)">
          <template #icon
            ><NIcon><TrashOutline /></NIcon
          ></template>
          Cancel
        </NButton>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.detail-panel {
  width: 100%;
  max-width: 640px;
  max-height: 85vh;
  overflow-y: auto;
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.detail-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.detail-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.detail-icon.video {
  background: var(--primary-muted);
  color: var(--primary);
}
.detail-icon.document {
  background: var(--accent-muted);
  color: var(--accent);
}
.detail-icon.archive {
  background: var(--warning-muted);
  color: var(--warning);
}
.detail-icon.torrent {
  background: var(--error-muted);
  color: var(--error);
}
.detail-icon.audio {
  background: rgba(139, 92, 246, 0.12);
  color: #8b5cf6;
}

.detail-title-area {
  min-width: 0;
}

.detail-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail-source {
  font-size: 12px;
  color: var(--fg-tertiary);
}

.detail-body {
  padding: 24px;
}

.detail-progress-ring {
  display: flex;
  align-items: center;
  gap: 24px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 24px;
}

.progress-ring-svg {
  flex-shrink: 0;
  transform: rotate(-90deg);
}

.progress-ring-bg {
  fill: none;
  stroke: var(--border);
}

.progress-ring-fill {
  fill: none;
  stroke-linecap: round;
  transition: stroke-dashoffset 0.3s ease;
}

.progress-ring-text {
  fill: var(--fg);
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 600;
  transform: rotate(90deg);
  transform-origin: center;
}

.detail-progress-info {
  flex: 1;
}

.detail-size {
  font-size: 24px;
  font-weight: 600;
  margin-bottom: 4px;
}

.detail-meta {
  font-size: 13px;
  color: var(--fg-secondary);
}

.detail-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.stat-item {
  padding: 12px;
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
}

.stat-label {
  font-size: 11px;
  color: var(--fg-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.stat-value {
  font-family: var(--font-mono);
  font-size: 16px;
  font-weight: 600;
}

.detail-section {
  margin-bottom: 24px;
}

.detail-section-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--fg-muted);
  margin-bottom: 12px;
}

.file-list {
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  overflow: hidden;
}

.file-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}

.file-row:last-child {
  border-bottom: none;
}

.file-name {
  flex: 1;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-size {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg-tertiary);
}

.timeline {
  background: var(--surface);
  border-radius: var(--radius-md);
  border: 1px solid var(--border);
  padding: 16px;
}

.timeline-item {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-left: 2px solid var(--border);
  margin-left: 8px;
  padding-left: 16px;
  position: relative;
}

.timeline-item::before {
  content: '';
  position: absolute;
  left: -5px;
  top: 12px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
}

.timeline-item.downloading::before {
  background: var(--primary);
}
.timeline-item.completed::before {
  background: var(--accent);
}
.timeline-item.paused::before {
  background: var(--warning);
}
.timeline-item.failed::before {
  background: var(--error);
}

.timeline-item:first-child {
  border-left-color: transparent;
}

.timeline-time {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--fg-muted);
  min-width: 40px;
}

.timeline-text {
  font-size: 13px;
  color: var(--fg-secondary);
}

.detail-actions {
  display: flex;
  gap: 8px;
  padding: 16px 24px;
  border-top: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 0 0 var(--radius-lg) var(--radius-lg);
}
</style>
