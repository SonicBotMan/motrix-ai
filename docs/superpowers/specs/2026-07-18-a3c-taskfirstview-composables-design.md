# A3c — TaskFirstView Split (useToasts store + useDownloadPipeline composable)

**Date:** 2026-07-18
**Status:** Design — Pending Implementation
**Parent:** A3 → A3c (final slice)

## Problem

TaskFirstView.vue is 1130 lines (script 929 + template ~120 + styles ~80). All child components are already extracted (ChromeBar, TaskTable, DetailPanel, RowMenu, BottomChat, ToastStack, etc.). The bloat is in **orchestration logic**: the script mixes toast management, download/chat pipeline, search pipeline, task actions, keyboard nav, and view state.

## Scope — 2 extractions

### 1. Toast → Pinia store (`stores/toasts.ts`)

**Extracts** ~50 lines from TaskFirstView:

- `toasts` ref, `TOAST_LIFETIME`/`TOAST_STACK_MAX`/`TOAST_EXIT_DELAY` constants
- `generateToastId()`, `addToast()`, `dismissToast()`

**Why Pinia store (not composable):** toasts are cross-cutting — any component may need to show one. A Pinia store gives global access without prop drilling. Currently only TaskFirstView can show toasts; after this, DetailPanel, BottomChat, or any component can `useToastStore()` directly.

### 2. Download pipeline → composable (`composables/useDownloadPipeline.ts`)

**Extracts** ~250 lines from TaskFirstView:

- Search state: `showSearchResults`, `searchResults`, `searching`, `searchQuery`, `pendingIntent`
- `aria2AddUri()` — wraps `tasksStore.addTask`
- `handleSendMessage()` — the main dispatcher (~150 lines: URL detection, NL parsing, multi-source search, ranking)
- `handleSelectSearchResult()` — adds selected magnet to aria2
- `handleQuickAction()` — 5 quick-action chip handlers
- `pauseAllTasks()` — invoke('pause_all')
- `handleAttach()` — torrent/metalink file dialog + invoke

**Dependencies (passed in):**

```typescript
function useDownloadPipeline(deps: {
  tasksStore: ReturnType<typeof useTasksStore>
  openCode: ReturnType<typeof useOpenCode>
  activeFilter: Ref<string>
  bottomChatRef: Ref<{ focus: () => void } | null>
}): UseDownloadPipelineReturn
```

The composable internally uses `useToastStore()` directly (no dependency injection needed after toast → Pinia migration).

### After extraction

TaskFirstView script: 929 → ~630 lines. The view retains:

- View state (showDetail, showMenu, menuTask, keyboardIndex, selectedIds, etc.)
- Task actions (pause/resume/retry/delete/openLocation/bumpPriority)
- Detail panel / row menu orchestration
- Keyboard navigation
- Chrome bar handlers
- Onboarding
- Template (unchanged — composables return the same refs/functions)

## Verification

- `pnpm typecheck` (5 packages): 0 errors
- `pnpm test`: 702 pass (no regression)
- `pnpm lint`: 0 errors
- TaskFirstView: < 800 lines
- 2 new files exist: `stores/toasts.ts`, `composables/useDownloadPipeline.ts`

## Execution

Single PR, 4 commits: spec/plan + toast store extraction + download pipeline composable.

Branch: `refactor/a3c-taskfirstview-composables`
