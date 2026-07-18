<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@/stores/tasks'

interface Props {
  task: Task | null
}
const props = defineProps<Props>()

const ringColor = computed(() => {
  if (!props.task) return 'var(--border)'
  switch (props.task.status) {
    case 'downloading':
      return 'var(--primary)'
    case 'paused':
      return 'var(--warning)'
    case 'completed':
      return 'var(--accent)'
    case 'failed':
      return 'var(--error)'
    default:
      return 'var(--border)'
  }
})

const RING_CIRC = 2 * Math.PI * 48
const ringDashoffset = computed(() => {
  const pct = Math.max(0, Math.min(100, props.task?.progress ?? 0))
  return RING_CIRC * (1 - pct / 100)
})

const ringCaption = computed(() => {
  if (!props.task) return ''
  switch (props.task.status) {
    case 'downloading':
      return `Downloading · ${props.task.eta || '—'} remaining`
    case 'paused':
      return 'Paused'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed. Retry to resume.'
    default:
      return 'Queued'
  }
})
</script>

<template>
  <section class="detail-ring" aria-label="Download progress">
    <svg
      class="ring-svg"
      width="120"
      height="120"
      viewBox="0 0 120 120"
      role="progressbar"
      :aria-valuenow="props.task?.progress ?? 0"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuetext="`${props.task?.progress ?? 0}% complete`"
    >
      <circle cx="60" cy="60" r="48" fill="none" stroke="var(--border)" stroke-width="4" />
      <g transform="rotate(-90 60 60)">
        <circle
          cx="60"
          cy="60"
          r="48"
          fill="none"
          :stroke="ringColor"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="RING_CIRC"
          :stroke-dashoffset="ringDashoffset"
        />
      </g>
      <text x="60" y="60" text-anchor="middle" dominant-baseline="central" class="ring-text">
        {{ props.task?.progress ?? 0 }}%
      </text>
    </svg>
    <p class="ring-caption">{{ ringCaption }}</p>
  </section>
</template>

<style scoped>
.detail-ring {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-6) var(--space-5) var(--space-5);
}

.ring-svg {
  display: block;
}

.ring-text {
  font-family: var(--font-ui);
  font-size: 26px;
  font-weight: 600;
  fill: var(--fg);
}

.ring-caption {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-body-sm);
  color: var(--fg-tertiary);
  text-align: center;
}
</style>
