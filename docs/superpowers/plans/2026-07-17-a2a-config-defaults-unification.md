# A2a Config Defaults Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate DEFAULT_CONFIG duplication between GUI and core by extracting a browser-safe single source of truth (`packages/core/src/config/defaults.ts`). Zero runtime behavior change for any consumer.

**Architecture:** Three-layer — `defaults.ts` holds canonical `~/`-form values (browser-safe, no Node APIs); `loader.ts` imports and wraps with `expandTilde()` for Node contexts (CLI/MCP see absolute paths, unchanged); `browser.ts` re-exports verbatim (GUI sees `~/` paths, unchanged). GUI's local 60-line DEFAULT_CONFIG definition is deleted.

**Tech Stack:** TypeScript 5.5+, vitest 4.1+, pnpm workspace, `@motrix-ai/core` internal browser/Node entry points.

## Global Constraints

- **Repo root:** `/home/h523034406/motrix-ai` (already cloned, on branch `refactor/a2a-config-defaults-unification`)
- **Spec doc:** `docs/superpowers/specs/2026-07-17-a2a-config-defaults-unification-design.md` (committed at `79e7cc2`)
- **Baseline commit:** `c96ce23` (main, post-A1 squash merge)
- TypeScript strict mode. Never re-introduce `any`, `as any`, or `eslint-disable`.
- `defaults.ts` is browser-safe: NO imports of `fs`, `os`, `path`, or any module that transitively pulls Node APIs. Only `import type` (erased at runtime) is allowed.
- Path values in `defaults.ts` MUST use `~/` prefix (canonical form for browser contexts).
- `schemaVersion` MUST NOT appear in `defaults.ts` (it's a migration marker, not a default).
- Tests run from workspace root: `pnpm test <filter>` (positional, no `--`). Per-package `pnpm --filter @motrix-ai/core test` does NOT work (vitest config at root).
- Typecheck/lint per-package: `pnpm --filter @motrix-ai/core typecheck` / `lint`.
- Conventional commit messages; one commit per task.
- Run all `pnpm` commands from repo root unless the step says otherwise.

---

### Task 1: Create `defaults.ts` and export from `browser.ts`

**Why bundled:** `defaults.ts` alone has no consumer; `browser.ts` re-export alone has no source. Landing them together makes the commit a complete, buildable unit (browser entry now exposes DEFAULT_CONFIG, even if no one uses it yet).

**Files:**

- Create: `packages/core/src/config/defaults.ts`
- Modify: `packages/core/src/browser.ts` (append one re-export line)

**Interfaces:**

- Consumes: `AppConfig` type from `../types.js` (type-only import, browser-safe)
- Produces: `DEFAULT_CONFIG: AppConfig` export, accessible from both `@motrix-ai/core` (via loader.ts re-export — Task 2) and `@motrix-ai/core/browser` (via browser.ts re-export — this task)

- [ ] **Step 1: Create `defaults.ts` with the canonical DEFAULT_CONFIG**

Write to `packages/core/src/config/defaults.ts`:

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

**Verification: `defaults.ts` has no Node imports.**

```bash
cd /home/h523034406/motrix-ai
grep -nE "^import" packages/core/src/config/defaults.ts
```

**Expected:** exactly ONE line: `import type { AppConfig } from '../types.js'`. No other imports. If there's any `from 'fs'`, `from 'os'`, `from 'path'`, or similar — STOP, you've broken browser safety.

- [ ] **Step 2: Append re-export to `browser.ts`**

In `packages/core/src/browser.ts`, locate the final `export type { SearchProvider } from './search/provider.js'` line (currently the last line of the file). Append immediately after:

```typescript
// Default config values (browser-safe — no Node.js APIs).
// Path fields use `~/` prefix; Rust side expands at use sites.
export { DEFAULT_CONFIG } from './config/defaults.js'
```

(One blank line above for readability.)

- [ ] **Step 3: Run typecheck to verify both files compile**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core typecheck
```

**Expected:** PASS with 0 errors. The new `defaults.ts` typechecks under `AppConfig`; the new browser.ts export resolves.

- [ ] **Step 4: Run lint to verify style conformance**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core lint
```

**Expected:** PASS with 0 errors, 0 warnings.

- [ ] **Step 5: Run core tests to verify nothing broke**

```bash
cd /home/h523034406/motrix-ai && pnpm test config
```

**Expected:** PASS. Existing config tests (config-loader, config-migrations, config-schema) still green. No new tests added yet (Task 4).

- [ ] **Step 6: Commit**

```bash
cd /home/h523034406/motrix-ai
git add packages/core/src/config/defaults.ts packages/core/src/browser.ts
git commit -m "refactor(core): extract DEFAULT_CONFIG to browser-safe defaults.ts

Creates packages/core/src/config/defaults.ts as the single source of truth
for default config values. Browser-safe: only imports AppConfig type
(erased at runtime). Paths use canonical ~/ form.

browser.ts re-exports DEFAULT_CONFIG via @motrix-ai/core/browser entry,
making it available to GUI without pulling in Node.js APIs.

Values match existing loader.ts and GUI config.ts defaults verbatim.
Zero behavior change — no consumer is wired to the new export yet.

Spec: docs/superpowers/specs/2026-07-17-a2a-config-defaults-unification-design.md §4.1, §4.3"
```

---

### Task 2: Refactor `loader.ts` to import from `defaults.ts` and re-export expanded form

**Files:**

- Modify: `packages/core/src/config/loader.ts` (replace local DEFAULT_CONFIG definition lines 13-72 with import + `expandTilde` wrapper)

**Interfaces:**

- Consumes: `DEFAULT_CONFIG` from `./defaults.js` (Task 1)
- Produces: `DEFAULT_CONFIG: AppConfig` re-exported from loader.ts, with `~/` paths expanded to absolute via `os.homedir()`. Public API of loader.ts unchanged — CLI/MCP code continues importing `{ DEFAULT_CONFIG }` from `@motrix-ai/core` and gets absolute paths.

This task is a pure refactor of how `DEFAULT_CONFIG` is derived inside loader.ts. No external API change.

- [ ] **Step 1: Replace local DEFAULT_CONFIG definition with import + expandTilde wrapper**

In `packages/core/src/config/loader.ts`, make these exact changes.

**Add new import** (after the existing `import { migrateConfig } from './migrations.js'` line, currently line 8):

```typescript
import { DEFAULT_CONFIG as DEFAULTS_WITH_TILDE } from './defaults.js'
```

**Delete the local DEFAULT_CONFIG definition** (currently lines 13-72 — the entire `export const DEFAULT_CONFIG: AppConfig = { ... }` block).

**Add expandTilde + expandPaths + new DEFAULT_CONFIG export** in its place:

```typescript
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
```

The `loadConfig` and `saveConfig` functions below (currently lines 91-121) remain verbatim — they reference `DEFAULT_CONFIG` and continue working unchanged.

- [ ] **Step 2: Run typecheck**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core typecheck
```

**Expected:** PASS with 0 errors. The `expandTilde` and `expandPaths` functions typecheck correctly. The `expandPaths` generic preserves `AppConfig` shape.

- [ ] **Step 3: Run config tests**

```bash
cd /home/h523034406/motrix-ai && pnpm test config-loader
```

**Expected:** PASS, all config-loader tests green. These tests verify loader behavior — `DEFAULT_CONFIG` exported from loader.ts is still an AppConfig with absolute paths (post-`expandPaths`), so consumers see identical values to before this task.

If any test fails: investigate. The most likely cause is a test that asserted a specific default value changed because `expandPaths` is applied — but `expandPaths` should produce the same absolute paths that loader.ts used to inline. If a test asserted e.g. `DEFAULT_CONFIG.downloads.base_dir === '/home/user/Downloads/Motrix AI'`, that should still pass.

- [ ] **Step 4: Run full core test suite to catch cross-module regressions**

```bash
cd /home/h523034406/motrix-ai && pnpm test
```

**Expected:** PASS, all 694 tests green (no new tests yet).

- [ ] **Step 5: Run lint**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core lint
```

**Expected:** PASS with 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
cd /home/h523034406/motrix-ai
git add packages/core/src/config/loader.ts
git commit -m "refactor(core): loader.ts imports from defaults.ts, re-exports expanded form

Replaces the local 60-line DEFAULT_CONFIG definition with an import from
./defaults.js (the single source of truth) wrapped in expandPaths().

expandTilde() converts ~/ and ~\\ prefixes to os.homedir() for Node
contexts (CLI, MCP). CLI/MCP consumers continue to see absolute paths
unchanged.

Browser contexts (GUI) import from @motrix-ai/core/browser which re-exports
the raw ~/ form. That wiring lands in Task 4.

Spec: docs/superpowers/specs/2026-07-17-a2a-config-defaults-unification-design.md §4.2"
```

---

### Task 3: GUI `config.ts` imports DEFAULT_CONFIG from `@motrix-ai/core/browser`, deletes local copy

**Files:**

- Modify: `apps/gui/src/stores/config.ts` (delete lines 37-97 local DEFAULT_CONFIG; add import + re-export)

**Interfaces:**

- Consumes: `DEFAULT_CONFIG` from `@motrix-ai/core/browser` (made available by Task 1)
- Produces: GUI's `useConfigStore` and helper functions continue working unchanged. The named export `DEFAULT_CONFIG` from `apps/gui/src/stores/config` is preserved (re-export of the imported value) so existing imports throughout the GUI (e.g., `import { DEFAULT_CONFIG } from '@/stores/config'`) continue working without touching call sites.

- [ ] **Step 1: Replace the local DEFAULT_CONFIG definition with import + re-export**

In `apps/gui/src/stores/config.ts`:

**Add import** after the existing `import type { ... } from '@motrix-ai/core'` block (currently ends at line 18):

```typescript
import { DEFAULT_CONFIG as CORE_DEFAULT_CONFIG } from '@motrix-ai/core/browser'
```

**Delete the entire local DEFAULT_CONFIG definition** (currently lines 37-97 — the entire `export const DEFAULT_CONFIG: AppConfig = { ... }` block including trailing blank line).

**Add a re-export in its place** (so existing imports throughout the GUI keep working):

```typescript
// Re-export DEFAULT_CONFIG for convenience (single source of truth: @motrix-ai/core).
// Components and tests import from here as '@/stores/config'.
export const DEFAULT_CONFIG = CORE_DEFAULT_CONFIG
```

The `deepMerge`, `deepClone`, `migrateFromLocalStorage`, `cleanupOldKeys` helpers below (currently lines 99-196) and the `useConfigStore` definition (lines 198-277) remain verbatim.

- [ ] **Step 2: Run typecheck across the workspace (catches GUI import path errors)**

```bash
cd /home/h523034406/motrix-ai && pnpm typecheck
```

**Expected:** PASS with 0 errors across all 5 packages. Critically: the GUI package typechecks, confirming `@motrix-ai/core/browser` resolves and `DEFAULT_CONFIG` is properly typed as `AppConfig`.

- [ ] **Step 3: Run GUI tests**

```bash
cd /home/h523034406/motrix-ai && pnpm test stores.test.ts
```

**Expected:** PASS, all stores.test.ts tests green. The 5 references to DEFAULT_CONFIG (per spec §5) use values, not identity — values are identical to the deleted local definition.

If any test fails: investigate. Likely cause is a value drift between the new canonical DEFAULT_CONFIG (in defaults.ts) and the deleted GUI local copy. Compare values field-by-field.

- [ ] **Step 4: Run full workspace test suite**

```bash
cd /home/h523034406/motrix-ai && pnpm test
```

**Expected:** PASS, all 694 tests green (no new tests yet).

- [ ] **Step 5: Run lint across the workspace**

```bash
cd /home/h523034406/motrix-ai && pnpm lint
```

**Expected:** PASS with 0 errors, 0 warnings.

- [ ] **Step 6: Verify single-source-of-truth grep check**

```bash
cd /home/h523034406/motrix-ai
grep -nF "export const DEFAULT_CONFIG" packages/core/src apps/gui/src
```

**Expected:** returns matches in:

- `packages/core/src/config/defaults.ts` (the canonical source)
- `packages/core/src/config/loader.ts` (the Node-side re-export, with `expandPaths` wrapping)
- `apps/gui/src/stores/config.ts` (the re-export for GUI-internal convenience)

Three matches, but only ONE is the source of truth (defaults.ts). The other two are deliberate re-exports. No additional matches in any other file.

If grep returns matches in any unexpected file — STOP, that signals another duplicate that should be cleaned up (but is out of scope for this task; report as a finding).

- [ ] **Step 7: Commit**

```bash
cd /home/h523034406/motrix-ai
git add apps/gui/src/stores/config.ts
git commit -m "refactor(gui): import DEFAULT_CONFIG from @motrix-ai/core/browser, remove local copy

Deletes the 60-line local DEFAULT_CONFIG definition. Imports from
@motrix-ai/core/browser (the browser-safe entry point) which exposes
DEFAULT_CONFIG as raw ~/ paths via defaults.ts.

Re-exports DEFAULT_CONFIG from this module so existing GUI imports
(import { DEFAULT_CONFIG } from '@/stores/config') keep working without
touching call sites.

Values are identical to the deleted local copy. Zero behavior change.

Spec: docs/superpowers/specs/2026-07-17-a2a-config-defaults-unification-design.md §4.4"
```

---

### Task 4: Add sanity tests for DEFAULT_CONFIG shape and canonical paths

**Files:**

- Create: `packages/core/src/__tests__/config-defaults.test.ts`

**Interfaces:**

- Consumes: `DEFAULT_CONFIG` from `../config/defaults.js` (Task 1), `AppConfig` type from `../types.js`
- Produces: 6 sanity tests verifying DEFAULT_CONFIG has the expected shape, uses canonical `~/` paths, and omits `schemaVersion`

- [ ] **Step 1: Write the sanity test file**

Create `packages/core/src/__tests__/config-defaults.test.ts`:

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

- [ ] **Step 2: Run the new test file**

```bash
cd /home/h523034406/motrix-ai && pnpm test config-defaults
```

**Expected:** PASS, 6 tests green. If any fail, the implementation in Task 1 drifted from the spec — investigate before proceeding.

- [ ] **Step 3: Run full test suite to confirm no regression**

```bash
cd /home/h523034406/motrix-ai && pnpm test
```

**Expected:** PASS, 700 tests total (694 baseline + 6 new).

- [ ] **Step 4: Run lint**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core lint
```

**Expected:** PASS with 0 errors, 0 warnings.

- [ ] **Step 5: Commit**

```bash
cd /home/h523034406/motrix-ai
git add packages/core/src/__tests__/config-defaults.test.ts
git commit -m "test(core): add sanity tests for DEFAULT_CONFIG shape and ~/ canonical paths

Adds 6 tests covering: required top-level sections present, all download
path fields use ~/ prefix, subtitle_dir uses ~/ when present, schemaVersion
omitted, at least one schedule rule exists, valid theme value.

These tests guard against future drift: if someone adds a new path field
to AppConfig but forgets to use ~/ in defaults.ts, or accidentally
includes schemaVersion, these tests fail loudly.

Spec: docs/superpowers/specs/2026-07-17-a2a-config-defaults-unification-design.md §4.5"
```

---

### Final Verification (after all 4 tasks)

These map 1:1 to spec §9 Acceptance Criteria. All must pass before considering the branch done.

- [ ] **Step 1: Per-package and workspace quality gates**

```bash
cd /home/h523034406/motrix-ai
pnpm typecheck                    # Criterion 1: 0 errors across 5 packages
pnpm test                         # Criterion 2: 700 tests pass (694 baseline + 6 new)
pnpm lint                         # Criterion 3: 0 errors, 0 warnings
```

**Expected:** all three PASS.

- [ ] **Step 2: Single-source-of-truth grep checks (Criteria 4-6)**

```bash
cd /home/h523034406/motrix-ai

# Criterion 4: only one source of truth for DEFAULT_CONFIG definition
grep -nF "export const DEFAULT_CONFIG" packages/core/src apps/gui/src
# Expected: matches in defaults.ts, loader.ts, and gui config.ts (3 total,
#           but defaults.ts is the canonical source; others are deliberate re-exports)

# Criterion 5: GUI imports from @motrix-ai/core/browser
grep -nF "from '@motrix-ai/core/browser'" apps/gui/src/stores/config.ts
# Expected: at least one match (the DEFAULT_CONFIG import)

# Criterion 6: GUI no longer has ~/Downloads literal paths in config.ts
grep -nF "~/Downloads" apps/gui/src/stores/config.ts
# Expected: NO matches (the local 60-line definition is deleted)
```

- [ ] **Step 3: Browser-safety verification (Criterion 8)**

```bash
cd /home/h523034406/motrix-ai
grep -nE "^import" packages/core/src/config/defaults.ts
# Expected: exactly ONE line: "import type { AppConfig } from '../types.js'"
```

- [ ] **Step 4: Branch commit history**

```bash
cd /home/h523034406/motrix-ai && git log --oneline main..HEAD
```

**Expected:** 5 commits total:

1. `docs(spec): add A2a config defaults unification design spec` (already on branch as `79e7cc2`)
2. `refactor(core): extract DEFAULT_CONFIG to browser-safe defaults.ts`
3. `refactor(core): loader.ts imports from defaults.ts and re-exports expanded form`
4. `refactor(gui): import DEFAULT_CONFIG from @motrix-ai/core/browser, remove local copy`
5. `test(core): add sanity tests for DEFAULT_CONFIG shape and ~/ canonical paths`

Plus this plan commit if committed separately (5 or 6 depending on whether plan gets its own doc commit).

- [ ] **Step 5: Hand off to maintainer for push / PR decision**

The branch is locally complete. Maintainer decides whether to push and open a PR.

---

## Self-Review (completed during plan authoring)

**1. Spec coverage:**

- Spec §4.1 (defaults.ts) → Task 1 Step 1 ✓
- Spec §4.2 (loader.ts) → Task 2 ✓
- Spec §4.3 (browser.ts) → Task 1 Step 2 ✓
- Spec §4.4 (GUI config.ts) → Task 3 ✓
- Spec §4.5 (sanity test) → Task 4 ✓
- Spec §6 (verification gates) → Final Verification Steps 1-3 ✓
- Spec §9 (acceptance criteria 1-8) → Final Verification Steps 1-3 cover all 8 ✓

**2. Placeholder scan:** No "TBD", "TODO", "implement later". All code blocks contain runnable content. All commands have expected output.

**3. Type consistency:**

- `DEFAULT_CONFIG` type is `AppConfig` everywhere — defaults.ts source, loader.ts re-export, browser.ts re-export, GUI config.ts re-export
- `DEFAULTS_WITH_TILDE` (loader.ts internal alias) is also `AppConfig` (via the import)
- Task numbering aligns: Task 1 produces the foundation, Tasks 2-4 build on it
- The `expandPaths<T extends AppConfig>(config: T): T` signature preserves any subtype, though in practice it's always called with `AppConfig`

**4. Scope discipline:** No drift into A2b territory (subdir semantics, Rust changes, migration). All 4 tasks stay strictly in TS-side dedup. The spec's out-of-scope list is honored.
