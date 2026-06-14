<script setup lang="ts">
/**
 * UiModal — modal dialog component
 *
 * Uses modalScaleIn / modalScaleOut keyframes from animations.css.
 * Has proper ARIA dialog semantics: role="dialog", aria-modal="true".
 *
 * @example
 * <UiModal :show="isOpen" title="Task Details" @close="isOpen = false">
 *   <p>Modal content here</p>
 * </UiModal>
 */

import { watch, onUnmounted, nextTick, ref } from 'vue'

interface Props {
  /** Control visibility */
  show?: boolean
  /** Dialog title (rendered in header) */
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  title: '',
})

const emit = defineEmits<{
  close: []
}>()

const panelRef = ref<HTMLElement | null>(null)
const isClosing = ref(false)

/** Handle Escape key — closes modal per a11y keyboard contract */
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.show) {
    emit('close')
  }
}

/** Move focus to the panel when it opens */
watch(
  () => props.show,
  async (visible) => {
    if (visible) {
      document.addEventListener('keydown', handleKeydown)
      await nextTick()
      panelRef.value?.focus()
    } else {
      document.removeEventListener('keydown', handleKeydown)
    }
  },
)

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

/** Animate close then emit */
function requestClose() {
  isClosing.value = true
  setTimeout(() => {
    isClosing.value = false
    emit('close')
  }, 220)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="ui-modal">
      <div
        v-if="props.show"
        class="ui-modal-backdrop"
        @click.self="requestClose"
      >
        <div
          ref="panelRef"
          class="ui-modal-panel"
          :class="{ 'ui-modal-panel--closing': isClosing }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="props.title ? 'ui-modal-title' : undefined"
          tabindex="-1"
        >
          <header v-if="props.title || $slots.header" class="ui-modal-header">
            <slot name="header">
              <h2 id="ui-modal-title" class="ui-modal-title">{{ props.title }}</h2>
            </slot>
            <button
              class="ui-modal-close"
              aria-label="Close dialog"
              title="Close"
              @click="requestClose"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>
          <div class="ui-modal-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="ui-modal-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ui-modal-backdrop {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: var(--z-modal-backdrop);
  animation: fadeSlideUp 250ms var(--ease-out);
}

.ui-modal-panel {
  width: 90%;
  max-width: 640px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-xl);
  z-index: var(--z-modal-panel);
  outline: none;
  animation: modalScaleIn 400ms var(--ease-default);
}

.ui-modal-panel--closing {
  animation: modalScaleOut 220ms var(--ease-default) forwards;
}

.ui-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  border-bottom: 1px solid var(--border);
}

.ui-modal-title {
  margin: 0;
  font-family: var(--font-ui);
  font-size: var(--text-h1);
  font-weight: 600;
  line-height: 1.3;
  color: var(--fg);
}

.ui-modal-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  color: var(--fg-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast) var(--ease-out);
}

.ui-modal-close:hover {
  background: var(--surface-hover);
  color: var(--fg);
}

.ui-modal-close:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.ui-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-5);
  color: var(--fg-secondary);
  font-size: var(--text-body);
  line-height: 1.5;
}

.ui-modal-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-5);
  border-top: 1px solid var(--border);
}

/* --- Vue Transition (fallback for v-show style toggling) --- */

.ui-modal-enter-active,
.ui-modal-leave-active {
  transition: opacity var(--transition-base) var(--ease-out);
}

.ui-modal-enter-from,
.ui-modal-leave-to {
  opacity: 0;
}
</style>
