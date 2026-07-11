import { describe, expect, vi, beforeEach, test } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { ref, type Ref } from 'vue'
import { _resetGidMapForTesting } from '../stores/tasks'

// --- Shared mock state for useAria2 -----------------------------------
// We use a hoisted vi.mock so the mock is in place *before* the store
// module is imported. Each test mutates `mockState` to feed different
// tasks/connectivity into the store.

type Aria2Like = {
  connected: Ref<boolean>
  connecting: Ref<boolean>
  aria2Running: Ref<boolean>
  globalStat: Ref<unknown>
  tasks: Ref<unknown[]>
  onConnectionChange: () => () => void
  onTaskComplete: () => () => void
  init: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  addUri: ReturnType<typeof vi.fn>
  pause: ReturnType<typeof vi.fn>
  unpause: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  removeCompleted: ReturnType<typeof vi.fn>
  changeOption: ReturnType<typeof vi.fn>
  startAria2: ReturnType<typeof vi.fn>
}

const mockState: {
  connected: boolean
  tasks: unknown[]
  changeOption: ReturnType<typeof vi.fn>
} = {
  connected: false,
  tasks: [],
  changeOption: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/composables/useAria2', () => ({
  useAria2: (): Aria2Like => ({
    connected: ref(mockState.connected),
    connecting: ref(false),
    aria2Running: ref(mockState.connected),
    globalStat: ref(null),
    tasks: ref(mockState.tasks),
    onConnectionChange: () => () => {},
    onTaskComplete: () => () => {},
    init: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    addUri: vi.fn(),
    pause: vi.fn(),
    unpause: vi.fn(),
    remove: vi.fn(),
    removeCompleted: vi.fn(),
    changeOption: mockState.changeOption,
    startAria2: vi.fn(),
  }),
}))

// Mock Tauri invoke (used by store.init, but not by these unit tests)
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))

const FAKE_GID = '000000000000001'

function makeRawStatus(overrides: Record<string, unknown> = {}) {
  return {
    gid: FAKE_GID,
    status: 'active',
    totalLength: String(10 * 1024 * 1024),
    completedLength: String(5 * 1024 * 1024),
    downloadSpeed: String(2 * 1024 * 1024),
    uploadSpeed: '0',
    connections: '8',
    numSeeders: '0',
    dir: '/home/user/Downloads/Motrix AI',
    files: [
      {
        index: '1',
        path: '/home/user/Downloads/Motrix AI/ubuntu.iso',
        length: String(10 * 1024 * 1024),
        completedLength: String(5 * 1024 * 1024),
        selected: 'true',
        uris: [{ uri: 'https://example.com/ubuntu.iso', status: 'used' }],
      },
    ],
    ...overrides,
  }
}

describe('tasks store — aria2 status mapping', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    _resetGidMapForTesting()
    mockState.connected = false
    mockState.tasks = []
    mockState.changeOption = vi.fn().mockResolvedValue(undefined)
  })
  test('maps active/complete/paused/error/waiting/removed onto the UI status enum', async () => {
    mockState.connected = true
    mockState.tasks = [
      makeRawStatus({ status: 'active' }),
      makeRawStatus({ gid: 'g2', status: 'complete' }),
      makeRawStatus({ gid: 'g3', status: 'paused' }),
      makeRawStatus({ gid: 'g4', status: 'error' }),
      makeRawStatus({ gid: 'g5', status: 'waiting' }),
      makeRawStatus({ gid: 'g6', status: 'removed' }),
    ]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    const statuses = store.tasks.map((t) => t.status)
    expect(statuses).toEqual([
      'downloading',
      'completed',
      'paused',
      'failed',
      'pending',
      'failed', // ← previously 'pending' (BUG-7 fix)
    ])
  })

  test('uses torrent info name as source when no URIs are present (BUG-8)', async () => {
    mockState.connected = true
    mockState.tasks = [
      makeRawStatus({
        status: 'active',
        files: [
          {
            index: '1',
            path: '/home/user/Downloads/Motrix AI/Interstellar.mkv',
            length: '1',
            completedLength: '0',
            selected: 'true',
            uris: [], // empty → no web seed
          },
        ],
        bittorrent: { info: { name: 'Interstellar.2014.4K' } },
      }),
    ]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    const task = store.tasks[0]
    expect(task.source).not.toBe('magnet:?xt=urn:btih:...')
    expect(task.source).toBe('torrent://Interstellar.2014.4K')
  })

  test('bumpPriority calls aria2.changeOption with priority=pri-high', async () => {
    mockState.connected = true
    mockState.tasks = [makeRawStatus({ gid: 'abc123', status: 'active' })]
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.bumpPriority(1)
    expect(mockState.changeOption).toHaveBeenCalledWith('abc123', { priority: 'pri-high' })
  })

  test('bumpPriority rejects for tasks without a gid', async () => {
    mockState.connected = false
    mockState.tasks = []
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    store.localTasks.push({
      id: 1,
      name: 'demo',
      source: 'https://example.com',
      status: 'downloading',
      progress: 0,
      speed: '—',
      size: '0 MB',
      eta: '—',
      type: 'document',
    })
    await expect(store.bumpPriority(1)).rejects.toThrow(/not connected to aria2/)
  })
})
