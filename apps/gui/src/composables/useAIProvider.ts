import { computed } from 'vue'
import { useConfigStore, type AIProvider } from '@/stores/config'

/**
 * Static metadata describing each provider's display name,
 * available models, and whether an API key is required.
 */
const PROVIDERS: Record<AIProvider, { name: string; models: string[]; requiresKey: boolean }> = {
  none: {
    name: 'None (heuristic only)',
    models: [],
    requiresKey: false,
  },
  opencode: {
    name: 'OpenCode (local server)',
    models: ['opencode/deepseek-v4-flash-free'],
    requiresKey: false,
  },
  openai: {
    name: 'OpenAI-compatible API',
    models: ['gpt-4o-mini'],
    requiresKey: true,
  },
  ollama: {
    name: 'Ollama (Local)',
    models: ['llama3', 'mistral', 'codellama'],
    requiresKey: false,
  },
  custom: {
    name: 'Custom (OpenAI Compatible)',
    models: [],
    requiresKey: true,
  },
}

/**
 * Reactive composable for managing BYOK (Bring-Your-Own-Key) multi-model
 * AI provider selection. Reads/writes `useConfigStore().config.ai` — the
 * store is the sole reactive entry point and handles persistence.
 */
export function useAIProvider() {
  const store = useConfigStore()
  const config = computed(() => store.config.ai)

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

  /** Whether the current provider requires an API key. */
  const requiresApiKey = computed(() => currentProvider.value.requiresKey)

  /** Whether the current provider needs a custom base URL (Ollama, custom, or OpenAI-compatible relay). */
  const needsBaseUrl = computed(() => ['ollama', 'custom', 'openai'].includes(config.value.provider))

  /** Switch the active provider and reset the model to that provider's default. */
  function setProvider(provider: AIProvider) {
    store.updateSection('ai', { provider, model: PROVIDERS[provider].models[0] ?? '' })
  }

  /** Set the model for the current provider. */
  function setModel(model: string) {
    store.updateSection('ai', { model })
  }

  /** Set the API key (used by Anthropic / OpenAI / custom). */
  function setApiKey(key: string) {
    store.updateSection('ai', { api_key: key })
  }

  /** Set the base URL (used by Ollama or custom endpoints). */
  function setBaseUrl(url: string) {
    store.updateSection('ai', { base_url: url })
  }

  return {
    config,
    availableProviders,
    modelOptions,
    currentProvider,
    requiresApiKey,
    needsBaseUrl,
    setProvider,
    setModel,
    setApiKey,
    setBaseUrl,
  }
}
