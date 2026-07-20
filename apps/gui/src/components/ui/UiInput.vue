<script setup lang="ts">
/**
 * UiInput — base text input component
 *
 * Uses design tokens from tokens.css.
 * Has proper ARIA attributes and focus-visible styles.
 *
 * @example
 * <UiInput v-model="url" placeholder="Paste magnet URL…" />
 * <UiInput v-model="query" type="search" :error="errorMessage" />
 */

import { computed } from 'vue'

interface Props {
  /** Input model value (use v-model) */
  modelValue?: string
  /** Input type */
  type?: string
  /** Placeholder text */
  placeholder?: string
  /** Disable the input */
  disabled?: boolean
  /** Show error state with message */
  error?: string
  /** Optional accessible label */
  label?: string
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  type: 'text',
  placeholder: '',
  disabled: false,
  error: '',
  label: '',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputValue = computed({
  get: () => props.modelValue,
  set: (val: string) => emit('update:modelValue', val),
})

const inputId = computed(() => `ui-input-${Math.random().toString(36).slice(2, 9)}`)
</script>

<template>
  <div class="ui-input-wrapper">
    <label v-if="props.label" :for="inputId" class="ui-input-label">{{ props.label }}</label>
    <input
      :id="inputId"
      v-model="inputValue"
      :type="props.type"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      :aria-invalid="!!props.error"
      :aria-describedby="props.error ? `${inputId}-error` : undefined"
      class="ui-input"
      :class="{ 'ui-input--error': props.error, 'ui-input--disabled': props.disabled }"
    />
    <p v-if="props.error" :id="`${inputId}-error`" class="ui-input-error" role="alert">
      {{ props.error }}
    </p>
  </div>
</template>

<style scoped>
.ui-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
}

.ui-input-label {
  font-size: var(--text-caption);
  font-weight: 500;
  color: var(--fg-secondary);
}

.ui-input {
  width: 100%;
  height: 36px;
  padding: 0 var(--space-3);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  transition:
    border-color var(--transition-fast) var(--ease-out),
    box-shadow var(--transition-fast) var(--ease-out);
}

.ui-input::placeholder {
  color: var(--fg-tertiary);
}

.ui-input:hover:not(:disabled) {
  border-color: var(--border-hover);
}

.ui-input:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.ui-input:focus {
  outline: none;
  border-color: var(--primary);
}

.ui-input--error {
  border-color: var(--error);
}

.ui-input--error:focus {
  border-color: var(--error);
}

.ui-input--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ui-input-error {
  font-size: var(--text-caption);
  color: var(--error);
}
</style>
