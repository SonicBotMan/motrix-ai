// src/stores/chat.ts
// Pinia store for the natural-language chat interface.
// Integrates with useOpenCode to parse user messages into structured
// download intents and maintains a conversation history.

import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useOpenCode, type DownloadIntent } from '@/composables/useOpenCode'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Role of a message in the conversation */
export type ChatRole = 'user' | 'assistant'

/** A single message in the chat conversation */
export interface ChatMessage {
  id: number
  role: ChatRole
  content: string
  timestamp: Date
  /** Parsed download intent (assistant messages only) */
  intent?: DownloadIntent
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Auto-incrementing message id */
let nextMsgId = 1

/**
 * Build a human-readable summary from a parsed download intent.
 */
function summarizeIntent(intent: DownloadIntent): string {
  const parts: string[] = [`识别: ${intent.title}`]

  if (intent.year) parts.push(`(${intent.year})`)
  if (intent.quality && intent.quality !== 'other') parts.push(`[${intent.quality}]`)
  parts.push(`类型: ${intent.resource_type}`)
  if (intent.need_subtitle) parts.push('+ 字幕')

  const keywords = intent.search_keywords?.length
    ? intent.search_keywords.join(', ')
    : intent.title
  parts.push(`\n搜索关键词: ${keywords}`)

  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/**
 * Pinia store managing the NL chat conversation and intent parsing.
 *
 * Each user message is sent through `useOpenCode.parseIntent` to produce
 * a structured `DownloadIntent`. The parsed result is stored as both
 * `currentIntent` (for downstream pipeline steps) and as an assistant
 * message in the conversation history.
 */
export const useChatStore = defineStore('chat', () => {
  const { parsing, parseIntent } = useOpenCode()

  // -- state --------------------------------------------------------------

  /** Full conversation history */
  const messages = ref<ChatMessage[]>([])

  /** The most recently parsed download intent, or null */
  const currentIntent = ref<DownloadIntent | null>(null)

  /** True while a parse request is in flight */
  const isParsing = ref(false)

  // -- actions ------------------------------------------------------------

  /**
   * Send a user message, parse it into a download intent, and add an
   * assistant response summarizing the parsed result.
   *
   * @param input - The raw user text input
   * @returns The parsed DownloadIntent, or null on failure
   */
  async function sendMessage(input: string): Promise<DownloadIntent | null> {
    const text = input.trim()
    if (!text) return null

    // 1. Record the user message
    messages.value.push({
      id: nextMsgId++,
      role: 'user',
      content: text,
      timestamp: new Date(),
    })

    // 2. Parse intent via OpenCode / Tauri backend
    isParsing.value = true
    try {
      const intent = await parseIntent(text)

      // 3. Store the intent for downstream consumers
      currentIntent.value = intent

      // 4. Add an assistant message summarizing the intent
      messages.value.push({
        id: nextMsgId++,
        role: 'assistant',
        content: summarizeIntent(intent),
        timestamp: new Date(),
        intent,
      })

      return intent
    } catch (e) {
      console.error('Intent parsing failed:', e)

      // Fallback assistant message on error
      messages.value.push({
        id: nextMsgId++,
        role: 'assistant',
        content: '解析失败，请尝试重新描述下载内容。',
        timestamp: new Date(),
      })
      return null
    } finally {
      isParsing.value = false
    }
  }

  /**
   * Clear all messages and reset the current intent.
   */
  function clearHistory(): void {
    messages.value = []
    currentIntent.value = null
  }

  /**
   * Set or clear the current download intent directly.
   * Useful when an intent is provided by other flows (e.g. URL paste).
   */
  function setCurrentIntent(intent: DownloadIntent | null): void {
    currentIntent.value = intent
  }

  return {
    // state
    messages,
    currentIntent,
    isParsing,
    // actions
    sendMessage,
    clearHistory,
    setCurrentIntent,
  }
})
