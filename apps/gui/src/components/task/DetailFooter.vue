<script setup lang="ts">
import { computed } from 'vue'
import type { TaskStatus } from '@/stores/tasks'

interface Props {
  status: TaskStatus
}
const props = defineProps<Props>()

const emit = defineEmits<{
  pause: []
  resume: []
  retry: []
  priority: []
}>()

const isPaused = computed(() => props.status === 'paused')
</script>

<template>
  <footer class="detail-footer">
    <button v-if="isPaused" class="footer-btn footer-btn--primary" type="button" @click="emit('resume')">Resume</button>
    <button
      v-else-if="props.status === 'downloading'"
      class="footer-btn footer-btn--primary"
      type="button"
      @click="emit('pause')"
    >
      Pause
    </button>
    <button v-if="props.status === 'failed'" class="footer-btn footer-btn--ghost" type="button" @click="emit('retry')">
      Retry
    </button>
    <button
      v-if="props.status === 'downloading' || props.status === 'pending'"
      class="footer-btn footer-btn--ghost"
      type="button"
      @click="emit('priority')"
    >
      Priority
    </button>
  </footer>
</template>

<style scoped>
.detail-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.footer-btn {
  flex: 1 1 0;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-ui);
  font-size: var(--text-body-sm);
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition:
    background var(--transition-fast) var(--ease-out),
    border-color var(--transition-fast) var(--ease-out),
    color var(--transition-fast) var(--ease-out);
}

.footer-btn:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.footer-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.footer-btn--primary {
  background: var(--primary);
  color: #fff;
}

.footer-btn--primary:not(:disabled):hover {
  background: var(--primary-hover);
}

.footer-btn--ghost {
  background: transparent;
  color: var(--fg-secondary);
  border-color: var(--border);
}

.footer-btn--ghost:not(:disabled):hover {
  background: var(--surface-hover);
  color: var(--fg);
  border-color: var(--border-hover);
}
</style>
