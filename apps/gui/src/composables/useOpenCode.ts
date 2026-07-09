// src/composables/useOpenCode.ts
// NL Intent Parsing — calls Rust backend (heuristic + optional LLM).
// Reads LLM config reactively from useConfigStore().config.ai.

import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '@/stores/config'

export interface DownloadIntent {
  title: string
  year?: number | null
  quality: '4K' | '1080p' | '720p' | 'other'
  need_subtitle: boolean
  search_keywords: string[]
  resource_type: 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other'
  raw_input?: string
}

export interface LLMConfig {
  endpoint: string
  api_key: string
  model: string
}

export function useOpenCode() {
  const store = useConfigStore()
  const connected = ref(true)
  const parsing = ref(false)

  /** True when a non-default provider has been selected in config.ai. */
  const llmConfigured = computed(() => store.config.ai.provider !== 'opencode')

  const statusLabel = computed(() => (llmConfigured.value ? 'LLM Connected' : 'Heuristic Mode'))

  /**
   * Map the current config.ai selection to the OpenAI-compatible endpoint
   * shape consumed by the Rust parse_nl_intent command. Returns null when
   * the user has not configured a non-default provider.
   */
  function getLLMConfig(): LLMConfig | null {
    const ai = store.config.ai
    if (ai.provider === 'opencode') return null

    const endpoints: Partial<Record<string, string>> = {
      anthropic: 'https://api.anthropic.com/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
      ollama: ai.base_url
        ? `${ai.base_url.replace(/\/$/, '')}/v1/chat/completions`
        : 'http://127.0.0.1:11434/v1/chat/completions',
      custom: ai.base_url ?? '',
    }

    const endpoint = endpoints[ai.provider]
    if (!endpoint) return null
    return { endpoint, api_key: ai.api_key ?? '', model: ai.model }
  }

  const parseIntent = async (input: string): Promise<DownloadIntent> => {
    parsing.value = true
    try {
      // Try LLM if configured, otherwise heuristic.
      const llmConfig = getLLMConfig()
      const result = await invoke<DownloadIntent>('parse_nl_intent', {
        input,
        llmConfig: llmConfig ?? undefined,
      })
      return result
    } catch (e) {
      console.error('NL parsing failed:', e)
      // Fallback: minimal inline parsing.
      return {
        title: input.replace(/^下[载个]?|^download|^get/i, '').trim() || input,
        quality: 'other',
        need_subtitle: /字幕|subtitle/i.test(input),
        search_keywords: [input],
        resource_type: 'other',
        raw_input: input,
      }
    } finally {
      parsing.value = false
    }
  }

  return {
    connected,
    statusLabel,
    llmConfigured,
    parsing,
    parseIntent,
  }
}
