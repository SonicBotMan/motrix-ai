import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, type Ref } from 'vue'

type Aria2Like = {
  connected: Ref<boolean>
  connecting: Ref<boolean>
  aria2Running: Ref<boolean>
  globalStat: Ref<unknown>
  tasks: Ref<unknown[]>
  onConnectionChange: () => () => void
  onTaskComplete: ReturnType<typeof vi.fn> | ((cb: (task: unknown) => void) => () => void)
  start: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  addUri: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  unpause: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  removeCompleted: ReturnType<typeof vi.fn>
  changeOption: ReturnType<typeof vi.fn>
  changeGlobalOption: ReturnType<typeof vi.fn>
  startAria2: ReturnType<typeof vi.fn>
  getGlobalStat: ReturnType<typeof vi.fn>
  tellActive: ReturnType<typeof vi.fn>
  tellWaiting: ReturnType<typeof vi.fn>
  tellStopped: ReturnType<typeof vi.fn>
  fetchAllTasks: ReturnType<typeof vi.fn>
  fetchGlobalStat: ReturnType<typeof vi.fn>
}

const mockState: {
  connected: boolean
  tasks: unknown[]
  addUri: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  unpause: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  changeOption: ReturnType<typeof vi.fn>
  onTaskComplete: ReturnType<typeof vi.fn>
} = {
  connected: false,
  tasks: [],
  addUri: vi.fn().mockResolvedValue('fake-gid-001'),
  pause: vi.fn().mockResolvedValue(undefined),
  unpause: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  changeOption: vi.fn().mockResolvedValue(undefined),
  onTaskComplete: vi.fn().mockReturnValue(() => {}),
}

vi.mock('@/composables/useAria2', () => ({
  useAria2: (): Aria2Like => ({
    connected: ref(mockState.connected),
    connecting: ref(false),
    aria2Running: ref(mockState.connected),
    globalStat: ref(null),
    tasks: ref(mockState.tasks),
    onConnectionChange: () => () => {},
    onTaskComplete: mockState.onTaskComplete,
    start: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    addUri: mockState.addUri,
    pause: mockState.pause,
    unpause: mockState.unpause,
    remove: mockState.remove,
    removeCompleted: vi.fn().mockResolvedValue(undefined),
    changeOption: mockState.changeOption,
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

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn().mockResolvedValue(true),
  requestPermission: vi.fn().mockResolvedValue('granted'),
  sendNotification: vi.fn(),
}))

function makeStatus(overrides: Record<string, unknown> = {}) {
  return {
    gid: 'test-gid-001',
    status: 'active',
    totalLength: String(100 * 1024 * 1024),
    completedLength: String(50 * 1024 * 1024),
    downloadSpeed: String(5 * 1024 * 1024),
    uploadSpeed: '0',
    connections: '8',
    numSeeders: '10',
    dir: '/home/user/Downloads/Motrix AI',
    files: [
      {
        index: '1',
        path: '/home/user/Downloads/Motrix AI/ubuntu.iso',
        length: String(100 * 1024 * 1024),
        completedLength: String(50 * 1024 * 1024),
        selected: 'true',
        uris: [{ uri: 'https://example.com/ubuntu.iso', status: 'used' }],
      },
    ],
    errorMessage: '',
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
  mockState.connected = false
  mockState.tasks = []
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

describe('E2E: Add URL → task appears → pause → resume → complete', () => {
  test('addTask creates aria2 task when connected', async () => {
    mockState.connected = true
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.addTask('https://example.com/file.zip')
    expect(mockState.addUri).toHaveBeenCalled()
    expect(mockState.addUri.mock.calls[0][0]).toBe('https://example.com/file.zip')
  })

  test('task list shows aria2 tasks with correct formatting', async () => {
    mockState.connected = true
    mockState.tasks = [
      makeStatus({
        totalLength: String(2 * 1024 * 1024 * 1024),
        completedLength: String(1 * 1024 * 1024 * 1024),
      }),
    ]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    const task = store.tasks[0]
    expect(task).toBeDefined()
    expect(task.gid).toBe('test-gid-001')
    expect(task.status).toBe('downloading')
    expect(task.progress).toBe(50)
    expect(task.speed).toContain('MB/s')
    expect(task.size).toContain('GB')
  })

  test('pause → aria2.pause called with GID', async () => {
    mockState.connected = true
    mockState.tasks = [makeStatus({ gid: 'g-pause-e2e' })]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.pauseTask('g-pause-e2e')
    expect(mockState.pause).toHaveBeenCalledWith('g-pause-e2e')
  })

  test('resume → aria2.unpause called with GID', async () => {
    mockState.connected = true
    mockState.tasks = [makeStatus({ gid: 'g-resume-e2e', status: 'paused' })]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.resumeTask('g-resume-e2e')
    expect(mockState.unpause).toHaveBeenCalledWith('g-resume-e2e')
  })

  test('remove → aria2.remove called with GID', async () => {
    mockState.connected = true
    mockState.tasks = [makeStatus({ gid: 'g-remove-e2e' })]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.removeTask('g-remove-e2e')
    expect(mockState.remove).toHaveBeenCalledWith('g-remove-e2e')
  })

  test('retry HTTP task → remove + re-add source', async () => {
    mockState.connected = true
    mockState.tasks = [
      makeStatus({
        gid: 'g-retry-e2e',
        status: 'error',
        files: [
          {
            index: '1',
            path: '/home/user/Downloads/Motrix AI/failed.zip',
            length: '1024',
            completedLength: '0',
            selected: 'true',
            uris: [{ uri: 'https://example.com/failed.zip', status: 'used' }],
          },
        ],
      }),
    ]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.retryTask('g-retry-e2e')
    expect(mockState.remove).toHaveBeenCalledWith('g-retry-e2e')
    expect(mockState.addUri).toHaveBeenCalledWith('https://example.com/failed.zip')
  })

  test('retry BT task without valid URL → throws', async () => {
    mockState.connected = true
    mockState.tasks = [
      makeStatus({
        gid: 'g-bt-retry',
        status: 'error',
        files: [
          {
            index: '1',
            path: '/home/user/Downloads/Motrix AI/movie.mkv',
            length: '1024',
            completedLength: '0',
            selected: 'true',
            uris: [],
          },
        ],
        bittorrent: { info: { name: 'Movie' } },
      }),
    ]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await expect(store.retryTask('g-bt-retry')).rejects.toThrow(/Cannot retry/)
  })
})

describe('E2E: Task display correctness', () => {
  test('speed displays in appropriate unit (KB/s for slow)', async () => {
    mockState.connected = true
    mockState.tasks = [makeStatus({ downloadSpeed: String(50 * 1024) })]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    expect(store.tasks[0].speed).toContain('KB/s')
    expect(store.tasks[0].speed).not.toContain('0.0 MB/s')
  })

  test('size uses auto-scaling (MB for small files)', async () => {
    mockState.connected = true
    mockState.tasks = [
      makeStatus({
        totalLength: String(10 * 1024 * 1024),
        completedLength: String(5 * 1024 * 1024),
      }),
    ]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    expect(store.tasks[0].size).toContain('MB')
    expect(store.tasks[0].size).not.toContain('0 B')
  })

  test('ETA formats as h/m/s not raw seconds', async () => {
    mockState.connected = true
    mockState.tasks = [
      makeStatus({
        totalLength: String(10 * 1024 * 1024 * 1024),
        completedLength: '0',
        downloadSpeed: String(1024 * 1024),
      }),
    ]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    const eta = store.tasks[0].eta
    expect(eta).toMatch(/\d+h/)
    expect(eta).not.toMatch(/^\d+s$/)
  })

  test('error message propagated to Task', async () => {
    mockState.connected = true
    mockState.tasks = [makeStatus({ status: 'error', errorMessage: 'Connection timed out' })]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    expect(store.tasks[0].errorMessage).toBe('Connection timed out')
    expect(store.tasks[0].status).toBe('failed')
  })

  test('seeders propagated to Task', async () => {
    mockState.connected = true
    mockState.tasks = [makeStatus({ numSeeders: '42' })]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    expect(store.tasks[0].seeders).toBe(42)
  })

  test('files array propagated to Task', async () => {
    mockState.connected = true
    mockState.tasks = [
      makeStatus({
        files: [
          { index: '1', path: '/tmp/file1.mkv', length: '1000', completedLength: '500', selected: 'true', uris: [] },
          { index: '2', path: '/tmp/file2.srt', length: '200', completedLength: '200', selected: 'false', uris: [] },
        ],
      }),
    ]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    expect(store.tasks[0].files).toHaveLength(2)
    expect(store.tasks[0].files?.[0].name).toBe('file1.mkv')
    expect(store.tasks[0].files?.[1].selected).toBe(false)
  })
})

describe('E2E: Local fallback when aria2 disconnected', () => {
  test('addTask creates local placeholder when disconnected', async () => {
    mockState.connected = false
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.addTask('https://example.com/file.zip')
    expect(store.localTasks.length).toBe(1)
    expect(store.localTasks[0].source).toBe('https://example.com/file.zip')
    expect(mockState.addUri).not.toHaveBeenCalled()
  })

  test('local task pause works without aria2', async () => {
    mockState.connected = false
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.addTask('https://example.com/file.zip')
    const localId = String(store.localTasks[0].id)
    await store.pauseTask(localId)
    expect(store.localTasks[0].status).toBe('paused')
    expect(mockState.pause).not.toHaveBeenCalled()
  })
})

describe('E2E: GID stability across polls', () => {
  test('same GID maps to same numeric ID across list reorder', async () => {
    mockState.connected = true
    const { useTasksStore, _resetGidMapForTesting } = await import('../stores/tasks')
    _resetGidMapForTesting()
    mockState.tasks = [makeStatus({ gid: 'aaa' }), makeStatus({ gid: 'bbb' })]
    const store = useTasksStore()
    const id1_first = store.tasks.find((t) => t.gid === 'aaa')?.id
    const id2_first = store.tasks.find((t) => t.gid === 'bbb')?.id

    mockState.tasks = [makeStatus({ gid: 'bbb' }), makeStatus({ gid: 'aaa' })]
    const id1_second = store.tasks.find((t) => t.gid === 'aaa')?.id
    const id2_second = store.tasks.find((t) => t.gid === 'bbb')?.id

    expect(id1_first).toBe(id1_second)
    expect(id2_first).toBe(id2_second)
  })
})
