# Feature: Icon System Standardization

> **Audit Ref**: P2-9
> **Priority**: P2 — Visual consistency
> **Estimate**: 3-4 hours
> **Risk**: Low (mechanical replacement)

## Problem

The codebase uses two icon systems simultaneously:

1. `@vicons/ionicons5` — imported in 10 files (the intended standard)
2. Inline `<svg>` — 30 occurrences across 12 files

Files with inline SVGs:

| File                  | Inline SVG count               |
| --------------------- | ------------------------------ |
| `DetailPanel.vue`     | 11                             |
| `RowMenu.vue`         | 5                              |
| `ChromeBar.vue`       | 4                              |
| `BottomChat.vue`      | 2                              |
| `ToastStack.vue`      | 2                              |
| `SpeedChart.vue`      | 1                              |
| `OnboardingCard.vue`  | 1                              |
| `TaskTable.vue`       | 1                              |
| `UiIcon.vue`          | 1 (this is the wrapper — keep) |
| `UiModal.vue`         | 1                              |
| `TaskDetailModal.vue` | 1                              |
| `App.vue`             | 1                              |

Additionally, icon sizes are inconsistent: 14px, 16px, 18px, 20px, 24px without tokens.

## Goal

All icons use `@vicons/ionicons5` via the existing `UiIcon.vue` wrapper. No inline `<svg>` in component templates (except `UiIcon.vue` itself and `SpeedChart.vue` which renders data, not icons).

## Implementation Plan

### Step 1: Map inline SVGs to ionicons5 equivalents (1h)

For each inline SVG, find the equivalent `@vicons/ionicons5` icon:

- Close X → `CloseOutline`
- Settings gear → `SettingsOutline`
- Play/Pause → `PlayOutline` / `PauseOutline`
- etc.

Create a mapping table in this doc.

### Step 2: Replace inline SVGs (2h)

For each file, replace `<svg>...</svg>` with `<NIcon><SomeIcon /></NIcon>` or `<UiIcon name="some-icon" />`.

### Step 3: Add icon size tokens (0.5h)

Add to `tokens.css`:

```css
--icon-xs: 14px;
--icon-sm: 16px;
--icon-md: 20px;
--icon-lg: 24px;
```

Replace hardcoded `width="16"` etc. with `style="width: var(--icon-sm)"`.

### Step 4: Verify (0.5h)

- `grep -c "<svg" apps/gui/src/**/*.vue` — only UiIcon.vue and SpeedChart.vue remain
- Visual diff: all icons render correctly at consistent sizes

## Verification

- `pnpm typecheck` + `pnpm test` pass
- `grep -rn "<svg" apps/gui/src --include="*.vue"` returns only UiIcon.vue and SpeedChart.vue
