<script setup lang="ts">
import { t } from '@/composables/useSettings'

defineProps<{
  total: number
  active: number
  completed: number
  failed: number
  totalSpeed: number
}>()

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
</script>

<template>
  <div class="stats-bar">
    <div class="stat-item">
      <div class="stat-value">{{ total }}</div>
      <div class="stat-label">{{ t('queue.totalTasks') }}</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">{{ active }}</div>
      <div class="stat-label">{{ t('filter.active') }}</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">{{ completed }}</div>
      <div class="stat-label">{{ t('filter.completed') }}</div>
    </div>
    <div class="stat-item">
      <div class="stat-value">{{ failed }}</div>
      <div class="stat-label">{{ t('filter.failed') }}</div>
    </div>
    <div class="stat-item stat-speed">
      <div class="stat-value">{{ formatBytes(totalSpeed) }}</div>
      <div class="stat-label">/s Total</div>
    </div>
  </div>
</template>

<style scoped>
.stats-bar {
  display: flex;
  gap: 32px;
  padding: 16px 24px;
  border-bottom: 1px solid var(--border, #1f1f23);
}

.stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--fg, #fafafa);
  font-variant-numeric: tabular-nums;
}

.stat-label {
  font-size: 11px;
  color: var(--fg-tertiary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.stat-speed .stat-value {
  color: var(--primary, #3b82f6);
}
</style>
