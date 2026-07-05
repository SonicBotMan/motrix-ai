import { describe, test, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue({}) }))

const changeOptionSpy = vi.fn().mockResolvedValue(undefined)
const changeGlobalOptionSpy = vi.fn().mockResolvedValue(undefined)
const onTaskCompleteSpy = vi.fn().mockReturnValue(() => {})

vi.mock('@/composables/useAria2', () => ({
  useAria2: () => ({
    connected: { value: true },
    connecting: { value: false },
    aria2Running: { value: true },
    globalStat: { value: null },
    tasks: { value: [] },
    onConnectionChange: () => () => {},
    onTaskComplete: onTaskCompleteSpy,
    start: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    addUri: vi.fn(),
    pause: vi.fn(),
    unpause: vi.fn(),
    remove: vi.fn(),
    removeCompleted: vi.fn(),
    changeOption: changeOptionSpy,
    changeGlobalOption: changeGlobalOptionSpy,
    startAria2: vi.fn(),
    getGlobalStat: vi.fn(),
    tellActive: vi.fn().mockResolvedValue([]),
    tellWaiting: vi.fn().mockResolvedValue([]),
    tellStopped: vi.fn().mockResolvedValue([]),
    fetchAllTasks: vi.fn(),
    fetchGlobalStat: vi.fn(),
  }),
}))

describe('useSchedule — aria2 wiring', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    changeGlobalOptionSpy.mockClear()
  })

  test('sends speed limit when a rule is active', async () => {
    const { useSchedule } = await import('../composables/useSchedule')
    const sched = useSchedule([
      { name: 'Night', time_start: '00:00', time_end: '23:59', speed_limit: 102400, max_concurrent: 3 },
    ])
    sched.start()
    await new Promise((r) => setTimeout(r, 50))

    expect(changeGlobalOptionSpy).toHaveBeenCalled()
    const args = changeGlobalOptionSpy.mock.calls[0][0] as Record<string, string>
    expect(args['max-overall-download-limit']).toBe('100K')
    expect(args['max-concurrent-downloads']).toBe('3')
    sched.stop()
  })

  test('sends 0 (unlimited) when no rule matches', async () => {
    const { useSchedule } = await import('../composables/useSchedule')
    const sched = useSchedule([])
    sched.start()
    await new Promise((r) => setTimeout(r, 50))

    const calls = changeGlobalOptionSpy.mock.calls
    const lastArgs = calls.at(-1)?.[0] as Record<string, string> | undefined
    expect(lastArgs?.['max-overall-download-limit']).toBe('0')
    sched.stop()
  })
})

describe('tasks store — post-download pipeline', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    onTaskCompleteSpy.mockClear()
  })

  test('init() registers onTaskComplete listener', async () => {
    const { useTasksStore } = await import('../stores/tasks')
    const store = useTasksStore()
    await store.init()
    expect(onTaskCompleteSpy).toHaveBeenCalled()
  })
})
