<script setup lang="ts">
import { computed } from 'vue'
import { NModal, NButton, NIcon, NTag, NSpin, NEmpty } from 'naive-ui'
import { DownloadOutline, CloseOutline, DocumentTextOutline } from '@vicons/ionicons5'
import type { SearchResult } from '@/composables/useSearch'
import { formatBytes } from '@/composables/useSearch'
import type { SubtitleResult } from '@/composables/useSubtitle'

const props = defineProps<{
  visible: boolean
  results: SearchResult[]
  searching: boolean
  query: string
  subtitleResults?: SubtitleResult[]
  subtitleSearching?: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', result: SearchResult): void
  (e: 'select-subtitle', subtitle: SubtitleResult): void
}>()

const resultCount = computed(() => props.results.length)

const qualityColor = (q?: string) => {
  switch (q) {
    case '4K': return '#A855F7'
    case '1080p': return '#3B82F6'
    case '720p': return '#10B981'
    default: return '#6B7280'
  }
}

const qualityLabel = (q?: string) => {
  if (!q || q === 'other') return ''
  return q.toUpperCase()
}

const sourceColor = (source: string) => {
  switch (source) {
    case 'btdig': return '#F59E0B'
    case 'mikan': return '#EC4899'
    default: return '#6B7280'
  }
}

const handleRowClick = (result: SearchResult) => {
  emit('select', result)
}

const handleDownload = (result: SearchResult) => {
  emit('select', result)
}

const formatDownloads = (count: number): string => {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(0)}K`
  return count.toString()
}
</script>

<template>
  <NModal
    :show="visible"
    :mask-closable="true"
    :close-on-esc="true"
    transform-origin="center"
    @update:show="(val: boolean) => !val && emit('close')"
  >
    <div class="search-modal">
      <!-- Header -->
      <div class="search-header">
        <div class="search-header-left">
          <h2 class="search-title">搜索结果: {{ query }}</h2>
          <span v-if="!searching && resultCount > 0" class="search-count">{{ resultCount }} 个资源</span>
        </div>
        <NButton quaternary circle size="small" @click="emit('close')">
          <template #icon><NIcon><CloseOutline /></NIcon></template>
        </NButton>
      </div>

      <!-- Loading State -->
      <div v-if="searching" class="search-loading">
        <NSpin size="medium" />
        <span class="search-loading-text">搜索中...</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="resultCount === 0" class="search-empty">
        <NEmpty description="未找到资源" />
      </div>

      <!-- Results List -->
      <div v-else class="search-results">
        <div
          v-for="result in results"
          :key="result.magnet"
          class="search-result-row"
          @click="handleRowClick(result)"
        >
          <!-- Left: Title + meta -->
          <div class="result-info">
            <div class="result-title-row">
              <span class="result-title" :title="result.title">{{ result.title }}</span>
            </div>
            <div class="result-meta">
              <NTag
                v-if="qualityLabel(result.quality)"
                size="tiny"
                round
                :bordered="false"
                :color="{ color: qualityColor(result.quality) + '20', textColor: qualityColor(result.quality) }"
              >
                {{ qualityLabel(result.quality) }}
              </NTag>
              <span class="result-size">{{ formatBytes(result.size) }}</span>
              <span v-if="result.seeders > 0" class="result-seeders">
                <span class="seeders-label">↑</span>{{ result.seeders }}
              </span>
              <span v-if="result.leechers > 0" class="result-leechers">
                <span class="leechers-label">↓</span>{{ result.leechers }}
              </span>
              <NTag
                size="tiny"
                round
                :bordered="false"
                :color="{ color: sourceColor(result.source) + '20', textColor: sourceColor(result.source) }"
              >
                {{ result.source }}
              </NTag>
            </div>
          </div>

          <!-- Right: Download button -->
          <div class="result-action">
            <NButton type="primary" size="small" @click.stop="handleDownload(result)">
              <template #icon><NIcon><DownloadOutline /></NIcon></template>
              下载
            </NButton>
          </div>
        </div>
      </div>

      <!-- Subtitle Results Section -->
      <div v-if="subtitleResults && subtitleResults.length > 0" class="subtitle-section">
        <div class="subtitle-header">
          <NIcon :size="14"><DocumentTextOutline /></NIcon>
          <span>字幕 ({{ subtitleResults.length }})</span>
          <NTag v-if="subtitleSearching" size="tiny" round>搜索中...</NTag>
        </div>
        <div class="subtitle-list">
          <div
            v-for="sub in subtitleResults"
            :key="sub.id"
            class="subtitle-row"
            @click="emit('select-subtitle', sub)"
          >
            <div class="subtitle-info">
              <span class="subtitle-lang">{{ sub.language }}</span>
              <span class="subtitle-name">{{ sub.fileName }}</span>
            </div>
            <div class="subtitle-meta">
              <span class="subtitle-rating">⭐ {{ sub.rating }}</span>
              <span class="subtitle-downloads">{{ formatDownloads(sub.downloadCount) }}</span>
              <NButton size="tiny" quaternary @click.stop="emit('select-subtitle', sub)">
                <template #icon><NIcon><DownloadOutline /></NIcon></template>
              </NButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Subtitle Loading -->
      <div v-else-if="subtitleSearching" class="subtitle-loading">
        <NSpin size="small" />
        <span>搜索字幕中...</span>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.search-modal {
  width: 100%;
  max-width: 680px;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  overflow: hidden;
}

/* Header */
.search-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.search-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.search-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-count {
  font-size: 12px;
  color: var(--fg-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Loading */
.search-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 20px;
  gap: 12px;
}

.search-loading-text {
  font-size: 13px;
  color: var(--fg-muted);
}

/* Empty */
.search-empty {
  padding: 48px 20px;
}

/* Results list */
.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.search-result-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  cursor: pointer;
  transition: background 0.15s ease;
  border-bottom: 1px solid var(--border);
}

.search-result-row:last-child {
  border-bottom: none;
}

.search-result-row:hover {
  background: var(--surface);
}

/* Result info */
.result-info {
  flex: 1;
  min-width: 0;
}

.result-title-row {
  margin-bottom: 6px;
}

.result-title {
  font-size: 13px;
  font-weight: 500;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.result-size {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg-secondary);
}

.result-seeders {
  font-size: 12px;
  font-family: var(--font-mono);
  color: #10B981;
  font-weight: 500;
}

.seeders-label {
  margin-right: 1px;
}

.result-leechers {
  font-size: 12px;
  font-family: var(--font-mono);
  color: #EF4444;
  font-weight: 500;
}

.leechers-label {
  margin-right: 1px;
}

/* Action */
.result-action {
  flex-shrink: 0;
}

/* Subtitle Section */
.subtitle-section {
  border-top: 1px solid var(--border);
  padding: 12px 0;
}

.subtitle-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 20px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-secondary);
}

.subtitle-list {
  display: flex;
  flex-direction: column;
}

.subtitle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  cursor: pointer;
  transition: background 0.15s ease;
  border-bottom: 1px solid var(--border);
}

.subtitle-row:last-child {
  border-bottom: none;
}

.subtitle-row:hover {
  background: var(--surface);
}

.subtitle-info {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.subtitle-lang {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary);
  background: var(--primary-muted);
  padding: 2px 8px;
  border-radius: 4px;
  white-space: nowrap;
}

.subtitle-name {
  font-size: 12px;
  color: var(--fg-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.subtitle-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.subtitle-rating {
  font-size: 12px;
  color: var(--fg-muted);
}

.subtitle-downloads {
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--fg-muted);
}

.subtitle-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px;
  font-size: 13px;
  color: var(--fg-muted);
}
</style>
