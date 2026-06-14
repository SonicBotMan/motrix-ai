/**
 * useKeyboard — global keyboard shortcut handling for the task table.
 *
 * Registers a single `keydown` listener on mount and dispatches to the
 * caller-supplied callbacks. The listener is removed automatically on unmount.
 *
 * Shortcuts:
 *  - **⌘1 – ⌘5**  Trigger quick action panel buttons (by index)
 *  - **j / ↓**     Move selection to the next task
 *  - **k / ↑**     Move selection to the previous task
 *  - **Enter**     Open the detail panel for the selected task
 *  - **Escape**    Close any open panel / modal
 *  - **m**         Toggle the row context menu
 *
 * Text input fields are intentionally excluded so typing is not intercepted.
 */

import { onMounted, onUnmounted } from 'vue'

/**
 * Callbacks invoked by {@link useKeyboard} when a shortcut fires.
 *
 * Each handler receives no arguments; the consumer is responsible for wiring
 * the callback to its own state (selected index, open panel, etc.).
 */
export interface KeyboardShortcuts {
  /** Called with the 0-based index of a ⌘1–⌘5 quick action */
  onQuickAction: (index: number) => void
  /** Move to the next (below) task in the list */
  onNextTask: () => void
  /** Move to the previous (above) task in the list */
  onPrevTask: () => void
  /** Open the detail panel for the current selection */
  onOpenDetail: () => void
  /** Close any open overlay (detail, modal, menu) */
  onClose: () => void
  /** Toggle the row-level context menu */
  onToggleMenu: () => void
}

/**
 * Installs global keyboard shortcuts for the duration of the component's life.
 *
 * @param shortcuts - The callback set to invoke on each shortcut.
 */
export function useKeyboard(shortcuts: KeyboardShortcuts) {
  function handleKeydown(e: KeyboardEvent) {
    // ⌘1-5 (or Ctrl+1-5) — quick actions; works even inside inputs
    if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '5') {
      e.preventDefault()
      shortcuts.onQuickAction(parseInt(e.key) - 1)
      return
    }

    // Skip all remaining shortcuts when the user is typing in a field
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement
    ) {
      return
    }

    switch (e.key) {
      case 'j':
      case 'ArrowDown':
        e.preventDefault()
        shortcuts.onNextTask()
        break
      case 'k':
      case 'ArrowUp':
        e.preventDefault()
        shortcuts.onPrevTask()
        break
      case 'Enter':
        e.preventDefault()
        shortcuts.onOpenDetail()
        break
      case 'Escape':
        e.preventDefault()
        shortcuts.onClose()
        break
      case 'm':
        e.preventDefault()
        shortcuts.onToggleMenu()
        break
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', handleKeydown)
  })
}
