# B Reliability Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Fix P0-4 (TOCTOU), P1-6 (crash recovery), P2-27 (queue race). 3 files, ~50 lines net.

## Global Constraints

- Repo: `/home/h523034406/motrix-ai`, branch `fix/b-reliability-fixes`
- TS strict. No `any`, no `eslint-disable`.
- Rust: no `unwrap()` in production. Clippy must be clean.
- `cargo` cannot run locally (sandbox lacks Tauri deps). CI verifies Rust.
- Tests: `pnpm test`. Typecheck: `pnpm typecheck`. Lint: `pnpm lint`.

---

### Task 1: Fix P0-4 — TOCTOU in organize_file

**File:** `apps/gui/src-tauri/src/commands/fs.rs`

**Step 1:** Read lines 420-442 of fs.rs to see the current `organize_file` write logic.

**Step 2:** Apply 2 fixes:

**Fix A (line 431):** Change `target_dir.join(...)` to `canon_target.join(...)`:

Before:

```rust
target_dir.join(format!("{} (2){}", stem, ext))
```

After:

```rust
canon_target.join(format!("{} (2){}", stem, ext))
```

**Fix B (before line 436, after computing `final_path`):** Add re-canonicalization:

```rust
// P0-4 FIX: Re-validate canonical path right before write to close TOCTOU window.
// A symlink swap between the earlier canonicalize (line 408) and this write
// could redirect the file outside base_dir.
let canon_final = final_path
    .canonicalize()
    .unwrap_or_else(|_| final_path.clone());
let canon_base_now = base_dir
    .canonicalize()
    .unwrap_or_else(|_| base_dir.clone());
if !canon_final.starts_with(&canon_base_now) {
    return Err(format!(
        "Security: final path escaped base dir before write: {} not under {}",
        canon_final.display(),
        canon_base_now.display()
    ));
}
```

Insert this AFTER `let final_path = ...` (line 434) and BEFORE `if src != final_path {` (line 436).

**Step 3:** `cargo fmt -- src/commands/fs.rs` (if available locally).

**Step 4:** Commit: `fix(backend): close TOCTOU window in organize_file before rename/copy`

---

### Task 2: Fix P1-6 — aria2c restart after reconnection exhaustion

**File:** `apps/gui/src/composables/useAria2.ts`

**Step 1:** Read the `scheduleReconnect` function (around line 185).

**Step 2:** Add `restartAttempted` flag (near other module-level state, around line 129-130):

```typescript
let restartAttempted = false
```

**Step 3:** Modify `scheduleReconnect` to attempt aria2c restart before giving up.

In the `scheduleReconnect` function, find the block where `reconnectAttempt >= maxReconnectRef.value`:

Before:

```typescript
if (reconnectAttempt >= maxReconnectRef.value) {
  emitConnection('error', `Max reconnect attempts (${maxReconnectRef.value}) reached`)
  return
}
```

After:

```typescript
if (reconnectAttempt >= maxReconnectRef.value) {
  if (!restartAttempted) {
    restartAttempted = true
    emitConnection('reconnecting', 'Restarting aria2c daemon...')
    reconnectTimer = setTimeout(async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core')
        await invoke('start_aria2', { rpcPort: 6800 })
        reconnectAttempt = 0
        scheduleReconnect()
      } catch {
        emitConnection('error', 'aria2c restart failed. Please restart the app.')
      }
    }, 2000)
    return
  }
  emitConnection('error', `Max reconnect attempts (${maxReconnectRef.value}) reached`)
  return
}
```

**Step 4:** Also reset `restartAttempted` in the `reset()` function (around line 486):

Add `restartAttempted = false` to the `reset()` function body.

**Step 5:** Run `pnpm typecheck` + `pnpm test` + `pnpm lint`.

**Step 6:** Commit: `fix(gui): restart aria2c after reconnection exhaustion`

---

### Task 3: Fix P2-27 — QueueManager polling instead of blind sleep

**File:** `packages/core/src/queue/manager.ts`

**Step 1:** Replace the `add` method:

Before:

```typescript
async add(uri: string, sourceQuery?: string, options?: { dir?: string }): Promise<Task> {
  const gid = await this.aria2.addUri(uri, options)
  await new Promise((resolve) => setTimeout(resolve, 200))
  const status = await this.aria2.tellStatus(gid)
  return this.aria2.mapToTask(status, sourceQuery)
}
```

After:

```typescript
async add(uri: string, sourceQuery?: string, options?: { dir?: string }): Promise<Task> {
  const gid = await this.aria2.addUri(uri, options)
  // Poll for task registration instead of a fixed 200ms sleep.
  // aria2 may take a variable amount of time to register the task after addUri.
  const MAX_RETRIES = 5
  const RETRY_DELAY_MS = 100
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const status = await this.aria2.tellStatus(gid)
      return this.aria2.mapToTask(status, sourceQuery)
    } catch (err) {
      if (attempt === MAX_RETRIES - 1) {
        throw new Error(
          `Task ${gid} not found after ${MAX_RETRIES} attempts: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }
  // Unreachable — loop always returns or throws
  throw new Error(`Task ${gid} registration failed`)
}
```

**Step 2:** Run `pnpm typecheck` + `pnpm test` + `pnpm lint`.

**Step 3:** Commit: `fix(core): poll for task registration instead of blind 200ms sleep`

---

### Final Verification

```bash
pnpm typecheck && pnpm test && pnpm lint
cargo fmt --check --manifest-path apps/gui/src-tauri/Cargo.toml -- src/commands/fs.rs  # if available
git log --oneline main..HEAD  # 4 commits: spec/plan + 3 fixes
```
