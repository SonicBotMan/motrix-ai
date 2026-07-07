// src/composables/useOpenCode.ts
// NL Intent Parsing — calls Rust backend (heuristic + optional LLM)

import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'

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

const LLM_CONFIG_KEY = 'motrix-ai:llm-config'

export function getLLMConfig(): LLMConfig | null {
  const raw = localStorage.getItem(LLM_CONFIG_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function setLLMConfig(config: LLMConfig | null): void {
  if (config) {
    localStorage.setItem(LLM_CONFIG_KEY, JSON.stringify(config))
  } else {
    localStorage.removeItem(LLM_CONFIG_KEY)
  }
}

export function useOpenCode() {
  const llmConfigured = computed(() => getLLMConfig() !== null)
  const connected = ref(true)
  const statusLabel = computed(() => (llmConfigured.value ? 'LLM Connected' : 'Heuristic Mode'))
  const parsing = ref(false)

  const parseIntent = async (input: string): Promise<DownloadIntent> => {
    parsing.value = true
    try {
      // Try LLM if configured, otherwise heuristic
      const llmConfig = getLLMConfig()
      const result = await invoke<DownloadIntent>('parse_nl_intent', {
        input,
        llmConfig: llmConfig || undefined,
      })
      return result
    } catch (e) {
      console.error('NL parsing failed:', e)
      // Fallback: minimal inline parsing
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
