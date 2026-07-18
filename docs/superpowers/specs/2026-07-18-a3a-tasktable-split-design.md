# A3a — TaskTable Split (TaskRow + task-utils extraction)

**Date:** 2026-07-18
**Status:** Design — Pending Implementation
**Spec owner:** Maintainer
**Verified against:** `main` @ commit `e57fbae` (post-A2b squash merge)
**Parent initiative:** Sub-project A (Code Quality / Architecture) → A3 (giant component split) → A3a slice

---

## 1. Problem Statement

The audit (`AUDIT-REPORT.md` P1-4) flagged `TaskTable.vue` as a god component (864 lines at audit time). Verification on `main` @ `e57fbae`:

- **Current size:** 860 lines (script 224 + template 130 + styles 506)
- **Partial split already done:** `FilterTabs.vue` and `RowMenu.vue` were previously extracted
- **Still oversized:** the component handles container layout, state management (sort/select/flash/keyboard), AND single-row rendering (9 columns × complex cells)

### What's mixed in TaskTable today

The `<tbody><tr>` block (lines 264-341) renders each task row with 9 cells: checkbox, name+icon, source URL (truncated), status pill, progress bar, speed, size, ETA, actions button. Each cell has its own rendering logic, CSS classes, and event handling. The row template is ~80 lines with nested conditionals.

Meanwhile, TaskTable also owns: sorting state (`sortField`/`sortDir`/`toggleSort`), selection state (`allSelected`/`someSelected`), keyboard navigation refs (`rowRefs`/`scrollIntoView` watch), filtering computeds (`filteredTasks`/`displayTasks`), and row-level event handlers (`handleRowClick` with 180ms flash, `handleMenuToggle`).

This mix makes the file hard to scan, hard to test in isolation, and a merge-conflict hotspot (any UI change touches the same 860-line file).

### Consumer analysis (low refactor risk)

- **Single consumer:** `TaskFirstView.vue:27` (import), `:955` (usage). No other component imports TaskTable.
- **No direct unit tests:** no `TaskTable.test.ts` exists. The component is exercised indirectly via `apps/gui/src/__tests__/e2e-download-flow.test.ts`.
- **Public API stability:** TaskFirstView passes props (`tasks`, `activeFilter`, `keyboardIndex`, `connecting`, `connected`, `selectedIds`) and listens to emits (`openDetail`, `toggleMenu`, `update:filter`, `retryConnect`, `trySample`, `toggleSelect`, `toggleSelectAll`). This API does NOT change — TaskRow is a purely internal implementation detail of TaskTable.

---

## 2. Scope

### In scope

- **New file:** `apps/gui/src/components/task/TaskRow.vue` — single-row renderer (~200 lines: script ~50, template ~80, styles ~70)
- **New file:** `apps/gui/src/shared/utils/task-utils.ts` — pure helpers extracted from TaskTable's script (~50 lines)
- **Modify:** `apps/gui/src/components/task/TaskTable.vue` — delete row template + row-specific helpers + row-specific styles; add `<TaskRow>` in `v-for`; use `:deep()` for column-width CSS that must reach into child cells

### Out of scope (explicit)

- **`<thead>` extraction** — tightly coupled to sort state (sortField/sortDir/toggleSort). 30 lines of template, not worth the prop drilling.
- **Sort/filter composables** — simple ref + computed logic, doesn't justify a separate `useTaskSort.ts` file.
- **`useSettings.ts` split** — already done (95 lines post-extraction; translation dict moved to `locales/strings.ts`).
- **`DetailPanel.vue` / `TaskFirstView.vue` splits** — separate A3b/A3c slices.
- **Style refactoring beyond the split** — no design token changes, no dead-CSS cleanup (e.g., `empty-state` styles in TaskTable that may belong to EmptyState.vue).
- **Test additions** — no new tests. Existing e2e tests verify the component indirectly. Adding unit tests for TaskRow is a separate effort.

---

## 3. Design Decisions

### 3.1 Event flow (TaskRow → TaskTable → TaskFirstView)

```
User clicks row
  → TaskRow emits('click', task)
  → TaskTable.handleRowClick(task)
    → flashingRowId = task.id
    → setTimeout(180ms) → flashingRowId = null → emit('openDetail', task)
    → TaskFirstView receives openDetail (unchanged)

User clicks ⋯ menu button
  → TaskRow emits('toggleMenu', { taskId, event })
  → TaskTable.handleMenuToggle(taskId, event)
    → openMenuId toggles
    → emit('toggleMenu', taskId, event)
    → TaskFirstView receives toggleMenu (unchanged)

User clicks checkbox
  → TaskRow emits('toggleSelect', task.id)
  → TaskTable emit('toggleSelect', id)
  → TaskFirstView receives toggleSelect (unchanged)
```

The flash logic (180ms delay before openDetail) stays in TaskTable because it requires coordination via `flashingRowId` (only one row flashes at a time). TaskRow just reports the raw click.

### 3.2 Keyboard scroll: `defineExpose` pattern

TaskTable currently holds `rowRefs: Array<HTMLTableRowElement>` for `scrollIntoView` when `keyboardIndex` changes (watch at lines 101-112). After extraction, `<tr>` lives inside TaskRow. Instead of reaching into TaskRow's DOM, TaskRow exposes a `scrollIntoView` method:

```typescript
// TaskRow.vue
const rootRef = ref<HTMLTableRowElement | null>(null)
function scrollIntoView(options?: ScrollIntoViewOptions): void {
  rootRef.value?.scrollIntoView(options)
}
defineExpose({ scrollIntoView })
```

TaskTable's ref array becomes `Array<{ scrollIntoView(options?) => void } | null>`, and the watch calls `rowRefs.value[idx]?.scrollIntoView(...)`.

### 3.3 CSS split strategy: `:deep()` for column widths

Vue scoped styles add `[data-v-xxx]` to selectors, preventing parent styles from matching child component elements. With `table-layout: fixed`, column widths are set on `<th>` in TaskTable, but `<td>` cells in TaskRow need matching widths for consistent rendering.

**Solution:** TaskTable keeps column width definitions using `:deep()`:

```css
/* TaskTable.vue (stays) */
.task-table :deep(.col-name) {
  width: 25%;
}
.task-table :deep(.col-source) {
  width: 16%;
}
/* ... etc */
```

This is the standard Vue pattern for parent-child table layouts. `:deep()` penetrates the scoped boundary.

**Visual styles** (padding, color, typography, animations, status pill colors, progress bar rendering) move to TaskRow's scoped styles since they only apply to `<td>` content.

### 3.4 `task-utils.ts` — pure helpers

Five items move to a shared utils file:

| Helper            | Current location      | Signature                        |
| ----------------- | --------------------- | -------------------------------- |
| `formatSource`    | TaskTable script :152 | `(source: string) => string`     |
| `statusPillClass` | TaskTable script :172 | `(status: TaskStatus) => string` |
| `statusLabel`     | TaskTable script :178 | `(status: TaskStatus) => string` |
| `fillClass`       | TaskTable script :190 | `(status: TaskStatus) => string` |
| `typeIcons`       | TaskTable script :196 | `Record<TaskType, Component>`    |

These are pure (no reactive state, no props dependency). TaskRow imports them. Any future consumer (e.g., a list view alternative to the table) can also import them.

---

## 4. Implementation

### 4.1 Create `apps/gui/src/shared/utils/task-utils.ts`

```typescript
// task-utils.ts — Pure helpers for task display (shared by TaskRow, TaskTable, etc.)
//
// Extracted from TaskTable.vue during A3a. No reactive state, no component
// dependencies — safe to import from any Vue component or non-Vue module.

import type { Component } from 'vue'
import {
  VideocamOutline,
  MusicalNotesOutline,
  DocumentTextOutline,
  ArchiveOutline,
  CloudDownloadOutline,
} from '@vicons/ionicons5'
import type { TaskStatus, TaskType } from '@/stores/tasks'

/** Truncate source URLs for display. Handles magnet:, torrent:, and regular URLs. */
export function formatSource(source: string): string {
  if (!source) return ''
  if (source.startsWith('magnet:')) {
    const match = source.match(/xt=urn:btih:([a-zA-Z0-9]+)/i)
    return match ? `magnet:${match[1].slice(0, 12)}…` : 'magnet:?'
  }
  if (source.startsWith('torrent://')) {
    return source.replace('torrent://', 'torrent: ')
  }
  try {
    const url = new URL(source)
    return url.hostname.replace('www.', '')
  } catch {
    return source
  }
}

/** Map TaskStatus to status-pill CSS class name. */
export function statusPillClass(status: TaskStatus): string {
  if (status === 'failed') return 'error'
  return status
}

/** Map TaskStatus to uppercase display label. */
export function statusLabel(status: TaskStatus): string {
  const labels: Record<string, string> = {
    downloading: 'DOWNLOADING',
    paused: 'PAUSED',
    completed: 'COMPLETED',
    failed: 'FAILED',
    pending: 'PENDING',
  }
  return labels[status] || status.toUpperCase()
}

/** Map TaskStatus to progress-fill CSS class (same mapping as statusPillClass). */
export function fillClass(status: TaskStatus): string {
  return statusPillClass(status)
}

/** Map TaskType to its ionicon component. */
export const typeIcons: Record<TaskType, Component> = {
  video: VideocamOutline,
  audio: MusicalNotesOutline,
  document: DocumentTextOutline,
  archive: ArchiveOutline,
  torrent: CloudDownloadOutline,
}
```

### 4.2 Create `apps/gui/src/components/task/TaskRow.vue`

Props:

```typescript
interface Props {
  task: Task
  rowIndex: number // for stagger animation CSS var --row-i
  selected: boolean // checkbox state
  keyboardSelected: boolean // j/k navigation highlight
  flashing: boolean // 180ms flash on row click
  menuOpen: boolean // aria-expanded for ⋯ button
}
```

Emits:

```typescript
emit('click', task: Task)                           // row body click
emit('toggleMenu', payload: { taskId: number; event: MouseEvent })  // ⋯ button click
emit('toggleSelect', taskId: number)                // checkbox change
```

Exposed:

```typescript
defineExpose({ scrollIntoView }) // for parent's keyboard scroll-into-view
```

Template: the entire `<tr>...</tr>` block (currently TaskTable lines 264-341), adapted to use props instead of parent state:

- `:class="{ selected: keyboardSelected, 'row-flash': flashing }"`
- `:style="{ '--row-i': rowIndex }"`
- `@click="emit('click', task)"`
- Checkbox `<td>`: `:checked="selected"` `@change="emit('toggleSelect', task.id)"`
- Name `<td>`: uses `typeIcons[task.type]` from task-utils
- Source `<td>`: uses `formatSource(task.source)` from task-utils
- Status `<td>`: uses `statusPillClass(task.status)` + `statusLabel(task.status)`
- Progress `<td>`: uses `fillClass(task.status)`
- Actions `<td>`: `:aria-expanded="menuOpen"` `@click.stop="emit('toggleMenu', { taskId: task.id, event: $event })"`

Styles: all row-specific CSS from TaskTable (row hover/selected/flash, cell typography, status pills, progress bar, actions button, `rowReveal` + `shimmer` keyframes, reduced-motion overrides for these elements).

### 4.3 Refactor `apps/gui/src/components/task/TaskTable.vue`

**Script changes:**

- Delete: `formatSource`, `statusPillClass`, `statusLabel`, `fillClass`, `typeIcons` (moved to task-utils)
- Delete: NIcon + ionicon imports (no longer used directly — TaskRow uses them via task-utils)
- Keep: all state (`flashingRowId`, `openMenuId`, `rowRefs`, `sortField`, `sortDir`)
- Keep: all computeds (`filteredTasks`, `displayTasks`, `allSelected`, `someSelected`)
- Keep: `toggleSort`, `handleRowClick`, `handleMenuToggle`, keyboard scroll watch
- Update: `rowRefs` type becomes `Array<{ scrollIntoView(options?: ScrollIntoViewOptions) => void } | null>`
- Add: `import TaskRow from './TaskRow.vue'`

**Template changes:**

- `<thead>` stays verbatim
- `<tbody>` becomes:

```vue
<tbody id="taskTableBody">
  <TaskRow
    v-for="(task, i) in displayTasks"
    :key="task.id"
    :ref="(el) => { rowRefs.value[i] = el as { scrollIntoView(o?: ScrollIntoViewOptions) => void } | null }"
    :task="task"
    :row-index="i"
    :selected="selectedIds.has(task.id)"
    :keyboard-selected="keyboardIndex === i"
    :flashing="flashingRowId === task.id"
    :menu-open="openMenuId === task.id"
    @click="handleRowClick"
    @toggle-menu="(p) => handleMenuToggle(p.taskId, p.event)"
    @toggle-select="(id) => emit('toggleSelect', id)"
  />
</tbody>
```

**Style changes:**

- Keep: wrapper, filter-tab (may be dead — out of scope), table, thead, th, sort-arrow styles
- Convert column-width selectors to `:deep()`: `.task-table :deep(.col-name) { width: 25%; }` etc.
- Delete: all row-level styles (moved to TaskRow)
- Delete: `rowReveal` + `shimmer` keyframes (moved to TaskRow)
- Delete: status pill, progress bar, task-row-menu styles (moved to TaskRow)
- Keep: reduced-motion for table-level; move row/progress-specific reduced-motion to TaskRow

**Estimated result:** TaskTable ~580-620 lines (script ~170, template ~50, styles ~380). TaskRow ~200 lines. task-utils ~50 lines.

---

## 5. Testing Strategy

### Existing tests — must remain green

| File                                               | Tests  | Why unaffected                                                                                                                            |
| -------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/gui/src/__tests__/e2e-download-flow.test.ts` | varies | Exercises the download lifecycle through the store, not through TaskTable rendering directly. TaskRow is an internal detail of TaskTable. |
| All other `apps/gui/src/__tests__/*.test.ts`       | 700+   | None import or test TaskTable directly.                                                                                                   |

### New tests

None. Adding unit tests for TaskRow is a separate effort (would require Vue Test Utils setup for component testing — currently the repo's tests are store/composable level, not component rendering level).

### Manual verification (recommended)

The implementer should verify (mentally or by reading) that:

1. The `v-for` + `:key` + `:ref` pattern produces the same DOM as the original `<tr v-for>`.
2. Event names match exactly (camelCase in emits, kebab-case in template `@toggle-menu`).
3. CSS `:deep()` selectors match the exact class names used in TaskRow.

---

## 6. Verification Gates

| Check             | Command                                                                               | Expected                       |
| ----------------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| TypeScript strict | `pnpm typecheck` (workspace, 5 packages)                                              | 0 errors                       |
| Unit tests        | `pnpm test` (workspace)                                                               | All existing tests green (702) |
| ESLint            | `pnpm lint` (workspace)                                                               | 0 errors, 0 warnings           |
| Rust              | (not touched)                                                                         | —                              |
| File size         | `wc -l apps/gui/src/components/task/TaskTable.vue`                                    | < 700 (down from 860)          |
| New files exist   | `ls apps/gui/src/components/task/TaskRow.vue apps/gui/src/shared/utils/task-utils.ts` | Both exist                     |

---

## 7. Execution Strategy

**Single PR**, 3 commits:

| #   | Commit message                                                                    | Files                                                                                                 |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `refactor(gui): extract task display helpers to task-utils.ts`                    | New: `apps/gui/src/shared/utils/task-utils.ts`                                                        |
| 2   | `refactor(gui): extract TaskRow component from TaskTable`                         | New: `apps/gui/src/components/task/TaskRow.vue`. Modify: `apps/gui/src/components/task/TaskTable.vue` |
| 3   | _(only if needed)_ `style(gui): fix :deep column widths after TaskRow extraction` | `TaskTable.vue` (style adjustments)                                                                   |

Commits 2 and 3 may merge if the `:deep()` conversion is straightforward. The implementer has discretion.

**Branch name:** `refactor/a3a-tasktable-split`

---

## 8. Risks & Rollback

| Risk                                                                              | Likelihood | Impact                                 | Mitigation                                                                                                              |
| --------------------------------------------------------------------------------- | ---------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Scoped CSS `:deep()` doesn't reach TaskRow cells, breaking column alignment       | Medium     | Visual regression (columns misaligned) | Implementer must verify `:deep()` selector pattern. If it fails, duplicate column-width CSS in TaskRow as fallback.     |
| `defineExpose({ scrollIntoView })` not reachable from TaskTable's `:ref` callback | Low        | Keyboard j/k scroll stops working      | Vue 3 supports `defineExpose` + parent `:ref` pattern natively. If it fails, TaskRow can expose the root ref directly.  |
| Event payload shape mismatch (`{ taskId, event }` vs positional args)             | Low        | Menu button stops working              | TypeScript types enforce the shape. Implementer verifies against existing handler signatures.                           |
| Animation regression (stagger reveal, flash, shimmer)                             | Low        | Visual regression                      | All animation CSS moves to TaskRow verbatim. `--row-i` CSS var passed via prop.                                         |
| Performance: 100+ TaskRow component instances                                     | Very low   | Render lag on large task lists         | Vue 3's reactivity + `v-for` + child components is well-optimized. Naive UI and Element Plus use this pattern at scale. |

**Rollback:** Single PR → `git revert`. No data change, no API change, no migration.

---

## 9. Acceptance Criteria

1. `pnpm typecheck` reports 0 errors across all 5 packages.
2. `pnpm test` reports 702 tests passing (no regression).
3. `pnpm lint` reports 0 errors, 0 warnings.
4. `wc -l apps/gui/src/components/task/TaskTable.vue` reports < 700 lines.
5. `test -f apps/gui/src/components/task/TaskRow.vue` succeeds.
6. `test -f apps/gui/src/shared/utils/task-utils.ts` succeeds.
7. `grep -c "formatSource\|statusPillClass\|statusLabel\|fillClass\|typeIcons" apps/gui/src/components/task/TaskTable.vue` returns 0 (all helpers extracted).
8. `grep -c "defineExpose" apps/gui/src/components/task/TaskRow.vue` returns ≥ 1 (scrollIntoView exposed).

---

## 10. Follow-up (not in this spec)

- **A3b: DetailPanel.vue split** — extract FileSelector, SpeedChart, TaskActions, Timeline
- **A3c: TaskFirstView.vue split** — extract LayoutShell, ChatBar, ToastManager, SearchModal
- **Unit tests for TaskRow** — requires Vue Test Utils component-rendering test setup
- **Dead CSS cleanup** — TaskTable's `empty-state` / `state-banner` styles may belong to EmptyState.vue or be dead; investigate separately
- **`filter-tab` styles in TaskTable** — FilterTabs.vue is a separate component; these styles in TaskTable may be dead

---

## 11. References

- `AUDIT-REPORT.md` P1-4 (oversized components)
- `apps/gui/src/components/task/TaskTable.vue` — source file (860 lines)
- `apps/gui/src/views/TaskFirstView.vue:27,955` — sole consumer
- `apps/gui/src/components/task/FilterTabs.vue` — already-extracted sibling (precedent for split pattern)
- `apps/gui/src/components/task/RowMenu.vue` — already-extracted sibling
- Vue 3 `:deep()` documentation for scoped style penetration
