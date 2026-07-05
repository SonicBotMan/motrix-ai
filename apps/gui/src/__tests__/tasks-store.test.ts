/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// ---- Shared mock state ----------------------------------------------------
//
// vi.mock factories are hoisted above all imports, so any value they need
// must be created via vi.hoisted (also hoisted). We avoid `ref()` inside the
// hoisted block — plain `{ value: T }` objects work because the production
// code only accesses `.value`.

const mockState = vi.hoisted(() => {
  const makeRef = <T>(initial: T) => ({ value: initial })
  const listeners: Array<(task: any) => void | Promise<void>> = []

  const aria2 = {
    connected: makeRef(false),
    connecting: makeRef(false),
    aria2Running: makeRef(false),
    globalStat: makeRef(null),
    tasks: makeRef<any[]>([]),

    onConnectionChange: () => () => {},
    onTaskComplete: (listener: (task: any) => void | Promise<void>) => {
      listeners.push(listener)
      return () => {}
    },

    connect: async () => {},
    disconnect: () => {},
    startAria2: async () => {},
    stopAria2: async () => {},
    addUri: async () => 'fake-gid',
    remove: async () => {},
    pause: async () => {},
    unpause: async () => {},
    moveToTop: async () => {},
    removeCompleted: async () => {},
  }

  return { aria2, listeners }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('@/composables/useAria2', () => ({
  useAria2: () => mockState.aria2,
}))

vi.mock('@/composables/useSubtitle', () => ({
  useSubtitle: () => ({
    searchSubtitles: vi.fn(async () => []),
    getBestSubtitle: () => null,
  }),
  hasApiKey: () => false,
}))

const invokeMock: ReturnType<typeof vi.fn> = (await import('@tauri-apps/api/core')).invoke as any

function makeCompletedTask(gid: string, filePath = '/tmp/Movie.2020.1080p.mkv', uri = 'magnet:?xt=urn:btih:abc'): any {
  return {
    gid,
    status: 'complete',
    totalLength: '1000000000',
    completedLength: '1000000000',
    downloadSpeed: '0',
    uploadSpeed: '0',
    files: [
      {
        index: '1',
        path: filePath,
        length: '1000000000',
        completedLength: '1000000000',
        selected: 'true',
        uris: [{ uri, status: 'used' }],
      },
    ],
    bittorrent: { info: { name: 'Movie.2020.1080p' } },
  }
}

async function triggerComplete(task: any): Promise<void> {
  for (const listener of mockState.listeners) {
    await listener(task)
  }
}

describe('useTasksStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockState.listeners.length = 0
    invokeMock.mockReset()
    invokeMock.mockImplementation(() => Promise.resolve({}))

    mockState.aria2.connected.value = false
    mockState.aria2.tasks.value = []

    mockState.aria2.addUri = vi.fn(async () => 'fake-gid') as any
    mockState.aria2.moveToTop = vi.fn(async () => {}) as any
    mockState.aria2.remove = vi.fn(async () => {}) as any
    mockState.aria2.connect = vi.fn(async () => {}) as any
  })

  it('addTask captures intent by GID when aria2 is connected', async () => {
    mockState.aria2.connected.value = true
    ;(mockState.aria2.addUri as any).mockResolvedValue('GID-XYZ')
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()

    await store.addTask('magnet:?xt=urn:btih:abc', undefined, {
      title: 'Inception',
      year: 2010,
      quality: '1080p',
      resourceType: 'movie',
      needSubtitle: true,
    })

    expect(mockState.aria2.addUri).toHaveBeenCalledWith('magnet:?xt=urn:btih:abc')
  })

  it('addTask without intent does not throw', async () => {
    mockState.aria2.connected.value = true
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await expect(store.addTask('https://example.com/file.zip')).resolves.toBeUndefined()
  })

  it('addTask falls back to local list when aria2 is not connected', async () => {
    mockState.aria2.connected.value = false
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.addTask('https://example.com/big.zip', 'big.zip')
    expect(store.localTasks).toHaveLength(1)
    expect(store.localTasks[0].name).toBe('big.zip')
    expect(store.localTasks[0].status).toBe('downloading')
  })

  it('bumpPriority returns true and calls moveToTop when task has a GID', async () => {
    mockState.aria2.connected.value = true
    mockState.aria2.tasks.value = [makeCompletedTask('GID-PRIORITY')]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    const task = store.tasks[0]
    const ok = await store.bumpPriority(task.id)
    expect(ok).toBe(true)
    expect(mockState.aria2.moveToTop).toHaveBeenCalledWith('GID-PRIORITY')
  })

  it('bumpPriority returns false when task has no GID', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 1,
      name: 'local',
      source: 'https://example.com',
      status: 'downloading',
      progress: 0,
      speed: '—',
      size: '0',
      eta: '—',
      type: 'document',
    })
    const ok = await store.bumpPriority(1)
    expect(ok).toBe(false)
    expect(mockState.aria2.moveToTop).not.toHaveBeenCalled()
  })

  it('bumpPriority returns false when taskId does not exist', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    const ok = await store.bumpPriority(999)
    expect(ok).toBe(false)
  })

  it('init registers the post-download pipeline listener exactly once', async () => {
    ;(mockState.aria2.connect as any).mockResolvedValue(undefined)
    invokeMock.mockResolvedValue({ exists: true, binary_path: '/fake/aria2c' })

    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.init()
    await store.init()
    await store.init()
    expect(mockState.listeners).toHaveLength(1)
  })

  it('post-download pipeline sends notification + organizes file when intent exists', async () => {
    ;(mockState.aria2.connect as any).mockResolvedValue(undefined)
    invokeMock.mockResolvedValue({ exists: true, binary_path: '/fake/aria2c' })

    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()

    mockState.aria2.connected.value = true
    ;(mockState.aria2.addUri as any).mockResolvedValue('GID-PIPELINE')
    await store.addTask('magnet:?xt=urn:btih:abc', undefined, {
      title: 'Inception',
      year: 2010,
      quality: '1080p',
      resourceType: 'movie',
      needSubtitle: false,
    })

    await store.init()

    invokeMock.mockClear()
    await triggerComplete(makeCompletedTask('GID-PIPELINE'))
    await new Promise((r) => setTimeout(r, 0))

    const calls = invokeMock.mock.calls.map((c) => (c as any[])[0])
    expect(calls).toContain('send_notification')
    expect(calls).toContain('organize_file')

    const organizeCall = invokeMock.mock.calls.find((c) => (c as any[])[0] === 'organize_file')
    expect(organizeCall).toBeDefined()
    const organizeArgs = (organizeCall as any[])[1]
    expect(organizeArgs.title).toBe('Inception')
    expect(organizeArgs.year).toBe(2010)
    expect(organizeArgs.quality).toBe('1080p')
    expect(organizeArgs.resourceType).toBe('movie')
  })

  it('post-download pipeline sends notification but skips organize when no intent', async () => {
    ;(mockState.aria2.connect as any).mockResolvedValue(undefined)
    invokeMock.mockResolvedValue({ exists: true, binary_path: '/fake/aria2c' })

    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.init()

    invokeMock.mockClear()
    await triggerComplete(makeCompletedTask('GID-NO-INTENT'))
    await new Promise((r) => setTimeout(r, 0))

    const calls = invokeMock.mock.calls.map((c) => (c as any[])[0])
    expect(calls).toContain('send_notification')
    expect(calls).not.toContain('organize_file')
  })

  it('retryTask preserves intent by re-mapping the new GID', async () => {
    mockState.aria2.connected.value = true
    mockState.aria2.tasks.value = [
      makeCompletedTask('OLD-GID', '/tmp/Movie.2020.1080p.mkv', 'magnet:?xt=urn:btih:retry'),
    ]

    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()

    ;(mockState.aria2.addUri as any).mockResolvedValueOnce('OLD-GID')
    await store.addTask('magnet:?xt=urn:btih:retry', undefined, {
      title: 'Retry Movie',
      resourceType: 'movie',
    })

    ;(mockState.aria2.addUri as any).mockResolvedValueOnce('NEW-GID')
    const task = store.tasks[0]
    await store.retryTask(task.id)

    expect(mockState.aria2.remove).toHaveBeenCalledWith('OLD-GID')
    expect(mockState.aria2.addUri).toHaveBeenLastCalledWith('magnet:?xt=urn:btih:retry')
  })

  it('activeCount and completedCount reflect task states', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push(
      {
        id: 1,
        name: 'a',
        source: 's',
        status: 'downloading',
        progress: 0,
        speed: '1',
        size: '1',
        eta: '1',
        type: 'document',
      },
      {
        id: 2,
        name: 'b',
        source: 's',
        status: 'completed',
        progress: 100,
        speed: '0',
        size: '1',
        eta: '0',
        type: 'document',
      },
      {
        id: 3,
        name: 'c',
        source: 's',
        status: 'downloading',
        progress: 50,
        speed: '1',
        size: '1',
        eta: '1',
        type: 'document',
      },
    )
    expect(store.activeCount).toBe(2)
    expect(store.completedCount).toBe(1)
  })

  it('setFilter updates the active filter', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.setFilter('completed')
    expect(store.activeFilter).toBe('completed')
  })
})
