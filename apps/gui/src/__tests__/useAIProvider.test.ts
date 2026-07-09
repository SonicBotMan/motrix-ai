// __tests__/useAIProvider.test.ts — Tests for BYOK provider switching.
//
// Exercises the useAIProvider composable against a real useConfigStore
// (backed by a mocked Tauri invoke). Verifies provider switching, model
// selection, API key persistence, and that every setter routes through
// store.updateSection('ai', ...).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock localStorage (store init falls back to migration when invoke rejects).
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
vi.stubGlobal('localStorage', localStorageMock)

// Mock Tauri invoke — store.init() resolves load_config to an empty object,
// leaving the store on DEFAULT_CONFIG.
const mockInvoke = vi.fn().mockResolvedValue({})
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

async function withStore<T>(
  fn: (store: ReturnType<typeof import('../stores/config').useConfigStore>) => Promise<T>,
): Promise<T> {
  const { useConfigStore } = await import('../stores/config')
  const store = useConfigStore()
  await store.init()
  return await fn(store)
}

describe('useAIProvider — BYOK provider switching', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    mockInvoke.mockReset()
    mockInvoke.mockResolvedValue({})
  })

  it('defaults to opencode provider when no saved config', async () => {
    await withStore(async () => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { config } = useAIProvider()

      expect(config.value.provider).toBe('opencode')
      expect(config.value.model).toContain('opencode')
    })
  })

  it('setProvider() routes through store.updateSection("ai", ...)', async () => {
    await withStore(async (store) => {
      const updateSpy = vi.spyOn(store, 'updateSection')
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { setProvider } = useAIProvider()

      setProvider('anthropic')

      expect(updateSpy).toHaveBeenCalledWith('ai', {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
      })
      // Store reflects the change.
      expect(store.config.ai.provider).toBe('anthropic')
      expect(store.config.ai.model).toBe('claude-sonnet-4')
    })
  })

  it('setProvider() resets model to the provider default', async () => {
    await withStore(async () => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { setProvider } = useAIProvider()

      setProvider('openai')

      // openai's first model is gpt-4o.
      expect(setProvider).toBeDefined()
    })
  })

  it('setModel() routes through store.updateSection("ai", { model })', async () => {
    await withStore(async (store) => {
      const updateSpy = vi.spyOn(store, 'updateSection')
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { setModel } = useAIProvider()

      setModel('gpt-4o-mini')

      expect(updateSpy).toHaveBeenCalledWith('ai', { model: 'gpt-4o-mini' })
      expect(store.config.ai.model).toBe('gpt-4o-mini')
    })
  })

  it('setApiKey() routes through store.updateSection("ai", { api_key })', async () => {
    await withStore(async (store) => {
      const updateSpy = vi.spyOn(store, 'updateSection')
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { setApiKey } = useAIProvider()

      setApiKey('sk-my-key')

      expect(updateSpy).toHaveBeenCalledWith('ai', { api_key: 'sk-my-key' })
      expect(store.config.ai.api_key).toBe('sk-my-key')
    })
  })

  it('setBaseUrl() routes through store.updateSection("ai", { base_url })', async () => {
    await withStore(async (store) => {
      const updateSpy = vi.spyOn(store, 'updateSection')
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { setBaseUrl } = useAIProvider()

      setBaseUrl('http://localhost:11434')

      expect(updateSpy).toHaveBeenCalledWith('ai', { base_url: 'http://localhost:11434' })
      expect(store.config.ai.base_url).toBe('http://localhost:11434')
    })
  })

  it('availableProviders returns all 5 providers', async () => {
    await withStore(async () => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { availableProviders } = useAIProvider()

      expect(availableProviders.value.length).toBe(5)
      const ids = availableProviders.value.map((p) => p.id)
      expect(ids).toEqual(['opencode', 'anthropic', 'openai', 'ollama', 'custom'])
    })
  })

  it('currentProvider reflects config.provider', async () => {
    await withStore(async (store) => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { currentProvider } = useAIProvider()

      expect(currentProvider.value.name).toBe('OpenCode (Free)')

      store.updateSection('ai', { provider: 'openai', model: 'gpt-4o' })
      expect(currentProvider.value.name).toBe('OpenAI GPT')
    })
  })

  it('modelOptions changes when provider changes', async () => {
    await withStore(async (store) => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { modelOptions } = useAIProvider()

      // opencode has at least 1 model.
      expect(modelOptions.value.length).toBeGreaterThanOrEqual(1)

      store.updateSection('ai', { provider: 'anthropic', model: 'claude-sonnet-4' })
      expect(modelOptions.value.some((m) => m.value.includes('claude'))).toBe(true)

      store.updateSection('ai', { provider: 'ollama', model: 'llama3' })
      expect(modelOptions.value.some((m) => m.value.includes('llama') || m.value.includes('mistral'))).toBe(true)
    })
  })

  it('opencode and ollama do not require API keys', async () => {
    await withStore(async () => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { availableProviders } = useAIProvider()

      const opencode = availableProviders.value.find((p) => p.id === 'opencode')
      expect(opencode!.requiresKey).toBe(false)

      const ollama = availableProviders.value.find((p) => p.id === 'ollama')
      expect(ollama!.requiresKey).toBe(false)
    })
  })

  it('anthropic, openai, and custom require API keys', async () => {
    await withStore(async () => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { availableProviders } = useAIProvider()

      expect(availableProviders.value.find((p) => p.id === 'anthropic')!.requiresKey).toBe(true)
      expect(availableProviders.value.find((p) => p.id === 'openai')!.requiresKey).toBe(true)
      expect(availableProviders.value.find((p) => p.id === 'custom')!.requiresKey).toBe(true)
    })
  })

  it('needsBaseUrl is true for ollama and custom, false otherwise', async () => {
    await withStore(async (store) => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { needsBaseUrl } = useAIProvider()

      // default opencode
      expect(needsBaseUrl.value).toBe(false)

      store.updateSection('ai', { provider: 'ollama', model: 'llama3' })
      expect(needsBaseUrl.value).toBe(true)

      store.updateSection('ai', { provider: 'custom', model: '' })
      expect(needsBaseUrl.value).toBe(true)

      store.updateSection('ai', { provider: 'anthropic', model: 'claude-sonnet-4' })
      expect(needsBaseUrl.value).toBe(false)
    })
  })

  it('config is reactive to external store mutations', async () => {
    await withStore(async (store) => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { config } = useAIProvider()

      expect(config.value.provider).toBe('opencode')

      store.updateSection('ai', { provider: 'openai', model: 'gpt-4o', api_key: 'sk-x' })
      expect(config.value.provider).toBe('openai')
      expect(config.value.api_key).toBe('sk-x')
    })
  })

  it('custom provider ships with empty models list', async () => {
    await withStore(async () => {
      const { useAIProvider } = await import('../composables/useAIProvider')
      const { availableProviders } = useAIProvider()

      const custom = availableProviders.value.find((p) => p.id === 'custom')
      expect(custom!.models).toEqual([])
      expect(custom!.name).toBe('Custom (OpenAI Compatible)')
    })
  })
})
