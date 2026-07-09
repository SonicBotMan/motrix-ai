import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { DEFAULT_CONFIG, type AppConfig } from '../stores/config'

// Mock localStorage for node environment
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

// Mock Tauri invoke. `mockInvoke` is reset before each test and its
// implementation is configured per-test with .mockResolvedValueOnce / .mockRejectedValueOnce.
const mockInvoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

describe('useConfigStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
    mockInvoke.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('init() loads config from file via invoke("load_config")', async () => {
    const fileConfig: Partial<AppConfig> = {
      ai: { provider: 'openai', model: 'gpt-4o' },
      ui: { theme: 'light', language: 'ja', log_level: 'debug' },
    }
    mockInvoke.mockResolvedValueOnce(fileConfig)

    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()

    expect(store.loaded).toBe(false)
    await store.init()

    expect(mockInvoke).toHaveBeenCalledWith('load_config')
    expect(store.loaded).toBe(true)
    // Sections from file win, defaults fill the gaps.
    expect(store.config.ai.provider).toBe('openai')
    expect(store.config.ai.model).toBe('gpt-4o')
    expect(store.config.ui.theme).toBe('light')
    expect(store.config.ui.language).toBe('ja')
    // Untouched sections keep defaults.
    expect(store.config.aria2.rpc_url).toBe(DEFAULT_CONFIG.aria2.rpc_url)
    expect(store.config.downloads.rename_template).toBe(DEFAULT_CONFIG.downloads.rename_template)
  })

  it('init() falls back to localStorage migration when invoke rejects', async () => {
    // Legacy keys present in the browser/vite-dev environment.
    localStorageMock.setItem(
      'motrix-ai:ai-config',
      JSON.stringify({ provider: 'anthropic', model: 'claude-3-5-sonnet' }),
    )
    localStorageMock.setItem('motrix-ai:download-dir', JSON.stringify('/custom/dir'))
    localStorageMock.setItem('motrix-ai:aria2-rpc-url', JSON.stringify('http://host:6800/jsonrpc'))
    localStorageMock.setItem('motrix-ai:log-level', JSON.stringify('warn'))
    localStorageMock.setItem('motrix-ai:theme', JSON.stringify('light'))
    localStorageMock.setItem('motrix-ai:language', JSON.stringify('zh'))
    localStorageMock.setItem('motrix-ai:opensubtitles-api-key', 'secret-key')
    localStorageMock.setItem('motrix-ai:auto-search-subtitles', 'true')

    mockInvoke.mockRejectedValueOnce(new Error('tauri not available'))

    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    await store.init()

    expect(store.loaded).toBe(true)
    expect(store.config.ai.provider).toBe('anthropic')
    expect(store.config.ai.model).toBe('claude-3-5-sonnet')
    expect(store.config.downloads.base_dir).toBe('/custom/dir')
    expect(store.config.aria2.rpc_url).toBe('http://host:6800/jsonrpc')
    expect(store.config.ui.log_level).toBe('warn')
    expect(store.config.ui.theme).toBe('light')
    expect(store.config.ui.language).toBe('zh')
    expect(store.config.subtitles.opensubtitles_api_key).toBe('secret-key')
    expect(store.config.subtitles.auto_search).toBe(true)
  })

  it('init() cleans up legacy localStorage keys after migration', async () => {
    localStorageMock.setItem('motrix-ai:ai-config', JSON.stringify({ provider: 'openai' }))
    localStorageMock.setItem('motrix-ai:download-dir', JSON.stringify('/x'))
    localStorageMock.setItem('motrix-ai:nas-config', '{}')
    localStorageMock.setItem('motrix-ai:config', '{}')

    mockInvoke.mockRejectedValueOnce(new Error('no tauri'))

    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    await store.init()

    expect(localStorageMock.getItem('motrix-ai:ai-config')).toBeNull()
    expect(localStorageMock.getItem('motrix-ai:download-dir')).toBeNull()
    expect(localStorageMock.getItem('motrix-ai:nas-config')).toBeNull()
    expect(localStorageMock.getItem('motrix-ai:config')).toBeNull()
  })

  it('updateSection() merges a partial value into the section', async () => {
    mockInvoke.mockResolvedValueOnce({})
    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    await store.init()

    store.updateSection('ai', { model: 'claude-opus' })

    expect(store.config.ai.model).toBe('claude-opus')
    // Untouched field in the same section is preserved.
    expect(store.config.ai.provider).toBe(DEFAULT_CONFIG.ai.provider)
  })

  it('save() invokes "save_config" with the current config', async () => {
    mockInvoke.mockResolvedValueOnce({}) // for init
    mockInvoke.mockResolvedValueOnce(undefined) // for save

    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    await store.init()

    store.config.ai.model = 'gpt-4o'
    await store.save()

    expect(mockInvoke).toHaveBeenLastCalledWith('save_config', { config: store.config })
  })

  it('save() swallows invoke errors', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockInvoke.mockResolvedValueOnce({}) // init
    mockInvoke.mockRejectedValueOnce(new Error('disk full')) // save

    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    await store.init()
    await store.save()

    expect(errSpy).toHaveBeenCalledWith('Failed to save config:', expect.any(Error))
    expect(store.saving).toBe(false)
    errSpy.mockRestore()
  })

  it('reset() restores defaults and persists', async () => {
    mockInvoke.mockResolvedValueOnce({}) // init
    mockInvoke.mockResolvedValueOnce(undefined) // reset -> save

    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    await store.init()

    store.config.ai.model = 'mutated'
    await store.reset()

    expect(store.config.ai.model).toBe(DEFAULT_CONFIG.ai.model)
    expect(store.config.ai.provider).toBe(DEFAULT_CONFIG.ai.provider)
    expect(mockInvoke).toHaveBeenLastCalledWith('save_config', { config: store.config })
  })

  it('deep changes to config auto-persist via debounced watcher', async () => {
    vi.useFakeTimers()
    mockInvoke.mockResolvedValue({}) // init + any subsequent saves

    const { useConfigStore } = await import('../stores/config')
    const store = useConfigStore()
    await store.init()

    mockInvoke.mockClear()
    store.updateSection('ui', { theme: 'light' })

    // Before the debounce window elapses, save_config is NOT yet called.
    expect(mockInvoke).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(500)

    expect(mockInvoke).toHaveBeenCalledWith('save_config', { config: store.config })
    expect(store.config.ui.theme).toBe('light')
  })
})
