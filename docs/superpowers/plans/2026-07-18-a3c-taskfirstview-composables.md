# A3c TaskFirstView Composables Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Extract toast system to Pinia store + download pipeline to composable. TaskFirstView script: 929 → ~630 lines.

## Global Constraints

- Repo: `/home/h523034406/motrix-ai`, branch `refactor/a3c-taskfirstview-composables`
- Baseline: `fbd27c6` (main, post-A3b)
- TS strict. No `any`, no `eslint-disable`.
- Tests: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.
- TaskFirstView public behavior unchanged (template bindings keep working).

---

### Task 1: Extract toast system to Pinia store

**Files:**

- Create: `apps/gui/src/stores/toasts.ts`
- Modify: `apps/gui/src/views/TaskFirstView.vue`

**Step 1: Create `stores/toasts.ts`**

```typescript
import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Toast } from '@/components/toast/ToastStack.vue'

const TOAST_LIFETIME = 2000
const TOAST_STACK_MAX = 4
const TOAST_EXIT_DELAY = 300

export const useToastStore = defineStore('toasts', () => {
  const toasts = ref<Toast[]>([])
  let toastCounter = 0

  function generateToastId(): string {
    toastCounter += 1
    return `toast-${Date.now()}-${toastCounter}`
  }

  function addToast(toast: Toast): void {
    toasts.value.push(toast)
    while (toasts.value.length > TOAST_STACK_MAX) {
      const oldestDone = toasts.value.findIndex((t) => !t.exiting)
      if (oldestDone !== -1) {
        toasts.value.splice(oldestDone, 1)
      } else {
        toasts.value.shift()
      }
    }
    setTimeout(() => dismissToast(toast.id), TOAST_LIFETIME)
  }

  function dismissToast(id: string): void {
    const idx = toasts.value.findIndex((t) => t.id === id)
    if (idx === -1) return
    toasts.value[idx].exiting = true
    setTimeout(() => {
      const i = toasts.value.findIndex((t) => t.id === id)
      if (i !== -1) toasts.value.splice(i, 1)
    }, TOAST_EXIT_DELAY)
  }

  return { toasts, addToast, dismissToast, generateToastId }
})
```

**Step 2: Update TaskFirstView.vue**

In `<script setup>`:

1. Add: `import { useToastStore } from '@/stores/toasts'`
2. Add: `const { toasts, addToast, dismissToast, generateToastId } = useToastStore()`
3. Delete: `toasts` ref, `TOAST_LIFETIME`/`TOAST_STACK_MAX`/`TOAST_EXIT_DELAY` constants, `toastCounter`, `generateToastId()`, `addToast()`, `dismissToast()` functions (lines ~93, 142-179)

In `<template>`: `ToastStack` binding unchanged (still `:toasts="toasts" @dismiss="dismissToast"`).

**Step 3:** typecheck + test + lint + commit.

Commit: `refactor(gui): extract toast system to Pinia store`

---

### Task 2: Extract download pipeline to composable

**Files:**

- Create: `apps/gui/src/composables/useDownloadPipeline.ts`
- Modify: `apps/gui/src/views/TaskFirstView.vue`

**Step 1: Create `composables/useDownloadPipeline.ts`**

This composable encapsulates all download/search/chat logic. It receives dependencies and returns the state + handlers that TaskFirstView's template uses.

**Key imports needed:**

```typescript
import { ref, type Ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { KeywordGenerator, ResultEvaluator } from '@motrix-ai/core/browser'
import { useToastStore } from '@/stores/toasts'
import { useTasksStore } from '@/stores/tasks'
import { useOpenCode } from '@/composables/useOpenCode'
import type { SearchResult } from '@/composables/useSearch'
```

**Dependency interface:**

```typescript
interface UseDownloadPipelineDeps {
  activeFilter: Ref<string>
  bottomChatRef: Ref<{ focus: () => void } | null>
}
```

**What moves into the composable:**

- Search state: `showSearchResults`, `searchResults`, `searching`, `searchQuery`, `pendingIntent`
- Functions: `aria2AddUri`, `handleSendMessage` (~150 lines), `handleSelectSearchResult`, `handleQuickAction`, `pauseAllTasks`, `handleAttach`
- Internal: `keywordGen = new KeywordGenerator()`, `evaluator = new ResultEvaluator()`

**Return interface:**

```typescript
return {
  showSearchResults,
  searchResults,
  searching,
  handleSendMessage,
  handleSelectSearchResult,
  handleQuickAction,
  handleAttach,
}
```

**Step 2: Update TaskFirstView.vue**

In `<script setup>`:

1. Add: `import { useDownloadPipeline } from '@/composables/useDownloadPipeline'`
2. Call: `const { showSearchResults, searchResults, searching, handleSendMessage, handleSelectSearchResult, handleQuickAction, handleAttach } = useDownloadPipeline({ activeFilter, bottomChatRef })`
3. Delete: `showSearchResults`, `searchResults`, `searching`, `searchQuery`, `pendingIntent` refs (lines 132-136)
4. Delete: `keywordGen`, `evaluator` instances (lines 40-41)
5. Delete: `aria2AddUri`, `handleSendMessage`, `handleSelectSearchResult`, `handleQuickAction`, `pauseAllTasks`, `handleAttach` functions (lines 192-504)

In `<template>`: all bindings remain the same — the destructured return values have the same names.

**Step 3:** typecheck + test + lint + commit.

Commit: `refactor(gui): extract download pipeline to composable`

---

### Final Verification

```bash
pnpm typecheck && pnpm test && pnpm lint
wc -l apps/gui/src/views/TaskFirstView.vue  # < 800
ls apps/gui/src/stores/toasts.ts apps/gui/src/composables/useDownloadPipeline.ts
```

Expected: 5 commits (spec + plan + 2 implementation). TaskFirstView < 800 lines. 702 tests pass.
