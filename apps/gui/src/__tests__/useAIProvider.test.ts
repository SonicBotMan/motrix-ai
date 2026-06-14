// __tests__/useAIProvider.test.ts — Tests for BYOK provider switching
//
// Exercises the useAIProvider composable: provider switching, model selection,
// API key persistence, and localStorage save/load behavior.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

vi.stubGlobal('localStorage', localStorageMock)

describe('useAIProvider — BYOK provider switching', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.resetModules()
  })

  it('defaults to opencode provider when no saved config', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { config } = useAIProvider()

    expect(config.value.provider).toBe('opencode')
    expect(config.value.model).toContain('opencode')
  })

  it('loads saved config from localStorage', async () => {
    const saved = {
      provider: 'anthropic',
      model: 'claude-sonnet-4',
      apiKey: 'sk-test-123',
    }
    localStorageMock.setItem('motrix-ai:ai-config', JSON.stringify(saved))

    const { useAIProvider } = await import('../composables/useAIProvider')
    const { config } = useAIProvider()

    expect(config.value.provider).toBe('anthropic')
    expect(config.value.model).toBe('claude-sonnet-4')
    expect(config.value.apiKey).toBe('sk-test-123')
  })

  it('setProvider switches provider and resets model', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { config, setProvider } = useAIProvider()

    setProvider('anthropic')

    expect(config.value.provider).toBe('anthropic')
    // Model should reset to the first model for that provider
    expect(config.value.model).toBe('claude-sonnet-4')
  })

  it('setProvider persists to localStorage', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { setProvider } = useAIProvider()

    setProvider('openai')

    const saved = JSON.parse(localStorageMock.getItem('motrix-ai:ai-config') || '{}')
    expect(saved.provider).toBe('openai')
  })

  it('setModel updates the current model', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { config, setModel } = useAIProvider()

    setModel('gpt-4o-mini')

    expect(config.value.model).toBe('gpt-4o-mini')
  })

  it('setApiKey persists the API key', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { config, setApiKey } = useAIProvider()

    setApiKey('sk-my-key')

    expect(config.value.apiKey).toBe('sk-my-key')
    const saved = JSON.parse(localStorageMock.getItem('motrix-ai:ai-config') || '{}')
    expect(saved.apiKey).toBe('sk-my-key')
  })

  it('availableProviders returns all 4 providers', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { availableProviders } = useAIProvider()

    expect(availableProviders.value.length).toBe(4)
    const ids = availableProviders.value.map((p) => p.id)
    expect(ids).toContain('opencode')
    expect(ids).toContain('anthropic')
    expect(ids).toContain('openai')
    expect(ids).toContain('ollama')
  })

  it('currentProvider reflects config.provider', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { currentProvider, config } = useAIProvider()

    expect(currentProvider.value.name).toBeDefined()

    // Change provider
    config.value.provider = 'openai'
    expect(currentProvider.value.name).toBe('OpenAI GPT')
  })

  it('modelOptions changes when provider changes', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { modelOptions, setProvider } = useAIProvider()

    // opencode has 1 model
    expect(modelOptions.value.length).toBeGreaterThanOrEqual(1)

    // anthropic has different models
    setProvider('anthropic')
    expect(modelOptions.value.some((m) => m.value.includes('claude'))).toBe(true)

    // ollama has different models
    setProvider('ollama')
    expect(modelOptions.value.some((m) => m.value.includes('llama') || m.value.includes('mistral'))).toBe(true)
  })

  it('setBaseUrl persists custom base URL', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { config, setBaseUrl } = useAIProvider()

    setBaseUrl('http://localhost:11434')

    expect(config.value.baseUrl).toBe('http://localhost:11434')
    const saved = JSON.parse(localStorageMock.getItem('motrix-ai:ai-config') || '{}')
    expect(saved.baseUrl).toBe('http://localhost:11434')
  })

  it('opencode and ollama do not require API keys', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { availableProviders, setProvider } = useAIProvider()

    setProvider('opencode')
    const opencode = availableProviders.value.find((p) => p.id === 'opencode')
    expect(opencode!.requiresKey).toBe(false)

    setProvider('ollama')
    const ollama = availableProviders.value.find((p) => p.id === 'ollama')
    expect(ollama!.requiresKey).toBe(false)
  })

  it('anthropic and openai require API keys', async () => {
    const { useAIProvider } = await import('../composables/useAIProvider')
    const { availableProviders } = useAIProvider()

    const anthropic = availableProviders.value.find((p) => p.id === 'anthropic')
    expect(anthropic!.requiresKey).toBe(true)

    const openai = availableProviders.value.find((p) => p.id === 'openai')
    expect(openai!.requiresKey).toBe(true)
  })
})
