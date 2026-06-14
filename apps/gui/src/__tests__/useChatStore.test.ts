// __tests__/useChatStore.test.ts — Tests for chat store
//
// Exercises the Pinia chat store: adding messages, clearing, and metadata.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: () => null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()

vi.stubGlobal('localStorage', localStorageMock)

// Mock Tauri API
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('useChatStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorageMock.clear()
  })

  it('starts with empty messages', async () => {
    const { useChatStore } = await import('../composables/useChatStore')
    const store = useChatStore()
    expect(store.messages).toEqual([])
  })

  it('addUserMessage appends a user message', async () => {
    const { useChatStore } = await import('../composables/useChatStore')
    const store = useChatStore()

    const msg = store.addUserMessage('Hello')

    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].role).toBe('user')
    expect(store.messages[0].content).toBe('Hello')
    expect(msg.role).toBe('user')
    expect(msg.id).toBeTruthy()
    expect(msg.timestamp).toBeTruthy()
  })

  it('addAssistantMessage appends an assistant message', async () => {
    const { useChatStore } = await import('../composables/useChatStore')
    const store = useChatStore()

    const msg = store.addAssistantMessage('Hi there')

    expect(store.messages).toHaveLength(1)
    expect(store.messages[0].role).toBe('assistant')
    expect(store.messages[0].content).toBe('Hi there')
    expect(msg.role).toBe('assistant')
  })

  it('addAssistantMessage stores intent when provided', async () => {
    const { useChatStore } = await import('../composables/useChatStore')
    const store = useChatStore()

    const intent = {
      title: 'Movie',
      quality: '4K' as const,
      need_subtitle: false,
      search_keywords: ['Movie'],
      resource_type: 'movie' as const,
    }

    const msg = store.addAssistantMessage('Found movie', intent)

    expect(msg.intent).toEqual(intent)
    expect(store.messages[0].intent).toEqual(intent)
  })

  it('addAssistantMessage can mark error flag', async () => {
    const { useChatStore } = await import('../composables/useChatStore')
    const store = useChatStore()

    const msg = store.addAssistantMessage('Failed', null, true)

    expect(msg.error).toBe(true)
    expect(store.messages[0].error).toBe(true)
  })

  it('clear empties all messages', async () => {
    const { useChatStore } = await import('../composables/useChatStore')
    const store = useChatStore()

    store.addUserMessage('msg1')
    store.addAssistantMessage('msg2')
    expect(store.messages).toHaveLength(2)

    store.clear()

    expect(store.messages).toEqual([])
  })

  it('each message gets a unique id', async () => {
    const { useChatStore } = await import('../composables/useChatStore')
    const store = useChatStore()

    store.addUserMessage('msg1')
    store.addUserMessage('msg2')
    store.addUserMessage('msg3')

    const ids = store.messages.map((m) => m.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(3)
  })

  it('messages maintain insertion order', async () => {
    const { useChatStore } = await import('../composables/useChatStore')
    const store = useChatStore()

    store.addUserMessage('first')
    store.addAssistantMessage('second')
    store.addUserMessage('third')

    expect(store.messages[0].content).toBe('first')
    expect(store.messages[1].content).toBe('second')
    expect(store.messages[2].content).toBe('third')
  })

  it('message timestamps are epoch milliseconds', async () => {
    const { useChatStore } = await import('../composables/useChatStore')
    const store = useChatStore()

    const before = Date.now()
    const msg = store.addUserMessage('test')
    const after = Date.now()

    expect(msg.timestamp).toBeGreaterThanOrEqual(before)
    expect(msg.timestamp).toBeLessThanOrEqual(after)
  })
})
