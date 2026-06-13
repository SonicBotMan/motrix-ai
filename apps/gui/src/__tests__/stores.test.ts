import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock localStorage for node environment
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

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue({}),
}))

describe('useConfigStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
  })

  it('loads default config', async () => {
    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    store.load()
    expect(store.config.ai.provider).toBe('opencode')
    expect(store.config.aria2.rpc_url).toContain('6800')
  })

  it('saves config to localStorage', async () => {
    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    store.load()
    store.config.ai.model = 'test-model'
    store.save()
    const saved = JSON.parse(localStorage.getItem('motrix-ai:config') || '{}')
    expect(saved.ai.model).toBe('test-model')
  })

  it('resets to defaults', async () => {
    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    store.load()
    store.config.ai.model = 'changed'
    store.reset()
    expect(store.config.ai.model).toBe('opencode/deepseek-v4-flash-free')
  })
})
