# Feature: Cross-Package Type/Config Unification

> **Audit Ref**: P1-1, P1-13
> **Priority**: P1 — Architecture integrity
> **Estimate**: 4-6 hours
> **Risk**: Medium (cross-package refactor, potential cascade)

## Problem

The GUI (`apps/gui/src/stores/config.ts`) manually duplicates `AppConfig`, `ScheduleRule`, `DiskThresholds`, `SubtitlesConfig`, `UiConfig`, and `DEFAULT_CONFIG` from `packages/core/src/types.ts` and `packages/core/src/config/loader.ts`. The two copies have already drifted:

- Core uses `join(homedir(), 'Downloads', 'Motrix AI')` (absolute path)
- GUI uses `'~/Downloads/Motrix AI'` (tilde-relative string)
- Core adds `schemaVersion: 3` to config on disk; GUI's type has no such field
- `useSchedule.ts` defines `ScheduleRule` locally with an explicit comment: _"defined locally because @motrix-ai/core is not currently a dependency"_

## Goal

GUI imports types and config from `@motrix-ai/core` at the type level only (zero runtime coupling). No duplicated type definitions remain in the GUI.

## Implementation Plan

### Step 1: Import types via `import type`

Replace all locally-defined types in `config.ts` with:

```typescript
import type { AppConfig, ScheduleRule, DiskThresholds, SubtitlesConfig, UiConfig } from '@motrix-ai/core'
```

`import type` is erased at compile time — zero runtime dependency.

### Step 2: Import DEFAULT_CONFIG

```typescript
import { DEFAULT_CONFIG } from '@motrix-ai/core'
```

This IS a runtime import, but `@motrix-ai/core` is already a dependency of GUI (used for `createLogger`, `KeywordGenerator`).

### Step 3: Resolve path format discrepancy

Standardize on tilde-relative (`'~/Downloads/...'`) in DEFAULT_CONFIG, and expand `~` → `homedir()` at the point of use (the `resolveDownloadDir()` function in `tasks.ts` already does this).

### Step 4: Add `schemaVersion` to AppConfig type

Add `schemaVersion?: number` to `AppConfig` in `packages/core/src/types.ts`.

### Step 5: Update useSchedule.ts

Replace local `ScheduleRule` with `import type { ScheduleRule } from '@motrix-ai/core'`.

### Step 6: Delete duplicate type definitions

Remove ~80 lines of duplicate interfaces from `config.ts` and `useSchedule.ts`.

## Verification

- `pnpm typecheck` passes
- `pnpm test` — all 692 tests pass
- `grep -r "interface AppConfig" apps/gui/src/` returns 0 matches (type is imported, not defined)
- `grep -r "interface ScheduleRule" apps/gui/src/` returns 0 matches

## Risks

- If core's types have fields the GUI doesn't use, the GUI type narrows might break. Mitigate by checking all `config.value.*` access patterns.
- The `deepMerge` function is duplicated in both packages — keep both for now (different call sites), document the duplication.
