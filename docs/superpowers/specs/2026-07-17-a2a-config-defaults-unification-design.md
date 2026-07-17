# A2a — Config Defaults Unification (TS-only dedup)

**Date:** 2026-07-17
**Status:** Design — Pending Implementation
**Spec owner:** Maintainer
**Verified against:** `main` @ commit `c96ce23` (post-A1 squash merge)
**Parent initiative:** Sub-project A (Code Quality / Architecture) → A2 (type/config unification) → A2a slice

---

## 1. Problem Statement

The audit (`AUDIT-REPORT.md` P1-1, P1-13) flagged type/config duplication between GUI and `@motrix-ai/core`. Verification against current `main` shows the situation is **partially resolved but not complete**:

### Already resolved (no action required)

| Audit #      | Originally flagged                              | Current state                                                                                                                                                                                                                                                                              |
| ------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1-1 (types) | GUI manually mirrors type definitions from core | ✅ Resolved. `apps/gui/src/stores/config.ts:8-18` now uses `import type { AppConfig, AIProvider, ... } from '@motrix-ai/core'`. The audit's referenced comment ("Mirrors packages/core/src/types.ts AppConfig so the GUI does not depend on @motrix-ai/core at runtime") has been removed. |

### Still open (in scope for A2a)

| #   | File:line                                                                           | Issue                                                                                                                                                                                                                                                | Audit #                 |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1   | `apps/gui/src/stores/config.ts:37-97`                                               | GUI defines its own `DEFAULT_CONFIG` constant (~60 lines), duplicating the values in `packages/core/src/config/loader.ts:13-72`.                                                                                                                     | P1-1 (defaults portion) |
| 2   | `apps/gui/src/stores/config.ts:42-45` vs `packages/core/src/config/loader.ts:28-31` | Path-form divergence: GUI uses `~/Downloads/Motrix AI` (literal), core uses `join(homedir(), 'Downloads', 'Motrix AI')` (absolute). Same intent, different representation.                                                                           | P1-13 (path form)       |
| 3   | `apps/gui/src/stores/config.ts:37` (entire DEFAULT_CONFIG object)                   | GUI's `DEFAULT_CONFIG` lacks `schemaVersion`. Core's loader adds it via `deepMerge(DEFAULT_CONFIG, { schemaVersion: 3 })` at load. Rust's `default_config()` includes `"schemaVersion": 3` directly. Inconsistent handling across 3 implementations. | P1-13 (schemaVersion)   |

### Not in scope (deferred to A2b)

The following are **related but architecturally larger** issues discovered during A2a verification. They touch Rust code, change behavior, and require config-file migration — too big to bundle with this PR.

- **Subdir field semantics:** `movie_dir`, `software_dir`, `other_dir` default values are full paths (`~/Downloads/Motrix AI/Movies`) but `configured_subdir` (Rust, `fs.rs:61-82`) treats them as relative names. After `sanitize_path_component` replaces `/` with `_`, the actual directory created is `~_Downloads_Motrix AI_Movies` — files land in the wrong location. A2b will fix defaults to relative names (`"Movies"`, `"Software"`, etc.) and add Rust-side migration logic.
- **`configured_subdir` missing `~` expansion:** Unlike `configured_download_dir` (`mod.rs:103-111`) which expands `~`, the subdir helper does not.
- **Three-way duplication across languages:** Rust's `config.rs:9-42` also defines a `default_config()`. A2a only unifies the TS side. A2b will tackle Rust.

### Why this matters

- **Issue 1–3** are about single-source-of-truth. Three implementations of "what is the default config" (GUI TS, core TS, core Rust) are already drifting in path form and `schemaVersion` handling. Any future schema change requires updating 3 places, and the audit shows they have already drifted once.
- A2a eliminates the TS-side duplication and standardizes the canonical form (`~/...` paths in defaults, expanded at use sites). A2b will follow up with Rust-side fixes.

---

## 2. Scope

### In scope

- 4 TypeScript files modified/created:
  - **New:** `packages/core/src/config/defaults.ts` — browser-safe pure-data defaults
  - **Modify:** `packages/core/src/config/loader.ts` — import from `defaults.ts`, expand `~` for Node contexts
  - **Modify:** `packages/core/src/browser.ts` — re-export `DEFAULT_CONFIG` via browser entry
  - **Modify:** `apps/gui/src/stores/config.ts` — import from `@motrix-ai/core/browser`, delete local 60-line copy
- 1 new test file: `packages/core/src/__tests__/config-defaults.test.ts` — sanity test for `DEFAULT_CONFIG` shape
- Zero behavior change. GUI continues to see `~/...` paths (same as today). CLI/MCP continue to see absolute paths (same as today).

### Out of scope (explicit)

- A2b: subdir field semantics fix (`movie_dir` etc. become relative names)
- A2b: Rust-side `configured_subdir` `~` expansion
- A2b: Rust `config.rs` `default_config()` deduplication with TS defaults
- A2b: Existing-config-file migration logic
- Any Rust changes
- Any new dependencies
- Any change to `schemaVersion` handling semantics (stays: not in defaults, added at load)

---

## 3. Design Decision: Three-Layer Architecture

### Approach A (RECOMMENDED): defaults.ts + loader.ts re-expands

```
┌─────────────────────────────────────────────────┐
│ packages/core/src/config/defaults.ts            │ ← NEW. Pure data, browser-safe.
│   export const DEFAULT_CONFIG: AppConfig        │   Uses ~/ paths.
└─────────────────────────────────────────────────┘
            ↑                        ↑
            │                        │
   ┌────────┴────────┐      ┌────────┴──────────────────────┐
   │ loader.ts       │      │ browser.ts                    │
   │ (Node entry)    │      │ (Browser entry)               │
   │                 │      │                               │
   │ import + wrap   │      │ export { DEFAULT_CONFIG }     │
   │ with expandTilde│      │   from './config/defaults.js' │
   │ re-exports      │      │                               │
   └─────────────────┘      └───────────────────────────────┘
            ↑                        ↑
            │                        │
   ┌────────┴────────┐      ┌────────┴──────────────────────┐
   │ CLI / MCP       │      │ GUI config.ts                 │
   │ ( unchanged )   │      │                               │
   │ sees absolute   │      │ import { DEFAULT_CONFIG }     │
   │ paths           │      │   from '@motrix-ai/core/browser'
   └─────────────────┘      │ sees ~/ paths (unchanged)     │
                            │ deletes local 60-line copy    │
                            └───────────────────────────────┘
```

- Single source of truth: `defaults.ts`
- Node entry (`loader.ts`) wraps with `expandTilde()` to maintain absolute-path behavior for CLI/MCP
- Browser entry (`browser.ts`) re-exports verbatim — GUI gets `~/...` paths (same as today)
- Zero behavior change for any consumer

### Approach B (deferred fallback): defaults.ts only, all consumers expand

Rejected because it requires CLI/MCP code changes to handle `~` expansion at use sites. Currently those consumers rely on `loader.ts` to provide absolute paths. Approach A preserves that contract.

### Approach C (rejected): Keep loader.ts absolute defaults, add defaults.ts as separate copy

Doesn't eliminate duplication, just shifts it. Two sources of truth remain.

**Decision:** Approach A.

---

## 4. Implementation

### 4.1 Create `packages/core/src/config/defaults.ts`

Browser-safe (no `fs`/`os`/`path` imports). Values copied verbatim from current `loader.ts:13-72` but with path form changed to `~/...` (matching what GUI already uses).

```typescript
// config/defaults.ts — Default application configuration.
//
// Browser-safe: contains NO Node.js API imports. Paths use `~/` prefix;
// consumers expand via platform-specific homeDir():
//   - Node (CLI/MCP): expandTilde() in loader.ts uses os.homedir()
//   - GUI (Tauri): inherits `~/` form; Rust side expands at use sites
//     (configured_download_dir in mod.rs:103-111 already handles this)
//
// This is the SINGLE SOURCE OF TRUTH for default values. loader.ts and
// the GUI both derive from this file.

import type { AppConfig } from '../types.js'

export const DEFAULT_CONFIG: AppConfig = {
  ai: {
    provider: 'opencode',
    model: 'opencode/deepseek-v4-flash-free',
  },
  aria2: {
    rpc_url: 'http://127.0.0.1:6800/jsonrpc',
  },
  network: {
    http_proxy: '',
    https_proxy: '',
    ftp_proxy: '',
    no_proxy: '',
  },
  downloads: {
    base_dir: '~/Downloads/Motrix AI',
    movie_dir: '~/Downloads/Motrix AI/Movies',
    software_dir: '~/Downloads/Motrix AI/Software',
    other_dir: '~/Downloads/Motrix AI/Other',
    rename_template: '{title} ({year})/{title}.{quality}.{ext}',
  },
  schedule: {
    enabled: true,
    rules: [
      { name: 'Night Full Speed', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5 },
      { name: 'Daytime Throttle', time_start: '07:00', time_end: '18:00', speed_limit: 5_000_000, max_concurrent: 2 },
      { name: 'Evening Moderate', time_start: '18:00', time_end: '23:00', speed_limit: 10_000_000, max_concurrent: 3 },
    ],
  },
  disk: {
    enabled: true,
    thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 },
  },
  subtitles: {
    enabled: true,
    preferred_languages: ['zh', 'en'],
    sources: { shooter: true, subhd: true, opensubtitles: false },
    subtitle_dir: '~/Downloads/Motrix AI/Subtitles',
    opensubtitles_api_key: '',
    auto_search: true,
  },
  archive: {
    enabled: false,
    targets: [],
  },
  nas: {
    enabled: false,
    host: '192.168.1.100',
    port: '22',
    username: '',
    moviePath: '/volume1/Media/Movies',
    softwarePath: '/volume1/Software',
    musicPath: '/volume1/Music',
  },
  ui: {
    theme: 'dark',
    language: 'en',
    log_level: 'info',
  },
}
```

**Note on `schemaVersion`:** deliberately omitted. It's a migration marker injected at load time by `loader.ts` (Node) and `config.rs` (Rust), not a default value. Including it in defaults would conflate "what users start with" with "what version the schema is at".

### 4.2 Modify `packages/core/src/config/loader.ts`

Replace local DEFAULT_CONFIG definition with import + Node-side expansion.

**Before** (`loader.ts:1-72`, summary):

```typescript
import type { AppConfig } from '../types.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { migrateConfig } from './migrations.js'

const CONFIG_DIR = join(homedir(), '.motrix-ai')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export const DEFAULT_CONFIG: AppConfig = {
  ai: { provider: 'opencode', model: 'opencode/deepseek-v4-flash-free' },
  // ... 60 lines of defaults with absolute paths via join(homedir(), ...)
}
// ... loadConfig, saveConfig functions
```

**After:**

```typescript
import type { AppConfig } from '../types.js'
import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { migrateConfig } from './migrations.js'
import { DEFAULT_CONFIG as DEFAULTS_WITH_TILDE } from './defaults.js'

const CONFIG_DIR = join(homedir(), '.motrix-ai')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

/** Expand a `~/...` (or `~\...` on Windows) path to an absolute path. */
function expandTilde(p: string): string {
  if (p === '~') return homedir()
  if (p.startsWith('~/')) return join(homedir(), p.slice(2))
  if (p.startsWith('~\\')) return join(homedir(), p.slice(2))
  return p
}

/** Apply tilde expansion to all path-bearing fields of an AppConfig. */
function expandPaths<T extends AppConfig>(config: T): T {
  return {
    ...config,
    downloads: {
      ...config.downloads,
      base_dir: expandTilde(config.downloads.base_dir),
      movie_dir: expandTilde(config.downloads.movie_dir),
      software_dir: expandTilde(config.downloads.software_dir),
      other_dir: expandTilde(config.downloads.other_dir),
    },
    subtitles: {
      ...config.subtitles,
      subtitle_dir: config.subtitles.subtitle_dir ? expandTilde(config.subtitles.subtitle_dir) : undefined,
    },
  }
}

/**
 * DEFAULT_CONFIG for Node contexts (CLI, MCP server). Path fields are
 * tilde-expanded via os.homedir() so CLI/MCP consumers can use them
 * directly without re-expanding. Browser contexts (GUI) should import
 * from @motrix-ai/core/browser instead, which exports the raw `~/` form.
 */
export const DEFAULT_CONFIG: AppConfig = expandPaths(DEFAULTS_WITH_TILDE)

// ... loadConfig, saveConfig functions unchanged
```

The `loadConfig` and `saveConfig` functions remain verbatim — they already use `DEFAULT_CONFIG` and continue working.

### 4.3 Modify `packages/core/src/browser.ts`

Add one re-export line.

**Before** (`browser.ts` last lines, abbreviated):

```typescript
export {
  searchAll,
  DuckDuckGoSearchProvider,
  MikanSearchProvider,
  NyaaSearchProvider,
  BtdigSearchProvider,
} from './search/provider.js'
export type { SearchProvider } from './search/provider.js'
```

**After** (append):

```typescript
export {
  searchAll,
  DuckDuckGoSearchProvider,
  MikanSearchProvider,
  NyaaSearchProvider,
  BtdigSearchProvider,
} from './search/provider.js'
export type { SearchProvider } from './search/provider.js'

// Default config values (browser-safe — no Node.js APIs).
// Path fields use `~/` prefix; Rust side expands at use sites.
export { DEFAULT_CONFIG } from './config/defaults.js'
```

### 4.4 Modify `apps/gui/src/stores/config.ts`

Replace local DEFAULT_CONFIG definition with import from `@motrix-ai/core/browser`.

**Before** (`config.ts:1-97`, summary):

```typescript
import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import type { AppConfig, AIProvider, ... } from '@motrix-ai/core'

// Re-export types for convenience
export type { AppConfig, AIProvider, ... }

// Defaults
export const DEFAULT_CONFIG: AppConfig = {
  // ... 60 lines of defaults
}

// Helpers, store definition
```

**After:**

```typescript
import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'
import type {
  AppConfig,
  AIProvider,
  ResourceType,
  Quality,
  ScheduleRule,
  DiskThresholds,
  ArchiveTarget,
  SubtitlesConfig,
  UiConfig,
} from '@motrix-ai/core'
import { DEFAULT_CONFIG as CORE_DEFAULT_CONFIG } from '@motrix-ai/core/browser'

// Re-export types for convenience — components import from here
export type {
  AppConfig,
  AIProvider,
  ResourceType,
  Quality,
  ScheduleRule,
  DiskThresholds,
  ArchiveTarget,
  SubtitlesConfig,
  UiConfig,
}

// Re-export DEFAULT_CONFIG for convenience (single source of truth: @motrix-ai/core).
export const DEFAULT_CONFIG = CORE_DEFAULT_CONFIG

// Helpers, store definition unchanged
```

**Note:** GUI keeps the named re-export `DEFAULT_CONFIG` from this module so existing imports throughout the GUI (e.g., `import { DEFAULT_CONFIG } from '@/stores/config'`) continue to work without touching every call site. The local 60-line definition (lines 37-97) is removed entirely.

The `deepMerge` and `deepClone` helpers (lines 103-124) stay — they are still used by the store internals and are not duplicated from core (core has its own `deepMerge` in loader.ts, but they are not shared; A2a does not change this).

### 4.5 Create `packages/core/src/__tests__/config-defaults.test.ts`

Sanity test that `DEFAULT_CONFIG`:

1. Has the expected top-level shape (all required AppConfig sections)
2. Path fields use `~/` prefix (the canonical browser form)
3. Is structurally immutable (a frozen-object check would be nice, but TypeScript `const` already prevents reassignment; we settle for shape assertion)

```typescript
// __tests__/config-defaults.test.ts — Sanity test for DEFAULT_CONFIG.
//
// Validates that the single source of truth for default config values
// has the expected shape and that path-bearing fields use the canonical
// `~/` form (consumers expand via platform-specific homeDir()).

import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '../config/defaults.js'
import type { AppConfig } from '../types.js'

describe('DEFAULT_CONFIG', () => {
  it('contains all required top-level sections', () => {
    const requiredKeys: (keyof AppConfig)[] = [
      'ai',
      'aria2',
      'network',
      'downloads',
      'schedule',
      'disk',
      'subtitles',
      'archive',
      'nas',
      'ui',
    ]
    for (const key of requiredKeys) {
      expect(DEFAULT_CONFIG).toHaveProperty(key)
    }
  })

  it('uses ~/ prefix for all download path fields (browser-safe canonical form)', () => {
    expect(DEFAULT_CONFIG.downloads.base_dir).toMatch(/^~\//)
    expect(DEFAULT_CONFIG.downloads.movie_dir).toMatch(/^~\//)
    expect(DEFAULT_CONFIG.downloads.software_dir).toMatch(/^~\//)
    expect(DEFAULT_CONFIG.downloads.other_dir).toMatch(/^~\//)
  })

  it('uses ~/ prefix for subtitle_dir when present', () => {
    if (DEFAULT_CONFIG.subtitles.subtitle_dir) {
      expect(DEFAULT_CONFIG.subtitles.subtitle_dir).toMatch(/^~\//)
    }
  })

  it('omits schemaVersion (it is a migration marker, not a default)', () => {
    expect(DEFAULT_CONFIG.schemaVersion).toBeUndefined()
  })

  it('has at least one default schedule rule', () => {
    expect(DEFAULT_CONFIG.schedule.rules.length).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.schedule.rules[0]).toHaveProperty('name')
    expect(DEFAULT_CONFIG.schedule.rules[0]).toHaveProperty('time_start')
    expect(DEFAULT_CONFIG.schedule.rules[0]).toHaveProperty('time_end')
  })

  it('has a valid theme value', () => {
    expect(['dark', 'light', 'system']).toContain(DEFAULT_CONFIG.ui.theme)
  })
})
```

---

## 5. Testing Strategy

### Existing tests — must remain green

| File                                                    | Tests                       | Why unaffected                                                                                                                                                                                     |
| ------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/__tests__/config-loader.test.ts`     | varies                      | Tests loader behavior (`loadConfig`, `saveConfig`, deepMerge). `DEFAULT_CONFIG` export shape is unchanged (still absolute paths in loader.ts after `expandPaths`).                                 |
| `packages/core/src/__tests__/config-migrations.test.ts` | varies                      | Tests migration logic, not defaults. Unchanged.                                                                                                                                                    |
| `packages/core/src/__tests__/config-schema.test.ts`     | varies                      | Tests schema validation, not defaults. Unchanged.                                                                                                                                                  |
| `apps/gui/src/__tests__/stores.test.ts`                 | 5 DEFAULT_CONFIG references | All references use values, not identity. Values are identical before/after A2a (same `~/...` paths, same ai/aria2/network/schedule/etc.). The import source changes but the runtime values do not. |

### New tests

- `packages/core/src/__tests__/config-defaults.test.ts` — 6 sanity tests (described in §4.5)

### Total test impact

- Baseline: 694 tests (post-A1)
- After A2a: 700 tests (694 + 6 new)
- Zero existing tests modified or deleted.

---

## 6. Verification Gates

All must pass before PR is mergeable.

| Check                     | Command                                                                   | Expected                                                                                                             |
| ------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| TypeScript strict         | `pnpm typecheck` (workspace, 5 packages)                                  | 0 errors                                                                                                             |
| Unit tests                | `pnpm test` (workspace)                                                   | All green (694 baseline + 6 new = 700)                                                                               |
| ESLint                    | `pnpm lint` (workspace)                                                   | 0 errors, 0 warnings                                                                                                 |
| Rust                      | `cargo test` (in `apps/gui/src-tauri/`)                                   | Not run locally — no Rust changes. CI still runs; will be green because nothing in `apps/gui/src-tauri/` is touched. |
| Single source of truth    | `grep -nF "export const DEFAULT_CONFIG" packages/core/src apps/gui/src`   | Returns exactly ONE match: `packages/core/src/config/defaults.ts`                                                    |
| GUI DEFAULT_CONFIG import | `grep -nF "from '@motrix-ai/core/browser'" apps/gui/src/stores/config.ts` | Returns exactly ONE match                                                                                            |

---

## 7. Execution Strategy

**Single PR**, 5 commits (one per file change, conventional commit messages):

| #   | Commit message                                                                         | Files touched                                              |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | `refactor(core): extract DEFAULT_CONFIG to browser-safe defaults.ts`                   | New: `packages/core/src/config/defaults.ts`                |
| 2   | `refactor(core): loader.ts imports from defaults.ts and re-exports expanded form`      | `packages/core/src/config/loader.ts`                       |
| 3   | `feat(core): export DEFAULT_CONFIG from browser entry point`                           | `packages/core/src/browser.ts`                             |
| 4   | `refactor(gui): import DEFAULT_CONFIG from @motrix-ai/core/browser, remove local copy` | `apps/gui/src/stores/config.ts`                            |
| 5   | `test(core): add sanity tests for DEFAULT_CONFIG shape and ~/ canonical paths`         | New: `packages/core/src/__tests__/config-defaults.test.ts` |

**Branch name:** `refactor/a2a-config-defaults-unification`

**Why single PR:** total diff is ~100 lines. The 5 commits form a coherent unit — partial application (e.g., commit 4 without commit 3) would break the GUI build. Splitting adds review overhead without risk-isolation benefit.

---

## 8. Risks & Rollback

| Risk                                                                        | Likelihood | Impact                                                           | Mitigation                                                                                                                                                                                                 |
| --------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaults.ts` accidentally imports Node API (breaks browser bundle)         | Low        | Build failure in GUI                                             | `defaults.ts` is pure literal data + one `import type` (which is erased). No `fs`/`os`/`path` imports. Pre-commit `pnpm typecheck` on GUI catches it.                                                      |
| Existing GUI tests reference DEFAULT_CONFIG identity (not just values)      | Low        | Test failures                                                    | Audit showed all 5 references use values (`expect(store.config.aria2.rpc_url).toBe(DEFAULT_CONFIG.aria2.rpc_url)`). Identity check would be `expect(store.config).toBe(DEFAULT_CONFIG)` — none such exist. |
| `expandPaths()` in loader.ts misses a path field                            | Medium     | CLI/MCP get `~/...` paths unexpanded, operations fail            | All path fields enumerated explicitly in `expandPaths`. New sanity test catches missing `~/` prefix in defaults. Existing `config-loader.test.ts` catches loader-side regressions.                         |
| Bundle size grows from DEFAULT_CONFIG now in browser bundle                 | Very low   | Slight GUI bundle bloat                                          | DEFAULT_CONFIG is ~65 lines of literal data (~2KB minified). Negligible.                                                                                                                                   |
| User config files on disk have legacy `~/...` paths from GUI's old defaults | Zero       | Already broken (Rust doesn't expand) — A2a doesn't make it worse | Pre-existing condition; A2b will fix via Rust-side expansion. A2a is silent on this.                                                                                                                       |

**Rollback:** Single PR → single `git revert`. No data migration, no schema change.

---

## 9. Acceptance Criteria

The PR is accepted when **all** of the following are true:

1. `pnpm typecheck` reports 0 errors across all 5 packages.
2. `pnpm test` reports 700 tests passing (694 baseline + 6 new), 0 failures.
3. `pnpm lint` reports 0 errors, 0 warnings.
4. `grep -nF "export const DEFAULT_CONFIG" packages/core/src apps/gui/src` returns exactly ONE match (in `defaults.ts`).
5. `grep -nF "from '@motrix-ai/core/browser'" apps/gui/src/stores/config.ts` returns at least one match (the DEFAULT_CONFIG import).
6. `grep -nF "~/Downloads" apps/gui/src/stores/config.ts` returns NO matches (the local 60-line definition with `~/` paths is gone).
7. The 6 new sanity tests in `config-defaults.test.ts` exist and pass.
8. `packages/core/src/config/defaults.ts` contains no `import` statements other than `import type { AppConfig } from '../types.js'` (verified by `grep -nE "^import" packages/core/src/config/defaults.ts`).

---

## 10. Follow-up (not in this spec)

Tracked for **A2b** (separate spec/PR):

- Fix subdir field defaults to relative names (`"Movies"` instead of `"~/Downloads/Motrix AI/Movies"`)
- Rust-side `configured_subdir` `~` expansion (parity with `configured_download_dir`)
- Rust `config.rs` `default_config()` deduplication with TS defaults
- Existing-config-file migration: detect old full-path subdir values, normalize
- End-to-end integration test verifying `organize_file` puts files in correct directories

Items this spec intentionally does not address:

- The `deepMerge` helpers in `config.ts` (GUI) and `loader.ts` (core) are similar but not identical. Unifying them is a separate refactor.
- `useConfigStore.updateSection` shallow-merges nested objects (audit P2-4) — separate fix.

---

## 11. References

- `AUDIT-REPORT.md` — source of audit findings (commit `cd20305`)
- `docs/superpowers/specs/2026-07-17-a1-core-type-hardening-design.md` — sibling A1 spec (merged)
- `docs/superpowers/specs/2026-07-08-config-system-unification-design.md` — older spec (config SYSTEM unification, separate concern)
- `packages/core/src/browser.ts` — browser entry point documentation
- `apps/gui/src-tauri/src/commands/mod.rs:86-120` — Rust `configured_download_dir` (already expands `~`)
- `apps/gui/src-tauri/src/commands/fs.rs:61-82` — Rust `configured_subdir` (does NOT expand `~`; A2b scope)
