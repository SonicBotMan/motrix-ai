import { ref, computed } from 'vue'

/**
 * Supported AI provider identifiers.
 * Each maps to a different LLM backend with its own API conventions.
 */
export type AIProvider = 'opencode' | 'anthropic' | 'openai' | 'ollama'

/**
 * User-configurable AI configuration persisted to localStorage.
 */
export interface AIConfig {
  provider: AIProvider
  model: string
  apiKey?: string
  baseUrl?: string
}

/**
 * Static metadata describing each provider's display name,
 * available models, and whether an API key is required.
 */
const PROVIDERS: Record<AIProvider, { name: string; models: string[]; requiresKey: boolean }> = {
  opencode: {
    name: 'OpenCode (Free)',
    models: ['opencode/deepseek-v4-flash-free'],
    requiresKey: false,
  },
  anthropic: {
    name: 'Anthropic Claude',
    models: ['claude-sonnet-4', 'claude-haiku-4'],
    requiresKey: true,
  },
  openai: {
    name: 'OpenAI GPT',
    models: ['gpt-4o', 'gpt-4o-mini'],
    requiresKey: true,
  },
  ollama: {
    name: 'Ollama (Local)',
    models: ['llama3', 'mistral', 'codellama'],
    requiresKey: false,
  },
}

/**
 * Load the saved AI configuration from localStorage.
 * Falls back to the free OpenCode provider when nothing is stored.
 */
function loadConfig(): AIConfig {
  try {
    const saved = localStorage.getItem('motrix-ai:ai-config')
    if (saved) return JSON.parse(saved) as AIConfig
  } catch {
    // ignore parse errors and fall through to defaults
  }
  return { provider: 'opencode', model: 'opencode/deepseek-v4-flash-free' }
}

/**
 * Reactive composable for managing BYOK (Bring-Your-Own-Key) multi-model
 * AI provider selection. Persists configuration to localStorage and exposes
 * computed helpers for the current provider's metadata.
 */
export function useAIProvider() {
  const config = ref<AIConfig>(loadConfig())

  /** All providers in a format suitable for Naive UI dropdowns. */
  const availableProviders = computed(() =>
    Object.entries(PROVIDERS).map(([key, val]) => ({
      id: key as AIProvider,
      ...val,
    })),
  )

  /** Model options for the currently selected provider. */
  const modelOptions = computed(() =>
    PROVIDERS[config.value.provider].models.map((m) => ({
      label: m,
      value: m,
    })),
  )

  /** Metadata for the currently selected provider. */
  const currentProvider = computed(() => PROVIDERS[config.value.provider])

  /** Persist the current configuration to localStorage. */
  function saveConfig() {
    localStorage.setItem('motrix-ai:ai-config', JSON.stringify(config.value))
  }

  /**
   * Switch the active provider and reset the model to that provider's default.
   */
  function setProvider(provider: AIProvider) {
    config.value.provider = provider
    config.value.model = PROVIDERS[provider].models[0]
    saveConfig()
  }

  /** Set the model for the current provider. */
  function setModel(model: string) {
    config.value.model = model
    saveConfig()
  }

  /** Set the API key (used by Anthropic / OpenAI). */
  function setApiKey(key: string) {
    config.value.apiKey = key
    saveConfig()
  }

  /** Set the base URL (used by Ollama or custom endpoints). */
  function setBaseUrl(url: string) {
    config.value.baseUrl = url
    saveConfig()
  }

  return {
    config,
    availableProviders,
    modelOptions,
    currentProvider,
    setProvider,
    setModel,
    setApiKey,
    setBaseUrl,
  }
}
