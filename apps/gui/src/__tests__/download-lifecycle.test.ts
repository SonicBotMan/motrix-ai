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

vi.mock('@/composables/useAria2', () => ({
  useAria2: () => ({
    connected: { value: true },
    connecting: { value: false },
    aria2Running: { value: true },
    globalStat: { value: null },
    tasks: { value: [] as unknown[] },
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
    startAria2: vi.fn(),
    getGlobalStat: vi.fn(),
    tellActive: vi.fn().mockResolvedValue([]),
    tellWaiting: vi.fn().mockResolvedValue([]),
    tellStopped: vi.fn().mockResolvedValue([]),
    fetchAllTasks: vi.fn(),
    fetchGlobalStat: vi.fn(),
  }),
}))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
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
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 1,
      gid: 'g-pause',
      name: 't',
      source: '',
      status: 'downloading',
      progress: 0,
      speed: '',
      size: '',
      eta: '',
      type: 'document' as const,
    })
    await store.pauseTask(1)
    expect(pauseSpy).toHaveBeenCalledWith('g-pause')
  })

  test('pauseTask on gidless task stays local', async () => {
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
    await store.pauseTask(2)
    expect(pauseSpy).not.toHaveBeenCalled()
    expect(store.localTasks[0].status).toBe('paused')
  })

  test('resumeTask calls aria2.unpause', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 3,
      gid: 'g-resume',
      name: 't',
      source: '',
      status: 'paused',
      progress: 0,
      speed: '',
      size: '',
      eta: '',
      type: 'document' as const,
    })
    await store.resumeTask(3)
    expect(unpauseSpy).toHaveBeenCalledWith('g-resume')
  })

  test('removeTask calls aria2.remove', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 4,
      gid: 'g-remove',
      name: 't',
      source: '',
      status: 'downloading',
      progress: 0,
      speed: '',
      size: '',
      eta: '',
      type: 'document' as const,
    })
    await store.removeTask(4)
    expect(removeSpy).toHaveBeenCalledWith('g-remove')
  })

  test('removeTask on gidless removes from localTasks', async () => {
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
    await store.removeTask(5)
    expect(store.localTasks).toHaveLength(0)
  })

  test('retryTask removes old + re-adds source', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 6,
      gid: 'old-gid',
      name: 'failed',
      source: 'https://example.com/f.zip',
      status: 'failed',
      progress: 0,
      speed: '',
      size: '',
      eta: '',
      type: 'document' as const,
    })
    await store.retryTask(6)
    expect(removeSpy).toHaveBeenCalledWith('old-gid')
    expect(addUriSpy).toHaveBeenCalledWith('https://example.com/f.zip')
  })

  test('bumpPriority calls changeOption with pri-high', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 7,
      gid: 'g-prio',
      name: 't',
      source: '',
      status: 'downloading',
      progress: 0,
      speed: '',
      size: '',
      eta: '',
      type: 'document' as const,
    })
    await store.bumpPriority(7)
    expect(changeOptionSpy).toHaveBeenCalledWith('g-prio', { priority: 'pri-high' })
  })

  test('bumpPriority rejects without GID', async () => {
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
    await expect(store.bumpPriority(8)).rejects.toThrow(/not connected/)
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
