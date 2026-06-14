<script setup lang="ts">
/**
 * UiTag — status pill / tag component
 *
 * Variants: info | success | warning | error
 * Sizes: sm | md
 *
 * Uses design tokens from tokens.css.
 *
 * @example
 * <UiTag variant="success" size="sm">Completed</UiTag>
 * <UiTag variant="warning">Paused</UiTag>
 */

interface Props {
  /** Visual variant */
  variant?: 'info' | 'success' | 'warning' | 'error'
  /** Size preset */
  size?: 'sm' | 'md'
}

withDefaults(defineProps<Props>(), {
  variant: 'info',
  size: 'sm',
})
</script>

<template>
  <span class="ui-tag" :class="[`ui-tag--${$props.variant}`, `ui-tag--${$props.size}`]">
    <slot />
  </span>
</template>

<style scoped>
.ui-tag {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-family: var(--font-ui);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-radius: var(--radius-full);
  white-space: nowrap;
  line-height: 1.4;
}

/* --- Sizes --- */

.ui-tag--sm {
  padding: 2px var(--space-2);
  font-size: var(--text-caption);
}

.ui-tag--md {
  padding: var(--space-1) var(--space-3);
  font-size: var(--text-body-sm);
}

/* --- Variants --- */

.ui-tag--info {
  background: var(--primary-muted);
  color: var(--primary);
}

.ui-tag--success {
  background: var(--accent-muted);
  color: var(--accent);
}

.ui-tag--warning {
  background: var(--warning-muted);
  color: var(--warning);
}

.ui-tag--error {
  background: var(--error-muted);
  color: var(--error);
}
</style>
