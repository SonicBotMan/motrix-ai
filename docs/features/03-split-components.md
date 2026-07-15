# Feature: Split Oversized Components

> **Audit Ref**: P1-4
> **Priority**: P1 — Maintainability
> **Estimate**: 16-24 hours (4 components × 4-6h each)
> **Risk**: High (behavioral regression risk, must preserve exact UX)

## Problem

Four files exceed 850 lines, violating single responsibility:

| File                | Lines | Mixed concerns                                                                                          |
| ------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| `DetailPanel.vue`   | 1128  | Task details + file selection + timeline + speed chart + peer list + keyboard shortcuts + aria2 options |
| `TaskFirstView.vue` | 1125  | Main layout + keyboard nav + toast system + chat input + search results + task actions                  |
| `TaskTable.vue`     | 864   | Table render + sorting + batch select + row menu + checkbox logic                                       |
| `useSettings.ts`    | 861   | Theme management + language management + 800-line translation dict + aria2 settings                     |

## Goal

No file exceeds 400 lines. Each extracted component is independently testable.

## Implementation Plan

### Component 1: DetailPanel.vue → 4 child components

Extract from DetailPanel (keeping the parent as orchestrator < 300 lines):

| New Component      | Extracted concerns                                        | Est. lines |
| ------------------ | --------------------------------------------------------- | ---------- |
| `FileSelector.vue` | File list + per-file checkboxes + toggle handler          | ~200       |
| `SpeedChart.vue`   | SVG speed sparkline + polling data                        | ~150       |
| `TaskActions.vue`  | Pause/Resume/Retry/Delete/Open-location buttons           | ~100       |
| `PeerList.vue`     | Peer count + expandable peer details (already added P1-8) | ~120       |

Parent DetailPanel becomes a layout shell that composes these children + manages the modal lifecycle.

### Component 2: TaskFirstView.vue → 4 child components

| New Component      | Extracted concerns                                      | Est. lines |
| ------------------ | ------------------------------------------------------- | ---------- |
| `ToastManager.vue` | Toast array + add/dismiss + auto-expire timers          | ~150       |
| `ChatBar.vue`      | Input + send handler + quick actions + magnet detection | ~200       |
| `SearchPanel.vue`  | Search results modal + subtitle search trigger          | ~250       |
| `TaskToolbar.vue`  | Filter tabs + sort + batch select bar                   | ~150       |

Parent TaskFirstView becomes a layout shell that composes children + manages keyboard shortcuts.

### Component 3: TaskTable.vue → extract composables

Keep TaskTable as the table renderer, extract logic to composables:

| New Composable      | Extracted logic                                          |
| ------------------- | -------------------------------------------------------- |
| `useTableSort.ts`   | Sort state + comparator functions + header click handler |
| `useBatchSelect.ts` | selectedIds Set + select-all + batch actions             |

### Component 4: useSettings.ts → extract translations

Move the 800-line `strings` dictionary to `locales/{lang}.ts` (overlaps with Feature 02). Keep `useSettings.ts` for theme/language/aria2-settings logic only (~150 lines).

## Execution Strategy

**Do one component at a time.** After each extraction:

1. Run `pnpm typecheck` — must pass
2. Run `pnpm test` — all 692 tests must pass
3. Manual verification: open the affected view, confirm no visual/behavioral regression

**Order**: useSettings (lowest risk) → TaskTable → DetailPanel → TaskFirstView (highest risk)

## Verification

- `find apps/gui/src -name "*.vue" -o -name "*.ts" | xargs wc -l | sort -rn | head -5` — no file > 400 lines
- All 692 tests pass
- Visual diff: app looks identical before/after refactoring

## Risks

- Vue scoped styles may break when template sections move to child components. Mitigate: move `<style>` blocks with the template sections.
- Event propagation between parent and extracted children. Use `defineEmits` + `defineProps` consistently.
- `provide/inject` may be needed for deeply nested actions. Prefer explicit props/events first.
