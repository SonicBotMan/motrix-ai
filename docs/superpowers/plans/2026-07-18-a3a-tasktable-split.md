# A3a TaskTable Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract TaskRow.vue (single-row renderer) and task-utils.ts (pure helpers) from TaskTable.vue, reducing it from 860 to ~600 lines. Zero behavior change for the sole consumer (TaskFirstView).

**Architecture:** TaskTable remains the container — owns all state (sort, selection, flashing, keyboard), filtering/sorting computeds, and the `<thead>`. TaskRow renders one `<tr>` with 9 cells, emitting raw events upstream. task-utils.ts holds pure display helpers (formatSource, statusPillClass, etc.) shared by both.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, naive-ui (NIcon), @vicons/ionicons5, Pinia stores.

## Global Constraints

- **Repo root:** `/home/h523034406/motrix-ai` (on branch `refactor/a3a-tasktable-split`)
- **Spec doc:** `docs/superpowers/specs/2026-07-18-a3a-tasktable-split-design.md` (committed at `5c73200`)
- **Baseline commit:** `e57fbae` (main, post-A2b)
- TypeScript strict mode. No `any`, no `eslint-disable`.
- Tests run from workspace root: `pnpm test <filter>`. Per-package test doesn't work.
- Typecheck/lint per-package: `pnpm --filter @motrix-ai/gui typecheck` / `lint` — or workspace-wide `pnpm typecheck` / `pnpm lint`.
- Conventional commit messages; one commit per task.
- Run all `pnpm` commands from repo root unless step says otherwise.

---

### Task 1: Create `task-utils.ts` and `TaskRow.vue`

**Files:**

- Create: `apps/gui/src/shared/utils/task-utils.ts`
- Create: `apps/gui/src/components/task/TaskRow.vue`

**Interfaces:**

- Consumes: `Task`, `TaskStatus`, `TaskType` types from `@/stores/tasks`; ionicons5 icon components
- Produces: `formatSource`, `statusPillClass`, `statusLabel`, `fillClass`, `typeIcons` exports (task-utils); `TaskRow` Vue component with props/emits/exposed per spec §4.2

- [ ] **Step 1: Create `task-utils.ts`**

Write to `apps/gui/src/shared/utils/task-utils.ts` the exact content from spec §4.1 (reproduced in the task brief). This is a pure-data file with 5 exports.

- [ ] **Step 2: Create `TaskRow.vue` script section**

Create `apps/gui/src/components/task/TaskRow.vue` with:

```vue
<script setup lang="ts">
/**
 * TaskRow — single task row for TaskTable's <tbody>.
 *
 * Renders a <tr> with 9 cells: checkbox, name+icon, source, status pill,
 * progress bar, speed, size, ETA, actions button.
 *
 * Visual state (selected/flashing/menu-open) is passed as props — TaskRow
 * does NOT own cross-row state. Click events are emitted raw; the flash
 * animation coordination stays in TaskTable (single-row-at-a-time).
 *
 * Exposes scrollIntoView() for TaskTable's keyboard j/k navigation.
 */

import { ref } from 'vue'
import { NIcon } from 'naive-ui'
import type { Task } from '@/stores/tasks'
import { formatSource, statusPillClass, statusLabel, fillClass, typeIcons } from '@/shared/utils/task-utils'

interface Props {
  task: Task
  rowIndex: number
  selected: boolean
  keyboardSelected: boolean
  flashing: boolean
  menuOpen: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: [task: Task]
  toggleMenu: [payload: { taskId: number; event: MouseEvent }]
  toggleSelect: [taskId: number]
}>()

// Root <tr> ref — exposed for parent's keyboard scrollIntoView.
const rootRef = ref<HTMLTableRowElement | null>(null)

function scrollIntoView(options?: ScrollIntoViewOptions): void {
  rootRef.value?.scrollIntoView(options)
}

defineExpose({ scrollIntoView })
</script>
```

- [ ] **Step 3: Add `TaskRow.vue` template section**

Append after `</script>`:

```vue
<template>
  <tr
    :ref="rootRef"
    :data-task-id="task.id"
    :style="{ '--row-i': rowIndex }"
    :class="{
      selected: keyboardSelected,
      'row-flash': flashing,
    }"
    @click="emit('click', task)"
  >
    <!-- Checkbox -->
    <td class="col-check" @click.stop>
      <input type="checkbox" :checked="selected" @change="emit('toggleSelect', task.id)" />
    </td>

    <!-- Name -->
    <td class="col-name">
      <div class="col-name-inner">
        <NIcon class="task-type-icon" :component="typeIcons[task.type]" :size="14" aria-hidden="true" />
        <span class="task-name-text">{{ task.name }}</span>
      </div>
    </td>

    <!-- Source -->
    <td class="col-source">{{ formatSource(task.source) }}</td>

    <!-- Status pill -->
    <td class="col-status">
      <span class="status-pill" :class="statusPillClass(task.status)">
        {{ statusLabel(task.status) }}
      </span>
    </td>

    <!-- Progress -->
    <td class="col-progress">
      <div class="col-progress-inner">
        <div class="task-progress">
          <div class="task-progress-fill" :class="fillClass(task.status)" :style="{ width: task.progress + '%' }" />
        </div>
        <span class="task-progress-pct">{{ task.progress }}%</span>
      </div>
    </td>

    <!-- Speed -->
    <td class="col-speed">
      <span v-if="task.status === 'downloading'">{{ task.speed }}</span>
      <span v-if="task.status === 'downloading' && task.uploadSpeed" class="upload-speed">↑{{ task.uploadSpeed }}</span>
      <span v-if="task.status !== 'downloading'">{{ '\u00B7' }}</span>
    </td>

    <!-- Size -->
    <td class="col-size">{{ task.size }}</td>

    <!-- ETA -->
    <td class="col-eta">{{ task.eta || '\u2014' }}</td>

    <!-- Actions -->
    <td class="col-actions">
      <button
        type="button"
        class="task-row-menu"
        title="Row actions"
        aria-label="Open task actions menu"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        @click.stop="emit('toggleMenu', { taskId: task.id, event: $event })"
      >
        &#8943;
      </button>
    </td>
  </tr>
</template>
```

- [ ] **Step 4: Add `TaskRow.vue` style section**

Append the `<style scoped>` block. Move ALL row-level styles from TaskTable.vue (lines 493-526 for rows, 530-587 for cells, 591-630 for status pills, 634-709 for progress bar, 713-750 for actions, 502-511 rowReveal keyframe, 682-689 shimmer keyframe, 843-858 reduced-motion for rows/progress). The exact CSS to move (reproduced from current TaskTable.vue):

```vue
<style scoped>
/* --- Row --- */
.task-table tbody tr {
  /* Note: TaskRow renders <tr> directly (no .task-table tbody ancestor in scope).
     These styles target the <tr> root element via the component's own scoping. */
  min-height: var(--row-height, 56px);
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  animation: rowReveal 220ms var(--ease-default, cubic-bezier(0.2, 0.8, 0.2, 1)) backwards;
  animation-delay: calc(var(--row-i, 0) * 28ms);
  transition: background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

/* IMPORTANT: TaskRow's root is <tr>, not inside .task-table tbody.
   Rewrite selectors to target the <tr> directly. */

tr {
  min-height: var(--row-height, 56px);
  cursor: pointer;
  border-bottom: 1px solid var(--border);
  animation: rowReveal 220ms var(--ease-default, cubic-bezier(0.2, 0.8, 0.2, 1)) backwards;
  animation-delay: calc(var(--row-i, 0) * 28ms);
  transition: background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

tr:hover {
  background: var(--primary-subtle);
}

tr.selected {
  background: var(--primary-muted);
  box-shadow: inset 2px 0 0 0 var(--primary);
}

tr.row-flash {
  background: var(--primary-muted);
  transform: scale(1.005);
  transition: all 180ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

@keyframes rowReveal {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* --- Cells --- */
td {
  padding: 0 var(--space-3, 12px);
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--fg);
  vertical-align: middle;
  overflow: hidden;
}

.col-name-inner {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
  overflow: hidden;
}

.task-type-icon {
  flex-shrink: 0;
  color: var(--fg-tertiary);
}

.task-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  min-width: 0;
}

.col-source {
  color: var(--fg-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-speed,
.col-size,
.col-eta,
.task-progress-pct {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
  white-space: nowrap;
}

.col-speed,
.col-size,
.col-eta {
  color: var(--fg-secondary);
}

.upload-speed {
  display: block;
  font-size: 11px;
  opacity: 0.6;
}

/* --- Status pills --- */
.status-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  padding: 0 var(--space-2, 8px);
  font-family: var(--font-ui);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  border-radius: var(--radius-full, 9999px);
  white-space: nowrap;
}

.status-pill.downloading {
  background: var(--primary-muted);
  color: var(--primary);
}

.status-pill.paused {
  background: var(--warning-muted);
  color: var(--warning);
}

.status-pill.completed {
  background: var(--accent-muted);
  color: var(--accent);
}

.status-pill.error,
.status-pill.failed {
  background: var(--error-muted);
  color: var(--error);
}

.status-pill.pending {
  background: var(--surface-hover);
  color: var(--fg-tertiary);
}

/* --- Progress bar --- */
.col-progress-inner {
  display: flex;
  align-items: center;
  gap: var(--space-2, 8px);
}

.task-progress {
  flex: 1;
  height: 6px;
  background: var(--border);
  border-radius: var(--radius-full, 9999px);
  overflow: hidden;
  position: relative;
}

.task-progress-fill {
  height: 100%;
  border-radius: var(--radius-full, 9999px);
  position: relative;
  transition: width 300ms var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.task-progress-fill.downloading {
  background: linear-gradient(
    90deg,
    var(--primary) 0%,
    var(--primary) 40%,
    var(--primary-hover) 50%,
    var(--primary) 60%,
    var(--primary) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}

.task-progress-fill.downloading::after {
  content: '';
  position: absolute;
  inset: 0;
  background: inherit;
  background-size: 200% 100%;
  animation: shimmer 2s linear infinite;
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.task-progress-fill.paused {
  background: var(--warning);
}

.task-progress-fill.completed {
  background: var(--accent);
}

.task-progress-fill.error,
.task-progress-fill.failed {
  background: var(--error);
}

.task-progress-pct {
  font-size: 12px;
  color: var(--fg-secondary);
  min-width: 36px;
  text-align: right;
}

/* --- Actions (row menu) --- */
.col-actions {
  text-align: right;
  white-space: nowrap;
}

.task-row-menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--fg-muted);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  border-radius: var(--radius-xs, 6px);
  opacity: 0.7;
  transition:
    opacity var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    color var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1)),
    background var(--transition-fast, 150ms) var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
}

.task-row-menu:hover,
tr:hover .task-row-menu {
  opacity: 1;
  color: var(--fg);
}

.task-row-menu:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 3px;
  box-shadow: 0 0 0 6px var(--focus-ring-soft);
  opacity: 1;
}

/* --- Reduced motion --- */
@media (prefers-reduced-motion: reduce) {
  tr {
    animation: none !important;
  }

  tr.row-flash {
    transform: none;
  }

  .task-progress-fill.downloading,
  .task-progress-fill.downloading::after {
    animation: none !important;
  }

  .task-progress-fill {
    transition-duration: 0.01ms !important;
  }
}
</style>
```

**IMPORTANT NOTE on CSS selector rewrite:** The original TaskTable CSS uses `.task-table tbody tr` as the selector (reaching into the table structure). TaskRow renders a `<tr>` as its ROOT element — there is no `.task-table tbody` ancestor within TaskRow's scope. Therefore:

- `.task-table tbody tr` selectors become just `tr` (TaskRow's root)
- `.task-table tbody tr:hover` becomes `tr:hover`
- `.task-table tbody tr.selected` becomes `tr.selected`
- `.task-table td` becomes just `td`
- etc.

This is the key CSS adaptation. The styles are functionally identical — they just target the component's own elements directly instead of via the parent table's descendant selector.

- [ ] **Step 5: Run typecheck**

```bash
cd /home/h523034406/motrix-ai && pnpm typecheck
```

**Expected:** PASS with 0 errors across all 5 packages. The new files compile standalone (nothing imports TaskRow yet, but task-utils is self-contained and TaskRow's imports resolve).

If typecheck fails on `typeIcons` type (`Record<TaskType, Component>`): verify the `Component` import from `vue` is correct. If naive-ui's `NIcon :component` prop expects a different type, adjust the type annotation but keep the runtime values.

- [ ] **Step 6: Run lint**

```bash
cd /home/h523034406/motrix-ai && pnpm lint
```

**Expected:** PASS with 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
cd /home/h523034406/motrix-ai
git add apps/gui/src/shared/utils/task-utils.ts apps/gui/src/components/task/TaskRow.vue
git commit -m "refactor(gui): extract TaskRow component and task-utils

Creates apps/gui/src/shared/utils/task-utils.ts with pure display helpers
(formatSource, statusPillClass, statusLabel, fillClass, typeIcons)
extracted from TaskTable.vue's script.

Creates apps/gui/src/components/task/TaskRow.vue — single-row renderer
for TaskTable's <tbody>. Props: task, rowIndex, selected,
keyboardSelected, flashing, menuOpen. Emits: click, toggleMenu,
toggleSelect. Exposes scrollIntoView for parent keyboard navigation.

No behavior change — TaskRow is not yet wired into TaskTable (that lands
in the next commit). Styles adapted from TaskTable's row-level CSS,
targeting <tr>/<td> directly (TaskRow's root elements) instead of via
.task-table tbody descendant selectors.

Spec: docs/superpowers/specs/2026-07-18-a3a-tasktable-split-design.md §4.1, §4.2"
```

---

### Task 2: Refactor TaskTable.vue to use TaskRow

**Files:**

- Modify: `apps/gui/src/components/task/TaskTable.vue`

**Interfaces:**

- Consumes: `TaskRow` component (Task 1), nothing from task-utils directly (TaskTable no longer uses the extracted helpers)
- Produces: TaskTable's public API unchanged (same props, same emits)

- [ ] **Step 1: Update script — remove extracted helpers, add TaskRow import, update rowRefs type**

In `apps/gui/src/components/task/TaskTable.vue` `<script setup>`:

**Delete these imports (no longer used directly):**

```typescript
import { NIcon } from 'naive-ui'
import {
  VideocamOutline,
  MusicalNotesOutline,
  DocumentTextOutline,
  ArchiveOutline,
  CloudDownloadOutline,
} from '@vicons/ionicons5'
```

**Add TaskRow import** (after the existing FilterTabs/EmptyState imports, around line 38-39):

```typescript
import TaskRow from './TaskRow.vue'
```

**Delete these helper functions and constants** (moved to task-utils in Task 1):

- `formatSource` function (lines ~152-169)
- `statusPillClass` function (lines ~172-175)
- `statusLabel` function (lines ~178-187)
- `fillClass` function (lines ~190-192)
- `typeIcons` constant (lines ~196-202)

**Update rowRefs type** (line ~71):

```typescript
// Before:
const rowRefs = ref<Array<HTMLTableRowElement | null>>([])
// After:
const rowRefs = ref<Array<{ scrollIntoView(options?: ScrollIntoViewOptions) => void } | null>>([])
```

**Update the keyboard watch** (lines ~101-112) — the scrollIntoView call stays the same; just the type of rowRefs changed:

```typescript
watch(
  () => props.keyboardIndex,
  (idx) => {
    if (idx < 0) return
    void nextTick(() => {
      const row = rowRefs.value[idx]
      if (row && typeof row.scrollIntoView === 'function') {
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      }
    })
  },
)
```

(This is identical to the current code — the watch already calls `.scrollIntoView()` on the ref, which now goes through TaskRow's defineExpose instead of the DOM element directly.)

**Keep everything else in the script unchanged:** state refs (flashingRowId, openMenuId, sortField, sortDir), toggleSort, allSelected, someSelected, setRowRef, filteredTasks, displayTasks, handleRowClick, handleMenuToggle.

**Update setRowRef** to handle component refs instead of element refs:

```typescript
// Before:
const setRowRef = (el: Element | null | undefined, i: number) => {
  rowRefs.value[i] = (el as HTMLTableRowElement | null) ?? null
}
// After: (inline in template — see Step 2)
```

Actually, `setRowRef` can be removed entirely since the `:ref` callback will be inlined in the template (Step 2).

- [ ] **Step 2: Replace `<tbody>` template — use `<TaskRow>` instead of inline `<tr>`**

In the `<template>` section, replace the entire `<tbody>...</tbody>` block (lines ~263-343) with:

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
            @toggle-menu="(p: { taskId: number; event: MouseEvent }) => handleMenuToggle(p.taskId, p.event)"
            @toggle-select="(id: number) => emit('toggleSelect', id)"
          />
        </tbody>
```

Note: the `:ref` callback uses an inline cast because Vue 3's function-ref on a component gives the component proxy (which has the `scrollIntoView` method from `defineExpose`).

- [ ] **Step 3: Update styles — remove row-level CSS, convert column widths to `:deep()`**

In the `<style scoped>` section:

**Delete all row-level and cell-level styles** (these moved to TaskRow):

- `.task-table tbody tr` and all its variants (hover, selected, row-flash, animation)
- `@keyframes rowReveal`
- `.task-table td`
- `.col-name`, `.col-name-inner`, `.task-type-icon`, `.task-name-text` (visual styles — NOT width)
- `.col-source` (visual — NOT width)
- `.col-speed`, `.col-size`, `.col-eta`, `.task-progress-pct` (mono/font styles — NOT width)
- `.upload-speed`
- `.status-pill` and all variants
- `.col-progress`, `.col-progress-inner`, `.task-progress`, `.task-progress-fill` and all variants
- `@keyframes shimmer`
- `.task-progress-pct` (font-size/color — NOT width)
- `.col-actions` (text-align — keep width as :deep)
- `.task-row-menu` and its hover/focus variants
- Reduced-motion rules for `tbody tr`, `row-flash`, `task-progress-fill`

**Convert column-width selectors to `:deep()`:**

Replace these selectors (currently `.task-table .col-xxx { width: N%; }`):

```css
.task-table .col-check {
  width: 3%;
  text-align: center;
}
.task-table .col-name {
  width: 25%;
}
.task-table .col-source {
  width: 16%;
}
.task-table .col-status {
  width: 8%;
}
.task-table .col-progress {
  width: 17%;
}
.task-table .col-speed {
  width: 8%;
}
.task-table .col-size {
  width: 11%;
}
.task-table .col-eta {
  width: 7%;
}
.task-table .col-actions {
  width: 5%;
}
```

With `:deep()` versions (same widths, penetrates into TaskRow's scoped cells):

```css
.task-table :deep(.col-check) {
  width: 3%;
  text-align: center;
}
.task-table :deep(.col-name) {
  width: 25%;
}
.task-table :deep(.col-source) {
  width: 16%;
}
.task-table :deep(.col-status) {
  width: 8%;
}
.task-table :deep(.col-progress) {
  width: 17%;
}
.task-table :deep(.col-speed) {
  width: 8%;
}
.task-table :deep(.col-size) {
  width: 11%;
}
.task-table :deep(.col-eta) {
  width: 7%;
}
.task-table :deep(.col-actions) {
  width: 5%;
}
```

**Keep in TaskTable:** wrapper, filter-tab styles (may be dead — out of scope), table/thead/th styles, sortable/sort-arrow styles, empty-state styles (may be dead — out of scope), state-banner/spinner styles (may be dead — out of scope), table-level reduced-motion.

- [ ] **Step 4: Run typecheck**

```bash
cd /home/h523034406/motrix-ai && pnpm typecheck
```

**Expected:** PASS with 0 errors. Verify no unused imports remain (NIcon, ionicons5 icons should be gone from TaskTable).

- [ ] **Step 5: Run full test suite**

```bash
cd /home/h523034406/motrix-ai && pnpm test
```

**Expected:** PASS, 702 tests (unchanged from baseline — no new tests, no regressions).

- [ ] **Step 6: Run lint**

```bash
cd /home/h523034406/motrix-ai && pnpm lint
```

**Expected:** PASS with 0 errors, 0 warnings.

- [ ] **Step 7: Verify file size reduction**

```bash
wc -l apps/gui/src/components/task/TaskTable.vue
```

**Expected:** < 700 lines (down from 860).

- [ ] **Step 8: Verify no extracted helpers remain in TaskTable**

```bash
grep -c "formatSource\|statusPillClass\|statusLabel\|fillClass\|typeIcons" apps/gui/src/components/task/TaskTable.vue
```

**Expected:** 0 (all moved to task-utils).

- [ ] **Step 9: Commit**

```bash
cd /home/h523034406/motrix-ai
git add apps/gui/src/components/task/TaskTable.vue
git commit -m "refactor(gui): wire TaskRow into TaskTable, remove inline row rendering

Replaces TaskTable's inline <tbody><tr> block (80 lines, 9 cells per row)
with <TaskRow v-for> component instances. Deletes the extracted helpers
(formatSource, statusPillClass, statusLabel, fillClass, typeIcons) and
their ionicon imports from TaskTable's script.

Column-width CSS converted to :deep() selectors so they penetrate into
TaskRow's scoped cells (required for table-layout: fixed consistency).
All row-level visual styles (hover, selected, flash, animation, status
pills, progress bar, actions button) removed — they live in TaskRow now.

rowRefs type updated from HTMLTableRowElement[] to the component's
exposed { scrollIntoView } interface. Keyboard j/k scroll-into-view
behavior preserved via TaskRow's defineExpose.

Public API unchanged: TaskFirstView sees the same props/emits.

TaskTable: 860 → ~580 lines. TaskRow: ~200 lines. task-utils: ~50 lines.

Spec: docs/superpowers/specs/2026-07-18-a3a-tasktable-split-design.md §4.3"
```

---

### Final Verification (after both tasks)

- [ ] **Step 1: Quality gates**

```bash
cd /home/h523034406/motrix-ai
pnpm typecheck   # 0 errors across 5 packages
pnpm test        # 702 tests pass (no regression)
pnpm lint        # 0 errors, 0 warnings
```

- [ ] **Step 2: Acceptance criteria grep checks**

```bash
wc -l apps/gui/src/components/task/TaskTable.vue           # < 700
test -f apps/gui/src/components/task/TaskRow.vue           # exists
test -f apps/gui/src/shared/utils/task-utils.ts            # exists
grep -c "formatSource\|statusPillClass\|statusLabel\|fillClass\|typeIcons" apps/gui/src/components/task/TaskTable.vue  # 0
grep -c "defineExpose" apps/gui/src/components/task/TaskRow.vue  # ≥ 1
```

- [ ] **Step 3: Branch history**

```bash
git log --oneline main..HEAD
```

**Expected:** 3 commits (spec + Task 1 + Task 2).

---

## Self-Review

**1. Spec coverage:** All spec §4 items covered. §4.1 → Task 1 Step 1. §4.2 → Task 1 Steps 2-4. §4.3 → Task 2.

**2. Placeholder scan:** All code blocks contain runnable content. CSS is reproduced verbatim from current TaskTable.vue.

**3. Type consistency:** TaskRow props match what TaskTable passes. Emits match what TaskTable handles. task-utils signatures match what TaskRow imports.

**4. CSS adaptation note:** The key risk is the selector rewrite (`.task-table tbody tr` → `tr` in TaskRow). This is called out explicitly in Task 1 Step 4 with the IMPORTANT NOTE. The implementer must understand this adaptation.
