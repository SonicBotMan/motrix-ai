<script setup lang="ts">
/**
 * BottomChat — 96px bottom input bar (2 rows × 48px)
 *
 * Row 1: 5 quick-action chips with ⌘1–5 kbd hints
 * Row 2: attach button + text input + send button
 *
 * Emits:
 *   - quickAction  (index: number)  — a chip was clicked
 *   - attach                        — attach button clicked
 *   - send      (message: string)   — user submitted a message
 *
 * Design ref: docs/design/handoff/02-components.md §2
 */

import { ref } from 'vue'

interface Chip {
  label: string
}

const chips: Chip[] = [
  { label: 'Download Ubuntu 24.04 LTS ISO' },
  { label: 'What is downloading?' },
  { label: 'Pause all' },
  { label: 'Show completed' },
  { label: 'Add magnet URL' },
]

const message = ref('')
const sending = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

const emit = defineEmits<{
  quickAction: [index: number]
  attach: []
  send: [message: string]
}>()

function send(): void {
  if (sending.value || !message.value.trim()) return
  const msg = message.value.trim()
  sending.value = true
  emit('send', msg)
  message.value = ''
  // Simulate send completion; parent can reset if needed
  setTimeout(() => {
    sending.value = false
  }, 1100)
}

function focus(): void {
  inputRef.value?.focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="bottom-chat">
    <!-- Row 1: quick-action chips -->
    <div class="chat-chips" role="toolbar">
      <button v-for="(chip, i) in chips" :key="i" type="button" class="chip" @click="emit('quickAction', i)">
        {{ chip.label }}
        <kbd class="chip-kbd">{{ '\u2318' }}{{ i + 1 }}</kbd>
      </button>
    </div>

    <!-- Row 2: input row -->
    <div class="chat-input-row">
      <button
        type="button"
        class="chat-attach"
        title="Attach a file"
        aria-label="Attach a file"
        @click="emit('attach')"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path
            d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"
          />
        </svg>
      </button>

      <input
        ref="inputRef"
        v-model="message"
        type="text"
        class="chat-input"
        placeholder="Magnet, URL, or command..."
        @keydown.enter="send"
      />

      <button
        type="button"
        class="chat-send"
        aria-label="Send message"
        :disabled="sending || !message.trim()"
        @click="send"
      >
        <span v-if="sending" class="send-content">
          <span class="spinner" />
          <span class="send-label">Sending...</span>
        </span>
        <span v-else class="send-arrow">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.bottom-chat {
  height: var(--bottom-chat-height, 96px);
  background: var(--bg);
  border-top: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  z-index: 50;
}

/* --- Row 1: Chips --- */

.chat-chips {
  height: 48px;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 0 var(--space-4, 16px);
  overflow-x: auto;
  scrollbar-width: none;
}

.chat-chips::-webkit-scrollbar {
  display: none;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
  height: 28px;
  padding: 0 var(--space-3, 12px);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
  white-space: nowrap;
  color: var(--fg-secondary);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-full, 9999px);
  cursor: pointer;
  transition:
    color var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    border-color var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    transform var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.chip:hover {
  color: var(--fg);
  border-color: var(--fg);
  background: var(--surface-hover);
}

.chip:active {
  transform: scale(0.97);
}

.chip:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.chip-kbd {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  line-height: 1;
  padding: 2px 4px;
  border-radius: var(--radius-xs, 6px);
  background: var(--bg-elevated);
  color: var(--fg-muted);
  border: 1px solid var(--border);
}

/* --- Row 2: Input --- */

.chat-input-row {
  height: 48px;
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  padding: 0 var(--space-4, 16px);
}

.chat-attach {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
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

.chat-attach:hover {
  color: var(--fg);
  background: var(--surface-hover);
}

.chat-attach:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.chat-input {
  flex: 1;
  height: 32px;
  padding: 0 var(--space-3, 12px);
  font-family: var(--font-ui);
  font-size: 14px;
  color: var(--fg);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs, 6px);
  outline: none;
  transition:
    border-color var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    box-shadow var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.chat-input::placeholder {
  color: var(--fg-muted);
}

.chat-input:focus-within {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-muted);
}

.chat-send {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2, 8px);
  height: 32px;
  min-width: 32px;
  padding: 0 var(--space-3, 12px);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-xs, 6px);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    opacity var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.chat-send:not(:disabled):hover {
  background: var(--primary-hover);
}

.chat-send:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
}

.chat-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-content {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.send-label {
  font-size: 13px;
  white-space: nowrap;
}

/* Send button in "sending" state uses muted bg */
.chat-send .spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--primary);
  border-top-color: #fff;
  border-radius: var(--radius-full, 9999px);
  animation: spin 700ms linear infinite;
}

/* --- Spinner animation --- */

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* --- Reduced motion --- */

@media (prefers-reduced-motion: reduce) {
  .chip,
  .chat-attach,
  .chat-input,
  .chat-send {
    transition-duration: 0.01ms !important;
  }

  .chat-send .spinner {
    animation-duration: 0.01ms !important;
  }
}
</style>
