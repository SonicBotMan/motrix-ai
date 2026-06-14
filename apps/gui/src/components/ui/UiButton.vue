<script setup lang="ts">
/**
 * UiButton — base button component
 *
 * Variants: primary | secondary | ghost | danger
 * Sizes: sm | md | lg
 *
 * Uses design tokens from tokens.css.
 * Has proper ARIA attributes and focus-visible styles.
 *
 * @example
 * <UiButton variant="primary" size="md" @click="handleClick">Download</UiButton>
 * <UiButton variant="ghost" :loading="isLoading">Fetching…</UiButton>
 */

interface Props {
  /** Visual style of the button */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  /** Size preset */
  size?: 'sm' | 'md' | 'lg'
  /** Disable the button */
  disabled?: boolean
  /** Show a spinner and disable interaction */
  loading?: boolean
  /** Optional aria-label for icon-only buttons */
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'secondary',
  size: 'md',
  disabled: false,
  loading: false,
  label: undefined,
})

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<template>
  <button
    class="btn"
    :class="[`btn--${props.variant}`, `btn--${props.size}`, { 'btn--loading': props.loading }]"
    :disabled="props.disabled || props.loading"
    :aria-label="props.label"
    :aria-busy="props.loading"
    @click="$emit('click', $event)"
  >
    <span v-if="props.loading" class="btn-spinner" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-family: var(--font-ui);
  font-weight: 500;
  border: 1px solid transparent;
  border-radius: var(--radius-xs);
  cursor: pointer;
  transition:
    background var(--transition-fast) var(--ease-out),
    border-color var(--transition-fast) var(--ease-out),
    color var(--transition-fast) var(--ease-out),
    box-shadow var(--transition-fast) var(--ease-out);
  white-space: nowrap;
  user-select: none;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* --- Variants --- */

.btn--primary {
  background: var(--primary);
  color: #fff;
}

.btn--primary:not(:disabled):hover {
  background: var(--primary-hover);
}

.btn--secondary {
  background: var(--surface);
  color: var(--fg);
  border-color: var(--border);
}

.btn--secondary:not(:disabled):hover {
  background: var(--surface-hover);
  border-color: var(--border-hover);
}

.btn--ghost {
  background: transparent;
  color: var(--fg-secondary);
}

.btn--ghost:not(:disabled):hover {
  background: var(--surface-hover);
  color: var(--fg);
}

.btn--danger {
  background: transparent;
  color: var(--error);
  border-color: var(--error);
}

.btn--danger:not(:disabled):hover {
  background: var(--error-muted);
}

/* --- Sizes --- */

.btn--sm {
  height: 28px;
  padding: 0 var(--space-2);
  font-size: var(--text-caption);
}

.btn--md {
  height: 36px;
  padding: 0 var(--space-3);
  font-size: var(--text-body);
}

.btn--lg {
  height: 44px;
  padding: 0 var(--space-4);
  font-size: var(--text-body-lg);
}

/* --- Loading spinner --- */

.btn-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: var(--radius-full);
  animation: spin 700ms linear infinite;
}

.btn--loading {
  pointer-events: none;
}
</style>
