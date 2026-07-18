# C3 — Responsive Breakpoints (P1-9)

**Branch:** `feature/c3-responsive-breakpoints` | **Base:** `d641e1d`

## Problem

`@media (max-width: 600px)` in main.css is dead code (Tauri minWidth=720). No breakpoint active in the 720-900px range. At narrow window widths, the 8-column table is cramped.

## Fix (3 files, ~30 lines CSS)

### 1. TaskTable.vue

Add `@media (max-width: 900px)`:

```css
@media (max-width: 900px) {
  .task-table th.col-source,
  .task-table :deep(td.col-source) {
    display: none;
  }
  .task-table th,
  .task-table :deep(td) {
    padding-left: 8px;
    padding-right: 8px;
  }
}
```

### 2. TaskRow.vue

Add matching hide rule:

```css
@media (max-width: 900px) {
  .col-source {
    display: none;
  }
  td {
    padding-left: 8px;
    padding-right: 8px;
  }
}
```

### 3. main.css

Update `@media (max-width: 600px)` → `@media (max-width: 768px)` (merge with existing 768px rule or update threshold).

## Out of scope

- Table→card conversion (not needed at 720px min)
- ChromeBar/BottomChat (already work at 720px)
- SettingsView (flex layout wraps naturally)
