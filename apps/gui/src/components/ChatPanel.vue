<script setup lang="ts">
// src/components/ChatPanel.vue
// Reusable chat surface extracted from MainView.vue.
//
// Replaces MainView's inline chat: a scrollable conversation log (user +
// assistant turns, with parsed intent details for assistant messages) and a
// bottom input bar. Parsing uses useOpenCode; the history lives in useChatStore
// so it survives independent of where the panel is mounted.

import { ref, computed, nextTick, watch } from 'vue'
import { NInput, NButton, NIcon, NScrollbar, NSpin, NTag, useMessage } from 'naive-ui'
import { SendOutline, ChatbubbleEllipsesOutline } from '@vicons/ionicons5'
import { useOpenCode, type DownloadIntent } from '@/composables/useOpenCode'
import { useChatStore, type ChatMessage } from '@/composables/useChatStore'
import { t } from '@/composables/useSettings'

/** Payload emitted when a message is sent. */
export interface ChatSubmitPayload {
  /** The original user text. */
  input: string
  /** The parsed intent, or null when parsing failed. */
  intent: DownloadIntent | null
}

const emit = defineEmits<{
  /** Fired once a user message has been parsed and an assistant reply added. */
  (e: 'submit', payload: ChatSubmitPayload): void
}>()

const message = useMessage()
const chatStore = useChatStore()
const { parsing, parseIntent } = useOpenCode()

/** Two-way bound textarea value. */
const input = ref('')
/** Ref onto the scrollbar so we can follow new messages. */
const scrollbarRef = ref<InstanceType<typeof NScrollbar> | null>(null)

/** Convenience aliases onto the store. */
const messages = computed<ChatMessage[]>(() => chatStore.messages)

// ---- Helpers ----

/** Human-readable `HH:mm` for a timestamp. */
function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

/** Short label + colour for the intent resource type. */
const resourceTypeMeta: Record<string, { label: string, color: string }> = {
  movie: { label: 'Movie', color: '#3B82F6' },
  tv: { label: 'TV', color: '#A855F7' },
  anime: { label: 'Anime', color: '#EC4899' },
  music: { label: 'Music', color: '#10B981' },
  software: { label: 'Software', color: '#F59E0B' },
  other: { label: 'Other', color: '#6B7280' },
}

/** Colour per quality tier (mirrors SearchResultsModal). */
function qualityColor(q?: string): string {
  switch (q) {
    case '4K': return '#A855F7'
    case '1080p': return '#3B82F6'
    case '720p': return '#10B981'
    default: return '#6B7280'
  }
}

/** Scroll the log to the bottom whenever a new message lands. */
watch(
  () => messages.value.length,
  async () => {
    await nextTick()
    scrollbarRef.value?.scrollTo({ top: 999999, behavior: 'smooth' })
  },
)

// ---- Submit flow (extracted from MainView.handleChatSubmit) ----

/** Handle a send: push user msg, parse intent, push assistant reply, emit. */
async function handleSend(): Promise<void> {
  const text = input.value.trim()
  if (!text || parsing.value) return

  input.value = ''
  chatStore.addUserMessage(text)

  let intent: DownloadIntent | null = null
  try {
    intent = await parseIntent(text)
    chatStore.addAssistantMessage(
      `识别: ${intent.title} (${intent.quality || '自动'})${intent.need_subtitle ? ' + 字幕' : ''}`,
      intent,
    )
  } catch (e) {
    console.error('ChatPanel parse failed:', e)
    message.error(t('msg.searchFailed'))
    chatStore.addAssistantMessage(t('msg.searchFailed'), null, true)
  }

  emit('submit', { input: text, intent })
}

/** Enter sends; Shift+Enter inserts a newline. */
function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    void handleSend()
  }
}
</script>

<template>
  <div class="chat-panel">
    <!-- Message log -->
    <NScrollbar ref="scrollbarRef" class="chat-log">
      <!-- Empty state -->
      <div v-if="messages.length === 0" class="chat-empty">
        <NIcon :size="32" class="chat-empty-icon"><ChatbubbleEllipsesOutline /></NIcon>
        <p class="chat-empty-text">{{ t('search.chatPlaceholder') }}</p>
      </div>

      <!-- Messages -->
      <div v-for="msg in messages" :key="msg.id" class="chat-row" :class="msg.role">
        <div class="chat-bubble" :class="{ 'chat-bubble-error': msg.error }">
          <!-- Header: role + time -->
          <div class="chat-bubble-head">
            <span class="chat-role">{{ msg.role === 'user' ? 'You' : 'Motrix AI' }}</span>
            <span class="chat-time">{{ formatTime(msg.timestamp) }}</span>
          </div>

          <!-- Body -->
          <p class="chat-content">{{ msg.content }}</p>

          <!-- Parsed intent details (assistant turns only) -->
          <div v-if="msg.role === 'assistant' && msg.intent" class="chat-intent">
            <div class="chat-intent-row">
              <span class="chat-intent-label">Title</span>
              <span class="chat-intent-value">{{ msg.intent.title }}</span>
            </div>
            <div class="chat-intent-tags">
              <NTag
                v-if="msg.intent.quality && msg.intent.quality !== 'other'"
                size="tiny"
                round
                :bordered="false"
                :color="{ color: qualityColor(msg.intent.quality) + '20', textColor: qualityColor(msg.intent.quality) }"
              >
                {{ msg.intent.quality.toUpperCase() }}
              </NTag>
              <NTag
                size="tiny"
                round
                :bordered="false"
                :color="{ color: resourceTypeMeta[msg.intent.resource_type].color + '20', textColor: resourceTypeMeta[msg.intent.resource_type].color }"
              >
                {{ resourceTypeMeta[msg.intent.resource_type].label }}
              </NTag>
              <NTag v-if="msg.intent.need_subtitle" size="tiny" round :bordered="false" type="warning">
                字幕
              </NTag>
            </div>
          </div>
        </div>
      </div>

      <!-- Typing / parsing indicator -->
      <div v-if="parsing" class="chat-row assistant">
        <div class="chat-bubble chat-bubble-typing">
          <NSpin size="small" />
          <span class="chat-typing-text">解析中…</span>
        </div>
      </div>
    </NScrollbar>

    <!-- Input bar -->
    <div class="chat-input-bar">
      <NInput
        v-model:value="input"
        type="textarea"
        :autosize="{ minRows: 1, maxRows: 4 }"
        :placeholder="t('search.chatPlaceholder')"
        :disabled="parsing"
        :bordered="false"
        class="chat-input"
        @keydown="onKeydown"
      />
      <NButton
        type="primary"
        circle
        :loading="parsing"
        :disabled="!input.trim() || parsing"
        class="chat-send"
        @click="handleSend"
      >
        <template #icon><NIcon><SendOutline /></NIcon></template>
      </NButton>
    </div>
  </div>
</template>

<style scoped>
.chat-panel {
  display: flex
  flex-direction: column
  height: 100%
  min-height: 0
  background: var(--bg)
}

/* ---- Message log ---- */
.chat-log {
  flex: 1
  min-height: 0
  padding: 12px
}

.chat-empty {
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  height: 100%
  gap: 12px
  color: var(--fg-muted)
}
.chat-empty-icon { opacity: 0.4 }
.chat-empty-text {
  margin: 0
  font-size: 13px
  text-align: center
}

/* ---- Rows / bubbles ---- */
.chat-row {
  display: flex
  margin-bottom: 10px
}
.chat-row.user { justify-content: flex-end }
.chat-row.assistant { justify-content: flex-start }

.chat-bubble {
  max-width: 80%
  padding: 10px 12px
  border-radius: 14px
  background: var(--surface-elevated)
  border: 1px solid var(--border)
}
.chat-row.user .chat-bubble {
  background: var(--primary-muted)
  border-color: transparent
  border-bottom-right-radius: 4px
}
.chat-row.assistant .chat-bubble {
  border-bottom-left-radius: 4px
}
.chat-bubble-error {
  border-color: var(--danger) !important
  background: rgba(239, 68, 68, 0.08) !important
}

.chat-bubble-head {
  display: flex
  align-items: center
  gap: 8px
  margin-bottom: 4px
}
.chat-role {
  font-size: 11px
  font-weight: 600
  color: var(--fg-secondary)
  text-transform: uppercase
  letter-spacing: 0.04em
}
.chat-time {
  font-size: 10px
  color: var(--fg-muted)
}
.chat-content {
  margin: 0
  font-size: 13px
  line-height: 1.5
  color: var(--fg)
  word-break: break-word
  white-space: pre-wrap
}

/* ---- Intent details ---- */
.chat-intent {
  margin-top: 8px
  padding-top: 8px
  border-top: 1px solid var(--border)
  display: flex
  flex-direction: column
  gap: 6px
}
.chat-intent-row {
  display: flex
  align-items: baseline
  gap: 8px
  font-size: 12px
}
.chat-intent-label {
  color: var(--fg-muted)
  min-width: 44px
}
.chat-intent-value {
  color: var(--fg)
  font-weight: 500
}
.chat-intent-tags {
  display: flex
  flex-wrap: wrap
  gap: 4px
}

/* ---- Typing indicator ---- */
.chat-bubble-typing {
  display: flex
  align-items: center
  gap: 8px
}
.chat-typing-text {
  font-size: 12px
  color: var(--fg-secondary)
}

/* ---- Input bar ---- */
.chat-input-bar {
  display: flex
  align-items: flex-end
  gap: 8px
  padding: 10px 12px
  border-top: 1px solid var(--border)
  background: var(--bg-elevated)
}
.chat-input {
  flex: 1
  background: var(--surface)
  border-radius: 12px
}
.chat-input :deep(textarea) {
  border-radius: 12px
  padding: 8px 12px
  font-size: 13px
  line-height: 1.5
}
.chat-send { flex-shrink: 0 }
</style>
