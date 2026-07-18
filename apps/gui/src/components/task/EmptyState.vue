<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  connecting: boolean
  connected: boolean
  activeFilter: string
}>()

defineEmits<{
  retryConnect: []
  trySample: []
}>()

interface EmptyStateCopy {
  heading: string
  sub: string
}

const emptyState = computed<EmptyStateCopy>(() => {
  switch (props.activeFilter) {
    case 'all':
      return {
        heading: 'No downloads yet',
        sub: 'Add a magnet link, HTTP URL, or YouTube link to get started.',
      }
    case 'active':
      return {
        heading: 'Nothing downloading',
        sub: 'All your downloads are paused or completed.',
      }
    case 'completed':
      return {
        heading: 'Nothing completed yet',
        sub: 'Downloads appear here once they finish.',
      }
    case 'paused':
      return {
        heading: 'No paused downloads',
        sub: 'Paused downloads will appear here.',
      }
    case 'failed':
      return {
        heading: 'No failed downloads',
        sub: 'Failed downloads will appear here for retry.',
      }
    default:
      return {
        heading: 'No tasks',
        sub: '',
      }
  }
})
</script>

<template>
  <!-- Connecting state shown while the parent waits for aria2 to come up -->
  <div v-if="connecting" class="state-banner connecting">
    <div class="state-spinner" />
    <span>Connecting to download engine…</span>
  </div>

  <!-- Empty state: either engine offline or no tasks under current filter -->
  <div v-else-if="!connected" class="empty-state">
    <div class="empty-disconnected">
      <p class="empty-heading">Download engine offline</p>
      <p class="empty-sub">aria2 isn't running. Downloads will be queued locally.</p>
      <button class="empty-action" type="button" aria-label="Retry connection" @click="$emit('retryConnect')">
        Retry connection
      </button>
    </div>
  </div>

  <div v-else class="empty-state">
    <h3 class="empty-heading">{{ emptyState.heading }}</h3>
    <p class="empty-sub">{{ emptyState.sub }}</p>
    <button class="empty-action" type="button" aria-label="Try a sample download" @click="$emit('trySample')">
      Try a sample download
    </button>
  </div>
</template>

<style scoped>
.state-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 48px 24px;
  color: var(--fg-secondary, #a0a0a8);
  font-size: 14px;
}

.state-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid var(--border, #1f1f23);
  border-top-color: var(--primary, #3b82f6);
  border-radius: 50%;
  animation: spin 800ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 64px 24px;
  text-align: center;
}

.empty-heading {
  font-size: 18px;
  font-weight: 600;
  color: var(--fg, #fafafa);
  margin-bottom: 8px;
}

.empty-sub {
  font-size: 13px;
  color: var(--fg-tertiary, #6b7280);
  margin-bottom: 20px;
  max-width: 360px;
}

.empty-action {
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 500;
  color: var(--fg, #fafafa);
  background: var(--primary, #3b82f6);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 150ms cubic-bezier(0.16, 1, 0.3, 1);
}

.empty-action:hover {
  opacity: 0.9;
}

@media (prefers-reduced-motion: reduce) {
  .state-spinner {
    animation-duration: 2s;
  }
}
</style>
