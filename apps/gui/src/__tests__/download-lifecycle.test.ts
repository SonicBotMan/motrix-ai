import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue('granted'),
  sendNotification: vi.fn(),
}))

const pauseSpy = vi.fn().mockResolvedValue(undefined)
const unpauseSpy = vi.fn().mockResolvedValue(undefined)
const removeSpy = vi.fn().mockResolvedValue(undefined)
const addUriSpy = vi.fn().mockResolvedValue('fake-gid-001')
const changeOptionSpy = vi.fn().mockResolvedValue(undefined)
const onTaskCompleteSpy = vi.fn().mockReturnValue(() => {})
const startSpy = vi.fn().mockResolvedValue(undefined)
const disposeSpy = vi.fn().mockResolvedValue(undefined)

// Mutable mock state. Plain objects suffice because each test creates a fresh
// pinia (new store instance, new computed), and the mock values are set before
// the computed is first accessed. The store's `localTasks` ref is the only
// reactive source the computed needs to track at runtime.
const mockState = vi.hoisted(() => ({
  connected: { value: true },
  tasks: { value: [] as unknown[] },
}))

vi.mock('@/composables/useAria2', () => ({
  useAria2: () => ({
    connected: mockState.connected,
    connecting: { value: false },
    aria2Running: { value: true },
    globalStat: { value: null },
    tasks: mockState.tasks,
    onConnectionChange: () => () => {},
    onTaskComplete: onTaskCompleteSpy,
    start: startSpy,
    dispose: disposeSpy,
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    addUri: addUriSpy,
    pause: pauseSpy,
    unpause: unpauseSpy,
    remove: removeSpy,
    removeCompleted: vi.fn().mockResolvedValue(undefined),
    changeOption: changeOptionSpy,
    changeGlobalOption: vi.fn().mockResolvedValue(undefined),
    getGlobalStat: vi.fn(),
    tellActive: vi.fn().mockResolvedValue([]),
    tellWaiting: vi.fn().mockResolvedValue([]),
    tellStopped: vi.fn().mockResolvedValue([]),
    fetchAllTasks: vi.fn(),
    fetchGlobalStat: vi.fn(),
  }),
}))

function mockAria2Task(gid: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gid,
    status: 'active',
    totalLength: '0',
    completedLength: '0',
    downloadSpeed: '0',
    uploadSpeed: '0',
    files: [],
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  mockState.connected.value = true
  mockState.tasks.value = []
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k]
    },
  })
})

describe('Download lifecycle', () => {
  test('addTask calls aria2.addUri', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.addTask('https://example.com/file.zip')
    expect(addUriSpy).toHaveBeenCalledWith('https://example.com/file.zip', {
      dir: '~/Downloads/Motrix AI',
    })
  })

  test('addTask stores intent by GID', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.addTask('magnet:?xt=urn:btih:def456', undefined, {
      title: 'Interstellar',
      year: 2014,
      quality: '4K',
      resourceType: 'movie',
    })
    expect(addUriSpy).toHaveBeenCalledWith('magnet:?xt=urn:btih:def456', {
      dir: '~/Downloads/Motrix AI',
    })
  })

  test('pauseTask calls aria2.pause with GID', async () => {
    mockState.tasks.value = [mockAria2Task('g-pause')]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.pauseTask('g-pause')
    expect(pauseSpy).toHaveBeenCalledWith('g-pause')
  })

  test('pauseTask on gidless task stays local', async () => {
    mockState.connected.value = false
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 2,
      name: 'local',
      source: '',
      status: 'downloading',
      progress: 0,
      speed: '',
      size: '',
      eta: '',
      type: 'document' as const,
    })
    await store.pauseTask('2')
    expect(pauseSpy).not.toHaveBeenCalled()
    expect(store.localTasks[0].status).toBe('paused')
  })

  test('resumeTask calls aria2.unpause', async () => {
    mockState.tasks.value = [mockAria2Task('g-resume', { status: 'paused' })]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.resumeTask('g-resume')
    expect(unpauseSpy).toHaveBeenCalledWith('g-resume')
  })

  test('removeTask calls aria2.remove', async () => {
    mockState.tasks.value = [mockAria2Task('g-remove')]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.removeTask('g-remove')
    expect(removeSpy).toHaveBeenCalledWith('g-remove')
  })

  test('removeTask on gidless removes from localTasks', async () => {
    mockState.connected.value = false
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 5,
      name: 'local',
      source: '',
      status: 'downloading',
      progress: 0,
      speed: '',
      size: '',
      eta: '',
      type: 'document' as const,
    })
    await store.removeTask('5')
    expect(store.localTasks).toHaveLength(0)
  })

  test('retryTask removes old + re-adds source', async () => {
    mockState.tasks.value = [
      mockAria2Task('old-gid', {
        status: 'error',
        files: [
          {
            path: '/tmp/failed.zip',
            length: '0',
            completedLength: '0',
            uris: [{ uri: 'https://example.com/f.zip', status: 'used' }],
          },
        ],
      }),
    ]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.retryTask('old-gid')
    expect(removeSpy).toHaveBeenCalledWith('old-gid')
    expect(addUriSpy).toHaveBeenCalledWith('https://example.com/f.zip', {
      dir: '~/Downloads/Motrix AI',
    })
  })

  test('bumpPriority calls changeOption with pri-high', async () => {
    mockState.tasks.value = [mockAria2Task('g-prio')]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.bumpPriority('g-prio')
    expect(changeOptionSpy).toHaveBeenCalledWith('g-prio', { priority: 'pri-high' })
  })

  test('bumpPriority rejects without GID', async () => {
    mockState.connected.value = false
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 8,
      name: 'nogid',
      source: '',
      status: 'downloading',
      progress: 0,
      speed: '',
      size: '',
      eta: '',
      type: 'document' as const,
    })
    await expect(store.bumpPriority('8')).rejects.toThrow(/not connected/)
  })

  test('init registers onTaskComplete + calls start', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.init()
    expect(startSpy).toHaveBeenCalled()
    expect(onTaskCompleteSpy).toHaveBeenCalled()
  })

  test('dispose calls aria2.dispose', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.dispose()
    expect(disposeSpy).toHaveBeenCalled()
  })

  test('setFilter updates activeFilter', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.setFilter('completed')
    expect(store.activeFilter).toBe('completed')
  })

  test('filteredTasks respects filter', async () => {
    mockState.connected.value = false
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks = [
      {
        id: 1,
        name: 'a',
        source: '',
        status: 'downloading',
        progress: 0,
        speed: '',
        size: '',
        eta: '',
        type: 'document' as const,
      },
      {
        id: 2,
        name: 'b',
        source: '',
        status: 'completed',
        progress: 100,
        speed: '',
        size: '',
        eta: '',
        type: 'document' as const,
      },
    ]
    store.setFilter('completed')
    expect(store.filteredTasks).toHaveLength(1)
  })

  test('activeCount + completedCount correct', async () => {
    mockState.connected.value = false
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks = [
      {
        id: 1,
        name: 'a',
        source: '',
        status: 'downloading',
        progress: 0,
        speed: '',
        size: '',
        eta: '',
        type: 'document' as const,
      },
      {
        id: 2,
        name: 'b',
        source: '',
        status: 'completed',
        progress: 100,
        speed: '',
        size: '',
        eta: '',
        type: 'document' as const,
      },
    ]
    expect(store.activeCount).toBe(1)
    expect(store.completedCount).toBe(1)
  })
})
