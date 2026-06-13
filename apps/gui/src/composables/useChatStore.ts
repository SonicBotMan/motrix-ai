// src/composables/useChatStore.ts
// Pinia store backing the ChatPanel — holds the conversation history.
//
// The MainView previously kept a single `chatInput` ref and surfaced parse
// results only via transient toasts. This store gives us a real, reactive
// message log that any component can read or append to.

import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { DownloadIntent } from '@/composables/useOpenCode'

/** A single chat turn. */
export interface ChatMessage {
  /** Stable unique id (also used as v-for key). */
  id: string
  /** Who produced the message. */
  role: 'user' | 'assistant'
  /** Human-readable message body. */
  content: string
  /** Epoch ms when the message was created. */
  timestamp: number
  /** Parsed intent attached to assistant messages that summarise a parse. */
  intent?: DownloadIntent | null
  /** True when this assistant message represents an error. */
  error?: boolean
}

/** Generate a reasonably-unique message id without a dependency. */
function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Chat conversation store.
 *
 * Holds the ordered message list and exposes simple mutators. Components
 * (ChatPanel, future history views) consume it directly; no props drilling.
 */
export const useChatStore = defineStore('chat', () => {
  /** Ordered conversation history, oldest first. */
  const messages = ref<ChatMessage[]>([])

  /** Append a user-authored message and return it. */
  function addUserMessage(content: string): ChatMessage {
    const msg: ChatMessage = {
      id: newId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    }
    messages.value.push(msg)
    return msg
  }

  /** Append an assistant message, optionally with a parsed intent. */
  function addAssistantMessage(
    content: string,
    intent?: DownloadIntent | null,
    error = false,
  ): ChatMessage {
    const msg: ChatMessage = {
      id: newId(),
      role: 'assistant',
      content,
      timestamp: Date.now(),
      intent: intent ?? null,
      error,
    }
    messages.value.push(msg)
    return msg
  }

  /** Remove every message — used by a "clear chat" action. */
  function clear(): void {
    messages.value = []
  }

  return {
    messages,
    addUserMessage,
    addAssistantMessage,
    clear,
  }
})
