<script setup lang="ts">
/**
 * UiProgress — progress bar component
 *
 * Variants: primary | accent | warning | error
 * Animated shimmer when `animated` is true (for active downloads).
 *
 * Uses design tokens from tokens.css.
 *
 * @example
 * <UiProgress :value="84" variant="primary" />
 * <UiProgress :value="50" variant="accent" animated />
 */

import { computed } from 'vue'

interface Props {
  /** Progress value 0–100 */
  value?: number
  /** Visual variant */
  variant?: 'primary' | 'accent' | 'warning' | 'error'
  /** Show animated shimmer (for active progress) */
  animated?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  value: 0,
  variant: 'primary',
  animated: false,
})

const clampedValue = computed(() => Math.max(0, Math.min(100, props.value)))
const barStyle = computed(() => ({
  width: `${clampedValue.value}%`,
}))
const ariaValueText = computed(() => `${Math.round(clampedValue.value)} percent`)
</script>

<template>
  <div
    class="ui-progress"
    role="progressbar"
    :aria-valuenow="clampedValue"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuetext="ariaValueText"
  >
    <div
      class="ui-progress-fill"
      :class="[`ui-progress-fill--${props.variant}`, { 'ui-progress-fill--animated': props.animated }]"
      :style="barStyle"
    />
  </div>
</template>

<style scoped>
.ui-progress {
  width: 100%;
  height: 6px;
  background: var(--surface-elevated);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.ui-progress-fill {
  height: 100%;
  border-radius: var(--radius-full);
  transition: width var(--transition-base) var(--ease-out);
}

/* --- Variants --- */

.ui-progress-fill--primary {
  background: var(--primary);
}

.ui-progress-fill--accent {
  background: var(--accent);
}

.ui-progress-fill--warning {
  background: var(--warning);
}

.ui-progress-fill--error {
  background: var(--error);
}

/* --- Animated shimmer overlay --- */

.ui-progress-fill--animated {
  position: relative;
  background-size: 200% 100%;
}

.ui-progress-fill--animated::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    transparent 40%,
    rgba(255, 255, 255, 0.15) 50%,
    transparent 60%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}
</style>
