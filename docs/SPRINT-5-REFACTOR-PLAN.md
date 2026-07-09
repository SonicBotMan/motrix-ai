# Sprint 5 — Large File Refactor Plan

## Status

**Not started.** This document captures the analysis performed during Sprint 4 wrap-up so the actual refactor work in Sprint 5 has a concrete starting point — instead of starting from "these files are big, figure out how to split them".

## Background

The Sprint 4 audit identified 6 source files exceeding the 250-LOC ceiling defined in the project's engineering checklist. Sprint 4 deliberately **did not** refactor them, because:

1. None of the large files contain bugs — the work is purely structural.
2. Each refactor moves a lot of code across file boundaries, which needs careful test coverage to avoid regressions.
3. Sprint 4's higher-value work (1337x functional fix, Linux zombie power leak, dead-code removal, +54 new tests, i18n wiring, glib advisory triage) shipped first.

The ceiling is a guideline, not a hard rule. Some large files are large for good reasons (single responsibility, dense RPC surface). The plan below treats each file individually.

## Inventory (verified 2026-07-05 against `main` `da76d3e`)

| File                                           | LOC  | Verdict                | Why                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ---- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/gui/src/views/QueueView.vue`             | 1169 | **Refactor**           | Header / stats / filters / table / detail-modal are separable views; the file currently mixes them all.                                                                                                                                 |
| `apps/gui/src/components/task/DetailPanel.vue` | 1092 | **Refactor**           | Distinct sections (header / timeline / files list / metadata / actions menu) with clear boundaries.                                                                                                                                     |
| `apps/gui/src/views/TaskFirstView.vue`         | 877  | **Leave**              | Already decomposed into 7 child components (ChromeBar / TaskTable / DetailPanel / RowMenu / BottomChat / ToastStack / OnboardingCard / SearchResultsModal). The remaining 877 lines are mostly handlers and state — not template bloat. |
| `apps/gui/src/components/task/TaskTable.vue`   | 848  | **Refactor (partial)** | Extract `FilterTabs` and `EmptyState` sub-components; keep the table itself intact (it's a single cohesive component).                                                                                                                  |
| `apps/gui/src/views/SettingsView.vue`          | 768  | **Refactor**           | 6 NTabPanes with clear boundaries. Extract each tab to its own SFC.                                                                                                                                                                     |
| `apps/gui/src/composables/useAria2.ts`         | 562  | **Leave**              | Single responsibility (aria2 RPC client singleton). 562 lines is reasonable for a client that exposes 30+ RPC methods, reconnection logic, and process management. Splitting would just scatter related code.                           |

Total to refactor: **4 files** (QueueView, DetailPanel, TaskTable partial, SettingsView).
Total to leave: **2 files** (TaskFirstView, useAria2) — with documented justification.

## Pre-conditions (must be true before starting)

- [ ] `pnpm test` ≥ 700 passing (currently 682 — backfill `useAria2` happy-path tests first so the refactor has a regression net)
- [ ] `packages/core` coverage ≥ 90% (currently 88.9% per Sprint 4 audit; the +54 tests in PR #30 brought the three zero-coverage modules up)
- [ ] No open Sprint 4 follow-ups blocking `main`

## Execution plan (one PR per file)

Each refactor ships as its own PR. Order is by **lowest risk first**, so later PRs can build on validated patterns.

### PR-S5-1: SettingsView → 6 tab SFCs

**Why first**: clearest boundaries (each `NTabPane` is already self-contained), lowest cross-coupling.

- Extract `useLocalStorage` helper to `apps/gui/src/composables/useLocalStorage.ts` (already drafted in Sprint 4 — restore from `git show docs/sprint-5-refactor-plan` branch history if needed, or rewrite from SettingsView's local copy).
- Create:
  - `apps/gui/src/components/settings/AiModelTab.vue` (~120 LOC; depends on `useAIProvider`, `useOpenCode`, `useLocalStorage`)
  - `apps/gui/src/components/settings/DownloadsTab.vue` (~100 LOC; depends on `useAria2.changeGlobalOption` watcher)
  - `apps/gui/src/components/settings/SubtitlesTab.vue` (~80 LOC; uses `useLocalStorage`)
  - `apps/gui/src/components/settings/AppearanceTab.vue` (~30 LOC; uses `useSettings.theme/language`)
  - `apps/gui/src/components/settings/AdvancedTab.vue` (~80 LOC; uses `useLocalStorage` + `useAria2`)
- Keep `ScheduleConfig` and `NASConfig` as-is (already separate components).
- Rewrite `SettingsView.vue` as a thin shell: tab navigation + 6 imports. Target: ≤150 LOC.
- Each tab SFC owns its own state via `useLocalStorage`/`useSettings`/`useAIProvider` — no prop-drilling.

**Acceptance**: tab switching still works, all settings persist across restarts, all i18n keys still resolve.

### PR-S5-2: DetailPanel → header + timeline + files + metadata

**Why second**: clear section boundaries, but more cross-coupling than SettingsView (sections share the `task` prop and emit action events back).

- Create:
  - `apps/gui/src/components/task/detail/DetailHeader.vue` (title + status pill + close button)
  - `apps/gui/src/components/task/detail/DetailTimeline.vue` (progress events)
  - `apps/gui/src/components/task/detail/DetailFiles.vue` (file list with checkboxes)
  - `apps/gui/src/components/task/detail/DetailMetadata.vue` (size, source, dates)
  - `apps/gui/src/components/task/detail/DetailActions.vue` (pause/resume/retry/delete/open buttons)
- `DetailPanel.vue` becomes an orchestrator: receives `task`, distributes to children, bubbles events up.
- Target: `DetailPanel.vue` ≤ 250 LOC, each child ≤ 200 LOC.

**Acceptance**: every action button still works, keyboard navigation (Esc to close) preserved, file checkbox toggles still emit `toggle-file`.

### PR-S5-3: TaskTable → FilterTabs + EmptyState extraction

**Why third**: smallest delta. TaskTable stays a single component but delegates two sub-views.

- Create:
  - `apps/gui/src/components/task/FilterTabs.vue` (the All/Active/Paused/Completed/Failed strip)
  - `apps/gui/src/components/task/EmptyState.vue` (the "no tasks" / "connecting" / "engine offline" variants)
- TaskTable imports both and renders between its header and `<tbody>`.
- Target: TaskTable ≤ 500 LOC (was 848). FilterTabs ≤ 100 LOC. EmptyState ≤ 150 LOC.

**Acceptance**: filter switching still works, all three empty-state variants still render correctly.

### PR-S5-4: QueueView → header + stats + filters + table + detail-modal

**Why last**: largest file, most cross-coupling. Earlier PRs validate the patterns this one will lean on.

- Create:
  - `apps/gui/src/components/queue/QueueHeader.vue` (title + back button)
  - `apps/gui/src/components/queue/QueueStats.vue` (4 stat cards: total / active / completed / failed)
  - `apps/gui/src/components/queue/QueueToolbar.vue` (filters + bulk actions + search)
  - `apps/gui/src/components/queue/QueueTable.vue` (the row-of-tasks table)
  - Reuse existing `TaskDetailModal` for the detail overlay
- `QueueView.vue` becomes a coordinator that owns selection state and the search query.
- Target: QueueView ≤ 250 LOC, each child ≤ 200 LOC.

**Acceptance**: bulk pause/resume/remove still works, sort order preserved, search filter still applies.

## Test backfill required first

Before PR-S5-1, add component-level tests for `SettingsView` covering:

- tab switching renders the correct tab body
- changing each setting persists to localStorage
- changing maxConcurrent triggers aria2.changeGlobalOption

Before PR-S5-2/3/4, add component-level tests for `DetailPanel`, `TaskTable`, `QueueView` covering the happy paths that the refactor must preserve. Use `@vue/test-utils` (already in devDependencies).

Without these regression tests, the refactors are leap-of-faith. With them, the refactor is mechanical.

## Estimated effort

| PR                           | Files created             | Net LOC delta              | Effort       |
| ---------------------------- | ------------------------- | -------------------------- | ------------ |
| PR-S5-1 (SettingsView)       | 5 new SFCs + 1 composable | ~+150 (header boilerplate) | 1 day        |
| PR-S5-2 (DetailPanel)        | 5 new SFCs                | ~+200                      | 1 day        |
| PR-S5-3 (TaskTable partial)  | 2 new SFCs                | ~+50                       | 0.5 day      |
| PR-S5-4 (QueueView)          | 4 new SFCs                | ~+150                      | 1 day        |
| Test backfill (precondition) | 4 new test files          | ~+400                      | 1 day        |
| **Total**                    | **20 new files**          | **~+950 LOC**              | **4.5 days** |

The net LOC count goes **up** slightly (more boilerplate per file), but each individual file drops under the 250-LOC ceiling and gains a single clear responsibility. That's the actual goal — not raw line-count reduction.

## Out of scope for Sprint 5

- Splitting `useAria2.ts` — see verdict in the inventory table (single responsibility, no split recommended).
- Splitting `TaskFirstView.vue` — already well-decomposed via child components.
- Any non-structural changes (features, bug fixes, dependency bumps) — those go in their own PRs as usual.
