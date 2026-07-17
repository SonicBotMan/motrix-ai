# A2b — Subdir Field Semantics Fix

**Date:** 2026-07-17
**Status:** Design — Pending Implementation
**Spec owner:** Maintainer
**Verified against:** `main` @ commit `8aa1502` (post-A2a squash merge)
**Parent initiative:** Sub-project A (Code Quality / Architecture) → A2 (config unification) → A2b slice

---

## 1. Problem Statement

The audit (`AUDIT-REPORT.md` P1-13) surfaced a config-consistency issue around default values for path fields. During A2a verification, a deeper architectural bug was discovered in the `downloads.*_dir` subdirectory fields — deferred to this spec because it touches Rust and has behavior implications.

### The bug

`packages/core/src/config/defaults.ts:30-32` and `apps/gui/src-tauri/src/commands/config.rs:15-17` define defaults for `movie_dir`, `software_dir`, `other_dir` as **full paths**:

```typescript
movie_dir: '~/Downloads/Motrix AI/Movies',
software_dir: '~/Downloads/Motrix AI/Software',
other_dir: '~/Downloads/Motrix AI/Other',
```

But `apps/gui/src-tauri/src/commands/fs.rs:61-82` `configured_subdir` treats these as **relative subdirectory names** (the `fallback` parameter is `"Movies"`, `"Software"`, `"Other"` — single names, not paths). And `sanitize_path_component` (`fs.rs:16-31`) replaces `/` and `\` with `_` as a path-traversal defense.

**Result:** when `organize_file` (`fs.rs:300+`) runs `safe_join(&base_dir, &[&movie_dir, &title])`, the literal value `"~/Downloads/Motrix AI/Movies"` is sanitized to `"~_Downloads_Motrix AI_Movies"` and joined under base_dir. Files end up at:

```
<absolute_base>/~_Downloads_Motrix AI_Movies/<title>
```

— a literal directory with that mangled name. Files are written (no error) but land in a nonsensical location. The user sees their config say "Movies" semantically but the actual filesystem layout is broken.

### Why the audit missed the severity

The audit (commit `cd20305`) flagged P1-13 as "default values inconsistent" but did not trace through `sanitize_path_component` to discover that the values produce mangled literal directory names. The bug was discovered during A2a's deeper exploration.

### Why A2b is small despite the scary description

Verification on `main` @ `8aa1502` confirmed:

- **CLI/MCP** do not consume subdir fields at all (`packages/cli/`, `packages/mcp-server/` — zero matches).
- **GUI** does not display or edit these fields in the settings UI (`apps/gui/src/components/settings/DownloadsTab.vue` only references `base_dir`, not the subdirs).
- Only **Rust `fs.rs::configured_subdir`** + **Rust `config.rs::default_config()`** + **TS `defaults.ts`** need to change.

No UI work, no CLI work, no IPC contract change.

---

## 2. Scope

### In scope

- 2 TypeScript files:
  - `packages/core/src/config/defaults.ts` — change 3 subdir defaults to relative names
  - `packages/core/src/__tests__/config-defaults.test.ts` — update sanity test expectations
- 2 Rust files:
  - `apps/gui/src-tauri/src/commands/config.rs` — sync `default_config()` defaults with TS
  - `apps/gui/src-tauri/src/commands/fs.rs` — make `configured_subdir` robust to legacy full-path values + add unit tests

### Out of scope (explicit)

- **`tv_dir` / `anime_dir` / `music_dir` schema additions** — Rust uses these via `configured_subdir` with fallbacks `"TV"` / `"Anime"` / `"Music"` (fs.rs:327-329) but they're not in `AppConfig` TypeScript schema. Adding them is feature work, not bug fix. Separate PR.
- **`subtitle_dir`** — in `subtitles` section, not `downloads`. Different code path. Out of scope.
- **`base_dir`** — already works correctly via `configured_download_dir` (mod.rs:86-120, which DOES expand `~`).
- **GUI display changes** — subdir fields aren't shown in settings UI; no UX impact.
- **One-time config-file migration** — `configured_subdir`'s new basename-extraction logic handles legacy full-path values transparently at use time, no writes to user's config.json needed.
- **Refactoring `sanitize_path_component`** — kept verbatim. It's a security defense (path-traversal); changing it has security implications outside this PR's scope.
- **Cross-language DEFAULT_CONFIG dedup** (Rust ↔ TS) — keeping Rust's `default_config()` as a separate impl with values synced to TS, plus a doc comment. Code-generation across languages is overkill for 4 fields.

---

## 3. Design Decision: Relative Names + Backward-Compatible Reads

### Approach A (RECOMMENDED): Relative canonical form + basename extraction in `configured_subdir`

**Canonical form:** subdir fields are **relative names** (`"Movies"`, `"Software"`, `"Other"`). This matches the original `fallback` design intent in `configured_subdir(field, fallback = "Movies")`.

**Backward compatibility:** `configured_subdir` post-processes any value: if it contains `/` or `\` (i.e., looks like a path, e.g., legacy `"~/Downloads/Motrix AI/Movies"`), extract the basename via `Path::new(&s).file_name()`. Otherwise return as-is.

This means:

- New config files: get relative defaults from the start, work directly.
- Legacy config files (with `~/...` subdir values): basename extraction silently produces `"Movies"` etc., matching what the user originally intended.
- User-customized values without separators: returned verbatim (e.g., `"My Custom Movies"`).
- User-customized values with separators (rare): basename extracted. Slight behavior change but only affects users who tried to use absolute paths for subdirs (which never worked correctly anyway due to the sanitize bug).

### Approach B (deferred fallback): Keep full-path form, fix `sanitize_path_component` + `configured_subdir`

Rejected because:

- Modifying `sanitize_path_component` to skip values containing `~` weakens the path-traversal defense (a torrent title could craft a value that exploits the carve-out).
- Requires adding `~` expansion to `configured_subdir` anyway.
- More invasive for no clear benefit.

**Decision:** Approach A.

---

## 4. Implementation

### 4.1 Update TS defaults

**File:** `packages/core/src/config/defaults.ts:28-33`

**Before:**

```typescript
downloads: {
  base_dir: '~/Downloads/Motrix AI',
  movie_dir: '~/Downloads/Motrix AI/Movies',
  software_dir: '~/Downloads/Motrix AI/Software',
  other_dir: '~/Downloads/Motrix AI/Other',
  rename_template: '{title} ({year})/{title}.{quality}.{ext}',
},
```

**After:**

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

`base_dir` is unchanged (still `~/Downloads/Motrix AI` — it's correctly expanded by `configured_download_dir` in mod.rs:103-111).

### 4.2 Update TS sanity test

**File:** `packages/core/src/__tests__/config-defaults.test.ts`

The current test `"uses ~/ prefix for all download path fields (browser-safe canonical form)"` asserts `~/` prefix on all 4 download path fields. After §4.1, only `base_dir` retains `~/`; the 3 subdirs are relative names.

**Replace that test with two focused tests:**

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

(Net: +1 test. Original was 1 test asserting all 4 fields; new is 2 tests with sharper assertions.)

### 4.3 Sync Rust `default_config()` with TS defaults

**File:** `apps/gui/src-tauri/src/commands/config.rs:13-18`

**Before:**

```rust
"downloads": {
    "base_dir": "~/Downloads/Motrix AI",
    "movie_dir": "~/Downloads/Motrix AI/Movies",
    "software_dir": "~/Downloads/Motrix AI/Software",
    "other_dir": "~/Downloads/Motrix AI/Other",
    "rename_template": "{title} ({year})/{title}.{quality}.{ext}"
},
```

**After:**

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

### 4.4 Make Rust `configured_subdir` robust to legacy full-path values

**File:** `apps/gui/src-tauri/src/commands/fs.rs:61-82`

**Before:**

```rust
fn configured_subdir(field: &str, fallback: &str) -> String {
    let home = match dirs::home_dir() {
        Some(h) => h,
        None => return fallback.to_string(),
    };
    let config_path = home.join(".motrix-ai").join("config.json");
    if let Ok(content) = std::fs::read_to_string(&config_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(v) = json
                .get("downloads")
                .and_then(|d| d.get(field))
                .and_then(|v| v.as_str())
            {
                let trimmed = v.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }
    fallback.to_string()
}
```

**After:**

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

`Path` is already imported in `fs.rs:6` (`use std::path::{Path, PathBuf}`). No new imports.

The split into `configured_subdir` (config reading) + `extract_subdir_name` (post-processing) makes the latter unit-testable in isolation without touching the filesystem.

### 4.5 Add Rust unit tests for `extract_subdir_name`

**File:** `apps/gui/src-tauri/src/commands/fs.rs` (append `#[cfg(test)] mod tests` block at end of file)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    mod extract_subdir_name {
        use super::*;

        #[test]
        fn returns_relative_name_unchanged() {
            assert_eq!(extract_subdir_name("Movies", "fallback"), "Movies");
            assert_eq!(extract_subdir_name("My Custom Folder", "fallback"), "My Custom Folder");
            assert_eq!(extract_subdir_name("TV", "fallback"), "TV");
        }

        #[test]
        fn extracts_basename_from_legacy_full_path() {
            // The pre-A2b default form — must not produce "~_Downloads_..."
            // after sanitize_path_component.
            assert_eq!(
                extract_subdir_name("~/Downloads/Motrix AI/Movies", "fallback"),
                "Movies"
            );
            assert_eq!(
                extract_subdir_name("/home/user/Downloads/Movies", "fallback"),
                "Movies"
            );
        }

        #[test]
        fn extracts_basename_from_windows_style_path() {
            assert_eq!(
                extract_subdir_name("C:\\Users\\me\\Movies", "fallback"),
                "Movies"
            );
        }

        #[test]
        fn returns_fallback_for_root_only_path() {
            // Path::new("/").file_name() returns None — must fall back gracefully.
            assert_eq!(extract_subdir_name("/", "fallback"), "fallback");
            assert_eq!(extract_subdir_name("\\", "fallback"), "fallback");
        }

        #[test]
        fn handles_trailing_separator() {
            // Path::new("/foo/bar/").file_name() returns Some("bar").
            assert_eq!(extract_subdir_name("/foo/bar/", "fallback"), "bar");
        }

        #[test]
        fn empty_basename_falls_back() {
            // A value ending in `..` would resolve weirdly; ensure fallback wins.
            // Path::new("/a/../..").file_name() returns None.
            assert_eq!(extract_subdir_name("/a/../..", "fallback"), "fallback");
        }
    }
}
```

Seven tests covering: relative names, legacy Unix paths, Windows paths, root paths, trailing separators, edge cases.

---

## 5. Testing Strategy

### Existing tests — must remain green

| File                                                  | Tests   | Why unaffected                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/__tests__/config-defaults.test.ts` | 7 tests | One test (`"uses ~/ prefix for all download path fields"`) is REPLACED by 2 sharper tests per §4.2. Other 6 tests unchanged.                                                                                                                                                                         |
| `packages/core/src/__tests__/config-loader.test.ts`   | varies  | Tests loader behavior; loader's `expandPaths` only touches `base_dir` (which is unchanged). Subdir values are passed through verbatim.                                                                                                                                                               |
| `apps/gui/src/__tests__/stores.test.ts`               | 8 tests | The 5 `DEFAULT_CONFIG` references assert values. **Important:** `stores.test.ts:62-63` references `DEFAULT_CONFIG.downloads.rename_template` (unchanged) and `DEFAULT_CONFIG.aria2.rpc_url` (unchanged). No assertions on `movie_dir` etc. — verified by reading the test file. Should remain green. |
| Existing Rust tests in `aria2.rs`, `http_api.rs`      | varies  | Different modules. Untouched by this PR.                                                                                                                                                                                                                                                             |

### New tests

- 1 net new TS test (split: -1 original + 2 new = +1 net)
- 7 new Rust unit tests for `extract_subdir_name`

### Total test impact

- TS: 701 → 702 (+1 net)
- Rust: existing count + 7 new (in `fs.rs::tests::extract_subdir_name::*`)

---

## 6. Verification Gates

All must pass before PR is mergeable.

| Check                  | Command                                                                            | Expected                                     |
| ---------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------- |
| TypeScript strict      | `pnpm typecheck` (workspace, 5 packages)                                           | 0 errors                                     |
| TS unit tests          | `pnpm test` (workspace)                                                            | 702 pass (701 baseline + 1 net new)          |
| ESLint                 | `pnpm lint` (workspace)                                                            | 0 errors, 0 warnings                         |
| Rust unit tests        | `cargo test --manifest-path apps/gui/src-tauri/Cargo.toml`                         | All existing + 7 new tests pass              |
| Rust clippy            | `cargo clippy --manifest-path apps/gui/src-tauri/Cargo.toml -- -D warnings`        | 0 warnings                                   |
| Cross-file consistency | Manual: confirm `defaults.ts` and `config.rs:default_config()` subdir values match | Both say `"Movies"`, `"Software"`, `"Other"` |

---

## 7. Execution Strategy

**Single PR**, 4 commits (one per file, conventional commit messages):

| #   | Commit message                                                                     | Files touched                                                                                 |
| --- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | `refactor(core): change subdir defaults to relative names (Movies/Software/Other)` | `packages/core/src/config/defaults.ts`, `packages/core/src/__tests__/config-defaults.test.ts` |
| 2   | `refactor(backend): sync Rust default_config() subdir defaults with TS`            | `apps/gui/src-tauri/src/commands/config.rs`                                                   |
| 3   | `fix(backend): configured_subdir extracts basename from legacy full-path values`   | `apps/gui/src-tauri/src/commands/fs.rs`                                                       |
| 4   | `test(backend): add unit tests for extract_subdir_name`                            | `apps/gui/src-tauri/src/commands/fs.rs` (appended `#[cfg(test)] mod tests`)                   |

**Branch name:** `refactor/a2b-subdir-semantics-fix`

**Why single PR:** the 4 commits form a coherent bug fix — defaults change (commits 1+2) only make sense together with the read-side tolerance (commit 3) and test coverage (commit 4). Splitting would leave the branch in a half-fixed state.

Commits 3 and 4 both touch `fs.rs` but are logically separate (behavior change vs test addition). Keeping them as separate commits makes review easier.

---

## 8. Risks & Rollback

| Risk                                                                                                        | Likelihood | Impact                                                                           | Mitigation                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing user config has user-customized `movie_dir` containing `/` (e.g., user wanted absolute path)       | Low        | Their custom absolute path gets basename-extracted, ignoring their customization | Pre-existing behavior was already broken (path got mangled by sanitize_path_component). New behavior at least produces a sane directory name. Documentation in `extract_subdir_name` doc comment explains the rule. |
| Rust unit tests fail on edge cases I didn't anticipate (e.g., platform-specific `Path::file_name` behavior) | Low        | Test failure blocks PR                                                           | Tests are run on ubuntu/macOS/Windows in CI matrix; any platform-specific issue surfaces before merge.                                                                                                              |
| `stores.test.ts` has a hidden assertion on `DEFAULT_CONFIG.downloads.movie_dir` that breaks                 | Very low   | Test failure                                                                     | Verified by reading the test file — no such assertion.                                                                                                                                                              |
| Cross-platform path handling: Windows users have config with backslash paths                                | Low        | Same basename extraction logic applies; tests cover it                           | Windows-specific test case in §4.5.                                                                                                                                                                                 |
| `extract_subdir_name` produces empty string for some input                                                  | Low        | `unwrap_or_else(fallback)` handles it                                            | Edge case test in §4.5 (`empty_basename_falls_back`).                                                                                                                                                               |

**Rollback:** Single PR → single `git revert`. No schema change, no on-disk migration, no breaking change to existing configs (they continue working via basename extraction).

---

## 9. Acceptance Criteria

The PR is accepted when **all** of the following are true:

1. `pnpm typecheck` reports 0 errors across all 5 packages.
2. `pnpm test` reports 702 tests passing (701 baseline + 1 net new), 0 failures.
3. `pnpm lint` reports 0 errors, 0 warnings.
4. `cargo test --manifest-path apps/gui/src-tauri/Cargo.toml` passes (existing + 7 new tests).
5. `cargo clippy --manifest-path apps/gui/src-tauri/Cargo.toml -- -D warnings` reports 0 warnings.
6. `grep -nE "movie_dir|software_dir|other_dir" packages/core/src/config/defaults.ts` returns 3 matches, all with relative-name values (no `/`, no `\`, no `~`).
7. `grep -nE "movie_dir|software_dir|other_dir" apps/gui/src-tauri/src/commands/config.rs` returns 3 matches with the same relative-name values as criterion 6.
8. `extract_subdir_name` function exists in `apps/gui/src-tauri/src/commands/fs.rs` with the 7 unit tests defined in §4.5.

---

## 10. Follow-up (not in this spec)

Tracked for separate specs/PRs:

- **Schema additions for `tv_dir`, `anime_dir`, `music_dir`** — currently used by Rust with hardcoded fallbacks; adding them to `AppConfig` schema would let users customize. Feature work, not bug fix.
- **Subtitle pipeline path handling** — `subtitle_dir` has similar potential issues but lives in a different config section. Out of scope here.
- **Cross-language DEFAULT_CONFIG dedup** — Rust's `default_config()` is a separate impl; long-term, a code-generation approach could eliminate manual sync. Overkill for the current 4 fields.
- **Settings UI for subdir fields** — currently no UI exposes `movie_dir`/`software_dir`/`other_dir`; users can only customize via direct config.json editing. A future UX improvement could add fields to `DownloadsTab.vue`.

---

## 11. References

- `AUDIT-REPORT.md` — source of audit findings (P1-13 and related)
- `docs/superpowers/specs/2026-07-17-a2a-config-defaults-unification-design.md` — A2a spec (merged)
- `apps/gui/src-tauri/src/commands/fs.rs:16-31` — `sanitize_path_component` (security defense, untouched)
- `apps/gui/src-tauri/src/commands/fs.rs:61-82` — `configured_subdir` (modified per §4.4)
- `apps/gui/src-tauri/src/commands/fs.rs:325-378` — `organize_file` (consuming the subdirs; unchanged)
- `apps/gui/src-tauri/src/commands/mod.rs:86-120` — `configured_download_dir` (handles `base_dir` correctly; unchanged)
- `apps/gui/src-tauri/src/commands/config.rs:13-18` — Rust `default_config()` subdir defaults (synced per §4.3)
- `packages/core/src/config/defaults.ts:28-33` — TS DEFAULT_CONFIG subdir defaults (changed per §4.1)
