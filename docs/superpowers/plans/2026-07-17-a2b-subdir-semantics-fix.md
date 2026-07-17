# A2b Subdir Semantics Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the subdir-field semantic mismatch — defaults stored full paths (`~/Downloads/Motrix AI/Movies`) but `configured_subdir` expects relative names, causing `sanitize_path_component` to mangle the `/` into `_` and produce literal `~_Downloads_Motrix AI_Movies` directories.

**Architecture:** Canonical form becomes relative names (`"Movies"`). `configured_subdir` post-processes any configured value: if it contains path separators (legacy full-path form), extract basename via `Path::file_name()`; otherwise return as-is. Backward-compatible — no migration writes to user's config.json.

**Tech Stack:** TypeScript 5.5+, vitest 4.1+, Rust (Tauri 2 backend), `cargo test`, `cargo clippy`.

## Global Constraints

- **Repo root:** `/home/h523034406/motrix-ai` (already cloned, on branch `refactor/a2b-subdir-semantics-fix`)
- **Spec doc:** `docs/superpowers/specs/2026-07-17-a2b-subdir-semantics-fix-design.md` (committed at `613cc71`)
- **Baseline commit:** `8aa1502` (main, post-A2a squash merge)
- TypeScript strict mode. No `any`, no `eslint-disable`.
- Rust: no `unwrap()` in production code (use `?` or `unwrap_or_else`); clippy must be warning-free.
- `sanitize_path_component` (fs.rs:16-31) is a security defense — MUST NOT be modified.
- `base_dir` is unchanged (handled correctly by `configured_download_dir`).
- Tests run from workspace root for TS: `pnpm test <filter>`. Rust: `cargo test --manifest-path apps/gui/src-tauri/Cargo.toml`.
- Conventional commit messages; one commit per task.
- Run all `pnpm` commands from repo root unless step says otherwise.

---

### Task 1: Update TS subdir defaults to relative names + update sanity test

**Why bundled:** the value change and the test-expectation change are in the same package and form one atomic unit. Splitting would leave the test file asserting the old form against the new values (red intermediate state).

**Files:**

- Modify: `packages/core/src/config/defaults.ts:28-33`
- Modify: `packages/core/src/__tests__/config-defaults.test.ts`

**Interfaces:**

- Consumes: existing `AppConfig` type (no schema change)
- Produces: `DEFAULT_CONFIG.downloads.{movie_dir,software_dir,other_dir}` are now relative names (`"Movies"`, `"Software"`, `"Other"`) instead of `~/Downloads/Motrix AI/Movies` etc.

- [ ] **Step 1: Update `defaults.ts` subdir values**

In `packages/core/src/config/defaults.ts`, replace lines 28-33 exactly:

Before:

```typescript
  downloads: {
    base_dir: '~/Downloads/Motrix AI',
    movie_dir: '~/Downloads/Motrix AI/Movies',
    software_dir: '~/Downloads/Motrix AI/Software',
    other_dir: '~/Downloads/Motrix AI/Other',
    rename_template: '{title} ({year})/{title}.{quality}.{ext}',
  },
```

After:

```typescript
  downloads: {
    base_dir: '~/Downloads/Motrix AI',
    // Subdir fields are RELATIVE NAMES, not paths. They are joined under
    // base_dir by Rust's organize_file (fs.rs:333+). The fallbacks in
    // configured_subdir (fs.rs:326-331) match these values.
    // Legacy configs with "~/Downloads/.../Movies" full-path values are
    // handled transparently by configured_subdir's basename extraction.
    movie_dir: 'Movies',
    software_dir: 'Software',
    other_dir: 'Other',
    rename_template: '{title} ({year})/{title}.{quality}.{ext}',
  },
```

- [ ] **Step 2: Update sanity test to match new expectations**

In `packages/core/src/__tests__/config-defaults.test.ts`, locate the existing test `"uses ~/ prefix for all download path fields (browser-safe canonical form)"`. Replace it (the entire `it(...) {}` block) with these two tests:

```typescript
it('uses ~/ prefix for base_dir (browser-safe canonical form)', () => {
  expect(DEFAULT_CONFIG.downloads.base_dir).toMatch(/^~\//)
})

it('uses relative names for subdir fields (not full paths)', () => {
  // Subdirs are joined under base_dir by Rust's organize_file.
  // Full-path values would be sanitized into ~_Downloads_... nonsense dirs.
  expect(DEFAULT_CONFIG.downloads.movie_dir).toBe('Movies')
  expect(DEFAULT_CONFIG.downloads.software_dir).toBe('Software')
  expect(DEFAULT_CONFIG.downloads.other_dir).toBe('Other')
  // Ensure no separator characters slipped in
  expect(DEFAULT_CONFIG.downloads.movie_dir).not.toMatch(/[/\\]/)
  expect(DEFAULT_CONFIG.downloads.software_dir).not.toMatch(/[/\\]/)
  expect(DEFAULT_CONFIG.downloads.other_dir).not.toMatch(/[/\\]/)
})
```

(Net +1 test: 7 → 8 in this file.)

- [ ] **Step 3: Run typecheck**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core typecheck
```

**Expected:** PASS with 0 errors.

- [ ] **Step 4: Run focused sanity test**

```bash
cd /home/h523034406/motrix-ai && pnpm test config-defaults
```

**Expected:** PASS, 8 tests (7 original - 1 replaced + 2 new = 8).

- [ ] **Step 5: Run full workspace test to catch cross-package regressions**

```bash
cd /home/h523034406/motrix-ai && pnpm test
```

**Expected:** PASS, 702 tests (701 baseline + 1 net new). Critically: `apps/gui/src/__tests__/stores.test.ts` (8 tests) must remain green — it references `DEFAULT_CONFIG.aria2.rpc_url` and `DEFAULT_CONFIG.downloads.rename_template` (both unchanged), NOT the subdirs.

If any stores.test.ts test fails: investigate immediately. The 5 `DEFAULT_CONFIG.*` references in that file all assert values that this task does NOT touch.

- [ ] **Step 6: Run lint**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core lint
```

**Expected:** PASS with 0 errors, 0 warnings.

- [ ] **Step 7: Commit**

```bash
cd /home/h523034406/motrix-ai
git add packages/core/src/config/defaults.ts packages/core/src/__tests__/config-defaults.test.ts
git commit -m "refactor(core): change subdir defaults to relative names (Movies/Software/Other)

Subdir fields (movie_dir, software_dir, other_dir) were full paths
(\"~/Downloads/Motrix AI/Movies\") but Rust's configured_subdir treats
them as relative names, and sanitize_path_component mangled the / into
_, producing literal \"~_Downloads_Motrix AI_Movies\" directories under
base_dir.

Canonical form is now relative names matching the original fallback
intent in configured_subdir (fs.rs:326-331). Legacy configs with
full-path values will be handled transparently by basename extraction
(forthcoming in fs.rs update).

base_dir is unchanged (handled correctly by configured_download_dir).

Updates sanity test: original 1 test asserting ~/ prefix on all 4
download path fields is split into 2 sharper tests — one for base_dir's
~/ prefix, one for subdirs being relative names without separators.

Spec: docs/superpowers/specs/2026-07-17-a2b-subdir-semantics-fix-design.md §4.1, §4.2"
```

---

### Task 2: Sync Rust `default_config()` subdir defaults with TS

**Files:**

- Modify: `apps/gui/src-tauri/src/commands/config.rs:13-18`

**Interfaces:**

- Consumes: nothing new
- Produces: Rust's `default_config()` subdir values now match TS `DEFAULT_CONFIG`

- [ ] **Step 1: Update Rust `default_config()`**

In `apps/gui/src-tauri/src/commands/config.rs`, replace lines 13-18 exactly:

Before:

```rust
        "downloads": {
            "base_dir": "~/Downloads/Motrix AI",
            "movie_dir": "~/Downloads/Motrix AI/Movies",
            "software_dir": "~/Downloads/Motrix AI/Software",
            "other_dir": "~/Downloads/Motrix AI/Other",
            "rename_template": "{title} ({year})/{title}.{quality}.{ext}"
        },
```

After:

```rust
        "downloads": {
            // subdirs are relative names (joined under base_dir by fs.rs::organize_file).
            // MUST mirror packages/core/src/config/defaults.ts — keep in sync manually.
            "base_dir": "~/Downloads/Motrix AI",
            "movie_dir": "Movies",
            "software_dir": "Software",
            "other_dir": "Other",
            "rename_template": "{title} ({year})/{title}.{quality}.{ext}"
        },
```

- [ ] **Step 2: Run Rust typecheck / build**

```bash
cd /home/h523034406/motrix-ai/apps/gui/src-tauri && cargo check
```

**Expected:** PASS with 0 errors. (This is faster than full `cargo build` and catches type errors.)

If this fails with offline dependency issues, try `cargo check --offline` after a prior `cargo fetch`. If it still fails, escalate — do not commit broken Rust.

- [ ] **Step 3: Run Rust tests to confirm no regression**

```bash
cd /home/h523034406/motrix-ai/apps/gui/src-tauri && cargo test
```

**Expected:** PASS. Existing tests (in `aria2.rs`, `http_api.rs`) are in different modules; this value change does not affect them.

- [ ] **Step 4: Run clippy**

```bash
cd /home/h523034406/motrix-ai/apps/gui/src-tauri && cargo clippy -- -D warnings
```

**Expected:** PASS with 0 warnings.

- [ ] **Step 5: Commit**

```bash
cd /home/h523034406/motrix-ai
git add apps/gui/src-tauri/src/commands/config.rs
git commit -m "refactor(backend): sync Rust default_config() subdir defaults with TS

Updates Rust's default_config() in config.rs to match the new relative-name
form introduced in packages/core/src/config/defaults.ts.

Adds a doc comment noting the values MUST mirror defaults.ts (manual sync
required since the two languages can't share code directly).

base_dir is unchanged (handled correctly by configured_download_dir).

Spec: docs/superpowers/specs/2026-07-17-a2b-subdir-semantics-fix-design.md §4.3"
```

---

### Task 3: Add `extract_subdir_name` helper + tests + refactor `configured_subdir`

**Why TDD-ordered and bundled into one task:** the helper function and its tests form an atomic unit. Writing the tests first (against a stub) defines the behavior contract; the implementation makes them pass; the `configured_subdir` refactor wires the helper into the existing call site. Splitting would leave either tests-without-impl or impl-without-tests in intermediate commits.

**Files:**

- Modify: `apps/gui/src-tauri/src/commands/fs.rs` (refactor `configured_subdir`, add `extract_subdir_name` function, append `#[cfg(test)] mod tests`)

**Interfaces:**

- Consumes: existing `Path` import (fs.rs:6: `use std::path::{Path, PathBuf}`)
- Produces:
  - `extract_subdir_name(value: &str, fallback: &str) -> String` — new private helper
  - `configured_subdir(field: &str, fallback: &str) -> String` — refactored to use the helper

- [ ] **Step 1: Add the test module (TDD red phase)**

**Important:** `Path::file_name()` is platform-aware — Unix only recognizes `/` as separator; Windows recognizes both `/` and `\`. Tests that depend on backslash handling are `#[cfg(windows)]`. Platform-independent tests use forward slashes only.

In `apps/gui/src-tauri/src/commands/fs.rs`, append at the very end of the file:

```rust

#[cfg(test)]
mod tests {
    mod extract_subdir_name {
        use super::super::*;

        #[test]
        fn returns_relative_name_unchanged() {
            assert_eq!(extract_subdir_name("Movies", "fallback"), "Movies");
            assert_eq!(extract_subdir_name("My Custom Folder", "fallback"), "My Custom Folder");
            assert_eq!(extract_subdir_name("TV", "fallback"), "TV");
        }

        #[test]
        fn extracts_basename_from_legacy_full_path() {
            // Forward slashes work on both Unix and Windows — both platforms
            // recognize / as a separator. This covers the pre-A2b default form
            // ("~/Downloads/Motrix AI/Movies") which must not produce
            // "~_Downloads_..." after sanitize_path_component.
            assert_eq!(
                extract_subdir_name("~/Downloads/Motrix AI/Movies", "fallback"),
                "Movies"
            );
            assert_eq!(
                extract_subdir_name("/home/user/Downloads/Movies", "fallback"),
                "Movies"
            );
        }

        #[cfg(windows)]
        #[test]
        fn extracts_basename_from_windows_style_path() {
            // Windows-only: Path::file_name() on Windows recognizes \ as separator.
            // On Unix, \ is treated as part of the filename, so this test is conditional.
            assert_eq!(
                extract_subdir_name("C:\\Users\\me\\Movies", "fallback"),
                "Movies"
            );
        }

        #[test]
        fn returns_fallback_for_root_only_path() {
            // Path::new("/").file_name() returns None on both Unix and Windows.
            assert_eq!(extract_subdir_name("/", "fallback"), "fallback");
        }

        #[test]
        fn handles_trailing_separator() {
            // Path::new("/foo/bar/").file_name() returns Some("bar") on both platforms.
            assert_eq!(extract_subdir_name("/foo/bar/", "fallback"), "bar");
        }

        #[test]
        fn empty_basename_falls_back() {
            // Path::new("/a/../..").file_name() returns None.
            assert_eq!(extract_subdir_name("/a/../..", "fallback"), "fallback");
        }
    }
}
```

Note the path: `tests::extract_subdir_name::*` uses `super::super::*` to reach the `extract_subdir_name` function in the parent module (fs.rs's top level).

- [ ] **Step 2: Add the `extract_subdir_name` stub**

In `apps/gui/src-tauri/src/commands/fs.rs`, immediately BEFORE the existing `fn configured_subdir` (currently line 61), insert:

```rust
/// Extract the canonical relative subdir name from a configured value.
///
/// - Values without path separators (e.g. `"Movies"`, `"My Custom Folder"`)
///   are returned as-is.
/// - Values with separators (e.g. legacy `"~/Downloads/Motrix AI/Movies"`)
///   have their basename extracted via `Path::file_name()`.
/// - If extraction fails (e.g. the value is just `/` or ends with `..`),
///   returns `fallback`.
fn extract_subdir_name(value: &str, fallback: &str) -> String {
    if !value.contains('/') && !value.contains('\\') {
        return value.to_string();
    }
    Path::new(value)
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

```

(Trailing blank line before `configured_subdir`.)

- [ ] **Step 3: Run tests — expect GREEN (stub already implements the contract)**

```bash
cd /home/h523034406/motrix-ai/apps/gui/src-tauri && cargo test extract_subdir_name
```

**Expected:** PASS, 6 tests.

**If this fails RED**: investigate. The stub in Step 2 is supposed to be a full implementation. If it fails, either the implementation has a bug or a test expectation is wrong. Fix forward — do NOT commit broken code.

(Note: This task deviates from strict TDD red-then-green because the implementation is fully specified in the brief. The "TDD" framing is that the tests DEFINE the contract; the implementation makes them pass. There is no benefit to committing a `todo!()` intermediate state when the implementation is already known.)

- [ ] **Step 4: Refactor `configured_subdir` to use the new helper**

In `apps/gui/src-tauri/src/commands/fs.rs`, replace the existing `configured_subdir` function (currently lines 61-82 — the version with the inline trim-and-return logic) with:

```rust
/// Read a configured subdirectory name from the `downloads` section of
/// config.json (e.g. `movie_dir`, `software_dir`, `other_dir`).
/// Returns `fallback` when the field is missing or empty.
///
/// Values are canonical relative names (e.g. `"Movies"`), joined under
/// base_dir by organize_file. Legacy configs that stored full paths
/// (e.g. `"~/Downloads/Motrix AI/Movies"`) are handled transparently:
/// if the value contains a path separator, the basename is extracted.
fn configured_subdir(field: &str, fallback: &str) -> String {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return fallback.to_string(),
    };
    let config_path = home.join(".motrix-ai").join("config.json");
    let raw: Option<String> = if let Ok(content) = std::fs::read_to_string(&config_path) {
        serde_json::from_str::<serde_json::Value>(&content)
            .ok()
            .and_then(|json| {
                json.get("downloads")
                    .and_then(|d| d.get(field))
                    .and_then(|v| v.as_str())
                    .map(|s| s.trim().to_string())
            })
    } else {
        None
    };

    match raw {
        Some(s) if !s.is_empty() => extract_subdir_name(&s, fallback),
        _ => fallback.to_string(),
    }
}
```

- [ ] **Step 5: Run all Rust tests**

```bash
cd /home/h523034406/motrix-ai/apps/gui/src-tauri && cargo test
```

**Expected:** PASS. Existing tests in `aria2.rs`, `http_api.rs` still green. New `extract_subdir_name` tests (6) green. `configured_subdir` itself has no direct tests (it touches the filesystem; testing it would require a fixture config.json — out of scope for this PR).

- [ ] **Step 6: Run clippy**

```bash
cd /home/h523034406/motrix-ai/apps/gui/src-tauri && cargo clippy -- -D warnings
```

**Expected:** PASS with 0 warnings.

If clippy complains about the `Option<String>` match arm or the `and_then` chain, refactor per the suggestion. The current shape is idiomatic but clippy sometimes has stronger opinions.

- [ ] **Step 7: Commit**

```bash
cd /home/h523034406/motrix-ai
git add apps/gui/src-tauri/src/commands/fs.rs
git commit -m "fix(backend): configured_subdir extracts basename from legacy full-path values

configured_subdir previously returned the configured value verbatim.
Combined with sanitize_path_component (which replaces / with _), legacy
configs with full-path subdir values like \"~/Downloads/Motrix AI/Movies\"
produced literal \"~_Downloads_Motrix AI_Movies\" directories under base_dir.

New private helper extract_subdir_name(value, fallback) post-processes
the configured value: if it contains a path separator, the basename is
extracted via Path::file_name(); otherwise the value is returned as-is.
This makes configured_subdir robust to both new relative-name defaults
and legacy full-path values, without modifying sanitize_path_component
(which is a path-traversal defense and must not be weakened).

Adds 6 unit tests for extract_subdir_name covering: relative names,
legacy Unix paths, Windows paths, root-only paths, trailing separators,
and edge cases (.. traversal).

Spec: docs/superpowers/specs/2026-07-17-a2b-subdir-semantics-fix-design.md §4.4, §4.5"
```

---

### Final Verification (after all 3 tasks)

These map 1:1 to spec §9 Acceptance Criteria. All must pass before considering the branch done.

- [ ] **Step 1: TS quality gates**

```bash
cd /home/h523034406/motrix-ai
pnpm typecheck                    # Criterion 1: 0 errors across 5 packages
pnpm test                         # Criterion 2: 702 tests pass (701 baseline + 1 net new)
pnpm lint                         # Criterion 3: 0 errors, 0 warnings
```

**Expected:** all three PASS.

- [ ] **Step 2: Rust quality gates**

```bash
cd /home/h523034406/motrix-ai/apps/gui/src-tauri
cargo test                        # Criterion 4: existing + 6 new tests pass
cargo clippy -- -D warnings       # Criterion 5: 0 warnings
```

**Expected:** both PASS.

- [ ] **Step 3: Cross-file consistency grep (Criteria 6 + 7)**

```bash
cd /home/h523034406/motrix-ai

# Criterion 6: TS defaults use relative names
grep -nE "movie_dir|software_dir|other_dir" packages/core/src/config/defaults.ts
# Expected: 3 matches, each with a relative-name value (no /, \, or ~)

# Criterion 7: Rust defaults match TS
grep -nE "movie_dir|software_dir|other_dir" apps/gui/src-tauri/src/commands/config.rs
# Expected: 3 matches with the same values as criterion 6
```

- [ ] **Step 4: extract_subdir_name exists with tests (Criterion 8)**

```bash
cd /home/h523034406/motrix-ai
grep -nF "fn extract_subdir_name" apps/gui/src-tauri/src/commands/fs.rs
grep -nF "mod extract_subdir_name" apps/gui/src-tauri/src/commands/fs.rs
# Expected: 1 match each (function definition + test submodule)
```

- [ ] **Step 5: Branch commit history**

```bash
cd /home/h523034406/motrix-ai && git log --oneline main..HEAD
```

**Expected:** 4 commits total:

1. `docs(spec): add A2b subdir semantics fix design spec` (already on branch as `613cc71`)
2. `refactor(core): change subdir defaults to relative names (Movies/Software/Other)`
3. `refactor(backend): sync Rust default_config() subdir defaults with TS`
4. `fix(backend): configured_subdir extracts basename from legacy full-path values`

Plus this plan commit if committed separately (4 or 5 depending on whether plan gets its own doc commit).

- [ ] **Step 6: Hand off to maintainer for push / PR decision**

The branch is locally complete. Maintainer decides whether to push and open a PR.

---

## Self-Review (completed during plan authoring)

**1. Spec coverage:**

- Spec §4.1 (TS defaults) → Task 1 Step 1 ✓
- Spec §4.2 (TS sanity test) → Task 1 Step 2 ✓
- Spec §4.3 (Rust config.rs defaults) → Task 2 ✓
- Spec §4.4 (Rust fs.rs configured_subdir + extract_subdir_name) → Task 3 ✓
- Spec §4.5 (Rust unit tests) → Task 3 Step 1 ✓
- Spec §6 (verification gates) → Final Verification Steps 1-4 ✓
- Spec §9 (acceptance criteria 1-8) → Final Verification Steps 1-4 cover all 8 ✓

**2. Placeholder scan:** No "TBD", "TODO", "implement later". All code blocks contain runnable content. All commands have expected output.

**3. Type consistency:**

- `extract_subdir_name(value: &str, fallback: &str) -> String` — signature consistent across §4.4 spec, Task 3 Step 2 (impl), Task 3 Step 1 (test calls)
- `configured_subdir(field: &str, fallback: &str) -> String` — signature preserved (callers in fs.rs:326-331 don't need changes)
- TS values (`"Movies"`, `"Software"`, `"Other"`) match Rust values exactly
- Task 3 Step 4's `match raw { Some(s) if !s.is_empty() => ... }` is idiomatic Rust; if clippy disagrees, the implementer has latitude to refactor per its suggestion

**4. Scope discipline:** No drift. tv_dir/anime_dir/music_dir schema additions, subtitle_dir, base_dir changes, sanitize_path_component modifications, GUI display changes — all explicitly out of scope per spec §2. Plan honors this.
