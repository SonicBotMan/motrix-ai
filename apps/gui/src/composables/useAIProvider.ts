import { computed } from 'vue'
import { useConfigStore, type AIProvider } from '@/stores/config'

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

  /** Whether the current provider needs a custom base URL (Ollama or custom OpenAI-compatible). */
  const needsBaseUrl = computed(() => config.value.provider === 'ollama' || config.value.provider === 'custom')

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
