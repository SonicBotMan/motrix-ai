<script setup lang="ts">
/**
 * ToastStack — floating notification stack above the bottom chat
 *
 * - Max 4 visible toasts (excess pruned by parent)
 * - 3 types: info (primary/blue), success (accent/green), error (red)
 * - Auto-dismiss handled by parent (2s timer after "done")
 * - column-reverse: newest on top, oldest at bottom (closest to input)
 * - Container is pointer-events: none; individual toasts are auto
 *
 * Props:
 *   - toasts: Toast[]
 *
 * Emits:
 *   - dismiss (id: string) — user clicked ✕ on a toast
 *
 * Design ref: docs/design/handoff/02-components.md §5
 */

import { NIcon } from 'naive-ui'
import { InformationCircleOutline, CheckmarkCircleOutline, AlertCircleOutline, CloseOutline } from '@vicons/ionicons5'

export type ToastType = 'info' | 'success' | 'error'

export interface Toast {
  id: string
  type: ToastType
  text: string
  createdAt: number
  /** When true, toast is in its exit phase (fades out) */
  exiting?: boolean
}

defineProps<{
  toasts: Toast[]
}>()

const emit = defineEmits<{
  dismiss: [id: string]
}>()

/** Map toast type → CSS class for styling */
function typeClass(type: ToastType): string {
  return type
}

/** Type → icon component */
const icons: Record<ToastType, typeof InformationCircleOutline> = {
  info: InformationCircleOutline,
  success: CheckmarkCircleOutline,
  error: AlertCircleOutline,
}
</script>

<template>
  <div class="toast-stack" aria-live="polite" aria-atomic="false">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="chat-toast"
      :class="[typeClass(toast.type), { exiting: toast.exiting }]"
      role="status"
    >
      <!-- Colored left accent strip -->
      <div class="toast-accent" />

      <!-- Type icon avatar -->
      <div class="toast-avatar">
        <NIcon :component="icons[toast.type]" :size="16" aria-hidden="true" />
      </div>

      <!-- Text body -->
      <div class="toast-body">
        {{ toast.text }}
      </div>

      <!-- Close button -->
      <button
        type="button"
        class="toast-close"
        title="Dismiss"
        aria-label="Dismiss notification"
        @click="emit('dismiss', toast.id)"
      >
        <NIcon :component="CloseOutline" :size="14" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.toast-stack {
  position: absolute;
  bottom: 100px;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: var(--space-2, 8px);
  pointer-events: none;
  z-index: 200;
}

/* --- Individual toast --- */

.chat-toast {
  position: relative;
  width: 380px;
  max-width: calc(100vw - 32px);
  display: flex;
  align-items: center;
  gap: var(--space-3, 12px);
  padding: var(--space-3, 12px) var(--space-4, 16px);
  padding-left: calc(var(--space-4, 16px));
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm, 8px);
  box-shadow: var(--shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.3), 0 4px 10px rgba(0, 0, 0, 0.2));
  pointer-events: auto;
  opacity: 1;
  transform: translateY(0);
  transition:
    opacity 300ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    transform 300ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

/* Enter animation: fade-in + translateY(8px → 0) */
.chat-toast {
  animation: toastEnter 220ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

@keyframes toastEnter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Exit animation: fade-out + translateY(0 → -8px) */
.chat-toast.exiting {
  opacity: 0;
  transform: translateY(-8px);
}

/* --- Left accent strip (3px colored border) --- */

.toast-accent {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  border-radius: var(--radius-sm, 8px) 0 0 var(--radius-sm, 8px);
}

.chat-toast.info .toast-accent {
  background: var(--primary);
}

.chat-toast.success .toast-accent {
  background: var(--accent);
}

.chat-toast.error .toast-accent {
  background: var(--error);
}

/* --- Type icon avatar --- */

.toast-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: var(--radius-full, 9999px);
}

.chat-toast.info .toast-avatar {
  background: var(--primary-muted);
  color: var(--primary);
}

.chat-toast.success .toast-avatar {
  background: var(--accent-muted);
  color: var(--accent);
}

.chat-toast.error .toast-avatar {
  background: var(--error-muted);
  color: var(--error);
}

/* --- Toast body text --- */

.toast-body {
  flex: 1;
  font-family: var(--font-ui);
  font-size: 13px;
  line-height: 1.45;
  color: var(--fg);
  word-break: break-word;
  min-width: 0;
}

/* --- Close button --- */

.toast-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--fg-tertiary);
  cursor: pointer;
  border-radius: var(--radius-xs, 6px);
  flex-shrink: 0;
  transition:
    color var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.toast-close:hover {
  color: var(--fg);
  background: var(--surface-hover);
}

.toast-close:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

/* --- Reduced motion --- */

@media (prefers-reduced-motion: reduce) {
  .chat-toast {
    transition-duration: 100ms !important;
    animation-duration: 0.01ms !important;
  }
}
</style>
