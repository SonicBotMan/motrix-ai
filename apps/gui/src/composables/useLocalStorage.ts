// composables/useLocalStorage.ts — tiny typed localStorage ref helper
//
// Reads an initial value from localStorage (parsed as JSON), exposes it as
// a writable ref, and persists every change back to localStorage.
//
// Used by settings tabs and other components that need simple per-key
// persistence without pulling in a full store.

import { ref, watch, type Ref } from 'vue'

/**
 * Create a reactive ref backed by localStorage.
 *
 * @param key localStorage key (will be JSON-encoded under this key)
 * @param defaultValue fallback when the key is absent or fails to parse
 * @returns a writable ref; writes are persisted eagerly
 */
export function useLocalStorage<T>(key: string, defaultValue: T): Ref<T> {
  let initial = defaultValue
  try {
    const stored = localStorage.getItem(key)
    if (stored !== null) initial = JSON.parse(stored) as T
  } catch {
    // localStorage unavailable or stored value malformed; fall back to default.
  }

  const data = ref(initial) as Ref<T>
  watch(
    data,
    (newVal) => {
      try {
        localStorage.setItem(key, JSON.stringify(newVal))
      } catch {
        // Best-effort persistence; UI continues to work even if storage is full.
      }
    },
    { deep: true },
  )
  return data
}
