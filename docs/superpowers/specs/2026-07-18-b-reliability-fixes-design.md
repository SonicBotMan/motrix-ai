# B — Reliability Fixes (P0-4 TOCTOU + P1-6 crash recovery + P2-27 queue race)

**Date:** 2026-07-18
**Status:** Design — Pending Implementation
**Verified against:** `main` @ `dcd2919`

## Open findings (3 of original 8)

P0-1, P0-2, P0-3, P1-5, P1-11, P1-12, P1-14 already fixed in prior commits.

### P0-4: TOCTOU race in organize_file (fs.rs)

**Problem:** `safe_join` canonicalizes the path at validation time (line 408-418), but the actual `rename`/`copy` happens later (line 436-441). Between these, a symlink swap could redirect the write outside base_dir. Additionally, line 431 uses `target_dir` (un-canonicalized) instead of `canon_target` for the "(2)" duplicate-name path.

**Fix:**

1. Line 431: change `target_dir.join(...)` → `canon_target.join(...)` (use validated path)
2. Before `rename`/`copy` (line 436): re-canonicalize `final_path`, verify still under `canon_base`

### P1-6: aria2c crash — no auto-restart after reconnection exhaustion

**Problem:** `scheduleReconnect` (useAria2.ts:185) retries RPC connection with exponential backoff. After max attempts, it emits 'error' and gives up. But if aria2c CRASHED, no amount of RPC retrying helps — the process is dead.

**Fix:** After max reconnection attempts, try one `invoke('start_aria2')` to restart the daemon. If restart succeeds, reset reconnection counter and retry. If restart fails, give up. Guarded by `restartAttempted` flag to prevent infinite loops.

### P2-27: QueueManager.add — 200ms blind sleep

**Problem:** `manager.ts:17` does `await new Promise(r => setTimeout(r, 200))` after `addUri` before `tellStatus`. Fixed delay is fragile (too short on slow systems, unnecessary on fast ones).

**Fix:** Replace with polling loop: retry `tellStatus` up to 5 times × 100ms. Throw typed error if still not registered after 500ms.

## Scope

- Modify: `apps/gui/src-tauri/src/commands/fs.rs` (P0-4, ~15 lines)
- Modify: `apps/gui/src/composables/useAria2.ts` (P1-6, ~15 lines)
- Modify: `packages/core/src/queue/manager.ts` (P2-27, ~20 lines)

## Verification

- `pnpm typecheck`: 0 errors
- `pnpm test`: 702 pass
- `pnpm lint`: 0 errors
- `cargo test` + `cargo clippy` (CI-verified; sandbox lacks Tauri build deps)
- P0-4 fix has no new test (requires filesystem race simulation — out of scope)
- P1-6 fix has no new test (requires aria2 crash simulation — out of scope)
- P2-27: existing tests should still pass (no behavioral change for happy path)

## Execution

Single PR, 3 commits (one per fix). Branch: `fix/b-reliability-fixes`
