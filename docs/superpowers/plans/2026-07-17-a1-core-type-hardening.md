# A1 Core Type Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate 5 type-safety / observability defects in `packages/core/src/ai/intent-parser.ts` and `packages/core/src/aria2/client.ts`, removing the last `eslint-disable` and all non-null assertions at the OpenCode/aria2 trust boundaries.

**Architecture:** Three isolated TDD tasks. Task 1 types the IntentParser client field via `ReturnType<typeof createOpencodeClient>` and replaces non-null assertions with explicit guards. Task 2 captures errors in the IntentParser catch block and routes them through the repo's structured logger. Task 3 adds a null guard to Aria2Client RPC result handling. No new files; no new dependencies; no public API changes.

**Tech Stack:** TypeScript 5.5+, vitest 4.1+, @opencode-ai/sdk 1.17.18+, internal `@motrix-ai/core` logger/errors modules.

## Global Constraints

- **Repo root:** `/home/h523034406/motrix-ai` (already cloned, on branch `refactor/a1-core-type-hardening`)
- **Spec doc:** `docs/superpowers/specs/2026-07-17-a1-core-type-hardening-design.md` (committed at `c0a1e0e`)
- **Baseline commit:** `98b6b7f` (main, 2026-07-17). Working tree starts clean except for the spec commit.
- TypeScript strict mode is on. Never re-introduce `any`, `as any`, or `eslint-disable` for `no-explicit-any`.
- Errors must use `AppError` subclasses from `packages/core/src/errors.ts` (here: `Aria2Error`).
- Logging must use `createLogger(prefix)` from `packages/core/src/logger.ts`, never bare `console.*` (per `AGENTS.md`).
- Tests live in `packages/core/src/__tests__/`, not co-located with sources.
- Conventional commit messages (`refactor(core):` / `fix(core):` prefixes); each task = one commit.
- Run all `pnpm` commands from repo root unless the step says otherwise.

---

### Task 1: Type the IntentParser client field and eliminate non-null assertions

**Why this is one task, not three:** The `any` field type, the `this.client!` non-null assertions, and the `res.data!.id as string` double hack are all symptoms of the same root cause — the field is untyped. Removing the `any` makes the `!` assertions type-compile errors, so they MUST be replaced in the same commit. Splitting would leave the file in a non-compiling intermediate state.

**Files:**

- Modify: `packages/core/src/ai/intent-parser.ts` (top imports, class fields, `ensureClient`, `ensureSession`, `parse` call site)
- Verify-only: `packages/core/src/__tests__/intent-parser.test.ts`, `packages/core/src/__tests__/intent-parser-edge-cases.test.ts` (no edits)

**Interfaces:**

- Consumes: `createOpencodeClient` factory from `@opencode-ai/sdk` (already dynamically imported at runtime)
- Produces:
  - `IntentParser.client: OpencodeClient | null` (was `any`)
  - `IntentParser.ensureClient(): Promise<OpencodeClient>` (was `Promise<void>`)
  - External behavior of `parse()` and `parseHeuristic()` unchanged

This task is a pure type-level refactor — no runtime behavior change. The "test cycle" is: typecheck passes, lint passes (no more `eslint-disable`), all 28 existing IntentParser tests stay green.

- [ ] **Step 1: Add type-only SDK import, module-scoped logger, and OpencodeClient alias**

In `packages/core/src/ai/intent-parser.ts`, replace lines 1–5 exactly:

Before:

```typescript
// ai/intent-parser.ts — 自然语言意图解析
// 对应 PRD §6.1 NL→结构化意图
// 已验证：OpenCode SDK JSON Schema 结构化输出

import type { DownloadIntent, Quality, ResourceType } from '../types.js'
```

After:

```typescript
// ai/intent-parser.ts — 自然语言意图解析
// 对应 PRD §6.1 NL→结构化意图
// 已验证：OpenCode SDK JSON Schema 结构化输出

import type { createOpencodeClient } from '@opencode-ai/sdk'
import type { DownloadIntent, Quality, ResourceType } from '../types.js'
import { createLogger } from '../logger.js'

type OpencodeClient = ReturnType<typeof createOpencodeClient>

const logger = createLogger('intent-parser')
```

(The `logger` constant is declared now so Task 2 can use it without re-touching imports.)

- [ ] **Step 2: Replace `any` field type and remove the eslint-disable line**

In the same file, replace lines 29–33 exactly:

Before:

```typescript
export class IntentParser {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK client has complex union types
  private client: any = null
  private sessionId: string | null = null
  private baseUrl: string
```

After:

```typescript
export class IntentParser {
  private client: OpencodeClient | null = null
  private sessionId: string | null = null
  private baseUrl: string
```

- [ ] **Step 3: Refactor `ensureClient()` to return the typed client**

Replace lines 39–43 exactly:

Before:

```typescript
  private async ensureClient() {
    if (this.client) return
    const { createOpencodeClient } = await import('@opencode-ai/sdk')
    this.client = createOpencodeClient({ baseUrl: this.baseUrl })
  }
```

After:

```typescript
  private async ensureClient(): Promise<OpencodeClient> {
    if (this.client) return this.client
    const { createOpencodeClient } = await import('@opencode-ai/sdk')
    this.client = createOpencodeClient({ baseUrl: this.baseUrl })
    return this.client
  }
```

- [ ] **Step 4: Replace non-null assertions in `ensureSession()` with explicit guards**

Replace lines 45–51 exactly:

Before:

```typescript
  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId
    await this.ensureClient()
    const res = await this.client!.session.create()
    this.sessionId = res.data!.id as string
    return this.sessionId
  }
```

After:

```typescript
  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId
    const client = await this.ensureClient()
    const res = await client.session.create()
    const id = res.data?.id
    if (id === undefined) {
      throw new Error('[intent-parser] OpenCode session.create returned no session id')
    }
    this.sessionId = String(id)
    return this.sessionId
  }
```

`String(id)` handles both `string` and `number` SDK return shapes (the OpenCode SDK types `id` as `string | number`).

- [ ] **Step 5: Update the `parse()` call site to consume the returned client**

Replace lines 117–121 exactly:

Before:

```typescript
    try {
      await this.ensureClient()
      const sessionId = await this.ensureSession()

      const result = await this.client!.session.prompt({
```

After:

```typescript
    try {
      const client = await this.ensureClient()
      const sessionId = await this.ensureSession()

      const result = await client.session.prompt({
```

- [ ] **Step 6: Run typecheck — this is the Approach A validation gate**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core typecheck
```

**Expected:** PASS with 0 errors.

**If this FAILS** with an error like `Cannot find name 'createOpencodeClient'` or `Module '"@opencode-ai/sdk"' has no exported member 'createOpencodeClient'`:

- Pivot to Approach B from spec §3. Replace the top-of-file block from Step 1 with:

```typescript
import type { DownloadIntent, Quality, ResourceType } from '../types.js'
import { createLogger } from '../logger.js'

/** Structural view of the OpenCode SDK methods we use. */
interface OpencodeClientLike {
  session: {
    create(): Promise<{ data?: { id: string | number } }>
    prompt(args: unknown): Promise<{ data?: unknown }>
  }
}
type OpencodeClient = OpencodeClientLike

const logger = createLogger('intent-parser')
```

- Re-run typecheck. Document the pivot in the commit message (Step 9).

- [ ] **Step 7: Run lint and verify the eslint-disable is gone**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core lint
```

**Expected:** PASS with 0 errors, 0 warnings.

Verify directly:

```bash
grep -nF "eslint-disable" packages/core/src/ai/intent-parser.ts
```

**Expected:** no output.

- [ ] **Step 8: Run all IntentParser tests to verify no behavioral regression**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core test -- intent-parser
```

**Expected:** PASS, 28 tests (15 in `intent-parser.test.ts` + 13 in `intent-parser-edge-cases.test.ts`).

The existing edge-case test mocks `createOpencodeClient` to return `undefined`; the new typed code still throws at `client.session.create()` (since `undefined` flows through), the outer `catch` still catches, and heuristic fallback fires. Behavior unchanged.

- [ ] **Step 9: Commit**

```bash
cd /home/h523034406/motrix-ai
git add packages/core/src/ai/intent-parser.ts
git commit -m "refactor(core): type IntentParser client, eliminate non-null assertions

Replaces 'any' field with ReturnType<typeof createOpencodeClient> type
derivation (Approach A per spec §3). Removes the eslint-disable for
no-explicit-any. ensureClient() now returns the typed client so callers
narrow through the type system instead of using '!' non-null assertions.
ensureSession() uses optional chaining + explicit undefined guard instead
of 'res.data!.id as string'.

No runtime behavior change. All 28 IntentParser tests still pass.

Spec: docs/superpowers/specs/2026-07-17-a1-core-type-hardening-design.md §4.1
Audit: P2-24"
```

If you pivoted to Approach B, append to the commit message body:

```
[Approach B] SDK does not export createOpencodeClient as a typed value; used
structural OpencodeClientLike interface instead.
```

---

### Task 2: Capture errors and use structured logger in IntentParser catch block

**Files:**

- Modify: `packages/core/src/ai/intent-parser.ts` (catch block at end of `parse()`)
- Modify: `packages/core/src/__tests__/intent-parser-edge-cases.test.ts` (add 1 test inside the existing describe block)

**Interfaces:**

- Consumes: `logger` constant declared in Task 1 Step 1 (module-scoped `createLogger('intent-parser')`)
- Produces: when `parse()` falls back to heuristic, a structured warn log is emitted containing the underlying error message

This task changes runtime observability — currently a connection failure to OpenCode produces only a fixed `console.warn` with no error detail; after this task, the actual error message is captured and routed through the structured logger.

- [ ] **Step 1: Write the failing test**

In `packages/core/src/__tests__/intent-parser-edge-cases.test.ts`, locate the existing `describe('IntentParser edge cases — heuristic fallback', () => {` block. Inside it (anywhere before the final closing `})` of that describe), add this test:

```typescript
it('logs the underlying error message when falling back to heuristic', async () => {
  const { IntentParser } = await import('../ai/intent-parser.js')
  const { createOpencodeClient } = await import('@opencode-ai/sdk')
  const parser = new IntentParser()

  // Force ensureClient to throw a specific, identifiable error
  vi.mocked(createOpencodeClient).mockImplementation(() => {
    throw new Error('connection refused')
  })

  // The repo's logger writes via console.error (see packages/core/src/logger.ts)
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  try {
    await parser.parse('any input')

    expect(consoleErrorSpy).toHaveBeenCalled()
    const joined = consoleErrorSpy.mock.calls.flat().map(String).join(' ')
    expect(joined).toContain('intent-parser')
    expect(joined).toContain('connection refused')
  } finally {
    consoleErrorSpy.mockRestore()
    vi.mocked(createOpencodeClient).mockReset()
  }
})
```

This follows the existing per-test dynamic-import pattern used by every other test in the file (the top-level `vi.mock('@opencode-ai/sdk', ...)` is hoisted by vitest; the per-test `await import` re-resolves against the mock).

- [ ] **Step 2: Run the test to verify it fails for the right reason**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core test -- intent-parser-edge-cases
```

**Expected:** FAIL. The new test fails because:

1. Current code uses `console.warn` (not `console.error`), so `consoleErrorSpy` is never called.
2. Current code does not capture or log the actual error message — only a fixed string.

If the test fails for a DIFFERENT reason (e.g., import error, mock setup error), investigate before proceeding — that signals an environment issue, not the intended assertion failure.

- [ ] **Step 3: Implement the catch block fix**

In `packages/core/src/ai/intent-parser.ts`, replace the catch block at the end of `parse()`:

Before:

```typescript
    } catch {
      console.warn('[intent-parser] OpenCode unavailable, falling back to heuristic')
      // OpenCode 不可用,使用内置启发式解析. Error logged above.
      return this.parseHeuristic(input)
    }
```

After:

```typescript
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      logger.warn('OpenCode unavailable, falling back to heuristic', { error: detail })
      return this.parseHeuristic(input)
    }
```

The `logger` constant was added in Task 1 Step 1. No new imports needed.

- [ ] **Step 4: Run the new test to verify it passes**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core test -- intent-parser-edge-cases
```

**Expected:** PASS. The describe block now has 14 tests (13 original + 1 new).

- [ ] **Step 5: Run the full IntentParser suite to verify no collateral damage**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core test -- intent-parser
```

**Expected:** PASS, 29 tests total (15 in `intent-parser.test.ts` + 14 in `intent-parser-edge-cases.test.ts`).

- [ ] **Step 6: Run lint and typecheck**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core lint && pnpm --filter @motrix-ai/core typecheck
```

**Expected:** Both PASS with 0 errors and 0 warnings.

- [ ] **Step 7: Commit**

```bash
cd /home/h523034406/motrix-ai
git add packages/core/src/ai/intent-parser.ts packages/core/src/__tests__/intent-parser-edge-cases.test.ts
git commit -m "fix(core): capture and log IntentParser fallback errors via structured logger

The previous 'catch { console.warn(...) }' lost the actual error object,
making OpenCode connection failures unobservable — root cause (network?
auth? malformed response?) was thrown away. Now captures the error,
extracts its message, and routes through the repo's structured logger
(createLogger('intent-parser')) per AGENTS.md conventions.

Adds a test that mocks createOpencodeClient to throw 'connection refused'
and asserts the warn log includes both the 'intent-parser' prefix and
the underlying error message.

Spec: docs/superpowers/specs/2026-07-17-a1-core-type-hardening-design.md §4.2
Audit: P2-25"
```

---

### Task 3: Guard Aria2Client.call against malformed JSON-RPC responses

**Files:**

- Modify: `packages/core/src/aria2/client.ts` (the `call()` method's tail)
- Modify: `packages/core/src/__tests__/aria2-client.test.ts` (add 1 test inside the existing `describe('error handling')` block)

**Interfaces:**

- Consumes: `Aria2Error` from `../errors.js` (already imported at line 5 of `client.ts`)
- Produces: `Aria2Client.call<T>()` throws `Aria2Error` (instead of silently resolving with `undefined as T`) when the JSON-RPC response contains neither `result` nor `error`

This task prevents a JSON-RPC 2.0 protocol violation from silently propagating as `undefined` through the call chain, where it would later surface as an opaque `TypeError` far from the actual root cause.

- [ ] **Step 1: Write the failing test**

In `packages/core/src/__tests__/aria2-client.test.ts`, locate the `describe('error handling', () => {` block (around line 155). Add this test inside it, before the closing `})` of that describe:

```typescript
it('throws Aria2Error with "malformed response" when result and error both absent', async () => {
  // JSON-RPC 2.0 §5.1 violation: response must contain result OR error
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 'test' }),
  } as unknown as Response)

  const client = new Aria2Client()
  await expect(client.tellActive()).rejects.toThrow(Aria2Error)
  await expect(client.tellActive()).rejects.toThrow(/malformed response/)
})
```

`fetchSpy` is set up by the outer `beforeEach` and `mockResolvedValue` applies to all subsequent calls, so calling `tellActive()` twice is fine — both consume the same mock. The pattern matches the existing `'throws Aria2Error on RPC error response'` test in style.

- [ ] **Step 2: Run the test to verify it fails for the right reason**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core test -- aria2-client
```

**Expected:** FAIL. The new test fails because the current code does `return data.result as T` — when `result` is undefined, no error is thrown. `tellActive()` resolves with `undefined`, so the `.rejects.toThrow()` assertion fails (the promise resolved, not rejected).

- [ ] **Step 3: Implement the null guard**

In `packages/core/src/aria2/client.ts`, replace the tail of the `call()` method:

Before:

```typescript
    const data = (await res.json()) as { result?: T; error?: { code: number; message: string } }
    if (data.error) {
      logger.error(`RPC call "${method}" failed: ${data.error.code} ${data.error.message}`)
      throw new Aria2Error(`aria2 error ${data.error.code}: ${data.error.message}`)
    }
    return data.result as T
  }
```

After:

```typescript
    const data = (await res.json()) as { result?: T; error?: { code: number; message: string } }
    if (data.error) {
      logger.error(`RPC call "${method}" failed: ${data.error.code} ${data.error.message}`)
      throw new Aria2Error(`aria2 error ${data.error.code}: ${data.error.message}`)
    }
    if (data.result === undefined) {
      // JSON-RPC 2.0 §5.1: response MUST contain either result or error.
      logger.error(`RPC call "${method}" returned malformed response: no result and no error`)
      throw new Aria2Error(`aria2 RPC "${method}" returned malformed response (no result, no error)`)
    }
    return data.result
  }
```

- [ ] **Step 4: Run the new test to verify it passes**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core test -- aria2-client
```

**Expected:** PASS. The `error handling` describe now has 4 tests (3 original + 1 new).

- [ ] **Step 5: Run the full core suite to verify no regression**

```bash
cd /home/h523034406/motrix-ai && pnpm --filter @motrix-ai/core test
```

**Expected:** PASS, all core tests green. Total count: 685 baseline + 2 new (Task 2 + Task 3) = 687.

- [ ] **Step 6: Run workspace-wide typecheck**

```bash
cd /home/h523034406/motrix-ai && pnpm typecheck
```

**Expected:** PASS. This verifies no caller of `Aria2Client.call()` (in `cli`, `mcp-server`, or `gui`) breaks due to the now-strict return type — `T` instead of `T | undefined`.

(`pnpm lint` and `pnpm test` at workspace root can be run too, but the prior per-package runs already cover the changes; workspace-wide typecheck is the one that catches cross-package impact.)

- [ ] **Step 7: Commit**

```bash
cd /home/h523034406/motrix-ai
git add packages/core/src/aria2/client.ts packages/core/src/__tests__/aria2-client.test.ts
git commit -m "fix(core): guard Aria2Client.call against malformed JSON-RPC responses

When aria2 returns a response with neither 'result' nor 'error' (a
JSON-RPC 2.0 §5.1 protocol violation), the previous code silently
returned 'undefined as T', letting the bad value propagate through
the call chain until it surfaced as an opaque TypeError far from the
root cause.

Now throws Aria2Error with the method name for diagnosis. Adds a test
covering the malformed-response path.

Spec: docs/superpowers/specs/2026-07-17-a1-core-type-hardening-design.md §4.3
Audit: P2-26"
```

---

### Final Verification (after all 3 tasks)

These map 1:1 to spec §9 Acceptance Criteria. All must pass before considering the branch done.

- [ ] **Step 1: Per-package quality gates**

```bash
cd /home/h523034406/motrix-ai
pnpm --filter @motrix-ai/core typecheck   # Criterion 1
pnpm --filter @motrix-ai/core lint        # Criterion 2
pnpm --filter @motrix-ai/core test        # Criterion 3 (687 tests)
```

**Expected:** all three PASS, 0 errors / 0 warnings / 687 tests green.

- [ ] **Step 2: Source-code grep checks (Criteria 4–6)**

```bash
cd /home/h523034406/motrix-ai

# Criterion 4: no eslint-disable in intent-parser.ts
grep -nF "eslint-disable" packages/core/src/ai/intent-parser.ts

# Criterion 5: no any / eslint-disable / !.session / data!.id in intent-parser.ts
grep -nE "as any|eslint-disable|!\.session|data!\.id" packages/core/src/ai/intent-parser.ts

# Criterion 6: no 'as T' or 'data.result as T' in client.ts
grep -nE "as T$|data\.result as T" packages/core/src/aria2/client.ts
```

**Expected:** all three grep commands return no output.

- [ ] **Step 3: New tests exist (Criterion 7)**

```bash
cd /home/h523034406/motrix-ai
grep -nF "logs the underlying error message" packages/core/src/__tests__/intent-parser-edge-cases.test.ts
grep -nF "malformed response" packages/core/src/__tests__/aria2-client.test.ts
```

**Expected:** 1 match each.

- [ ] **Step 4: Workspace-wide check**

```bash
cd /home/h523034406/motrix-ai && pnpm typecheck && pnpm test && pnpm lint
```

**Expected:** all green across all workspaces (`core`, `cli`, `mcp-server`, `gui`).

- [ ] **Step 5: Verify branch commit history**

```bash
cd /home/h523034406/motrix-ai && git log --oneline main..HEAD
```

**Expected:** 4 commits total:

1. `docs(spec): add A1 core type hardening design spec` (already on branch as `c0a1e0e`)
2. `refactor(core): type IntentParser client, eliminate non-null assertions`
3. `fix(core): capture and log IntentParser fallback errors via structured logger`
4. `fix(core): guard Aria2Client.call against malformed JSON-RPC responses`

- [ ] **Step 6: Hand off to maintainer for push / PR decision**

The branch is locally complete. Maintainer decides whether to push and open a PR. Do NOT push without explicit instruction.

---

## Self-Review (completed during plan authoring)

**1. Spec coverage:**

- Spec §4.1 (Issues 1, 2, 3 — IntentParser typing + non-null assertions) → Task 1 ✓
- Spec §4.2 (Issue 4 — catch block logger) → Task 2 ✓
- Spec §4.3 (Issue 5 — Aria2Client null guard) → Task 3 ✓
- Spec §5 (testing strategy) → tests folded into Tasks 2 and 3 (TDD order) ✓
- Spec §6 (verification gates) → Final Verification steps 1–4 ✓
- Spec §9 (acceptance criteria 1–7) → Final Verification steps 1–3 cover all 7 ✓

**2. Placeholder scan:** No "TBD", "TODO", "implement later", or generic error-handling text. All code blocks contain runnable content. All commands have expected output.

**3. Type consistency:**

- `OpencodeClient` type alias declared in Task 1 Step 1, consumed in Task 1 Steps 2/3 (no cross-task reference — Task 2 and 3 don't touch it)
- `logger` module-scoped constant declared in Task 1 Step 1, consumed in Task 2 Step 3 — name and prefix (`'intent-parser'`) match
- `Aria2Error` already imported in `client.ts` line 5; no new imports needed in Task 3
- Method names (`ensureClient`, `ensureSession`, `parse`, `parseHeuristic`, `call`) match across all tasks ✓

**4. Scope discipline:** No drift into A2/A3 territory. No opportunistic refactors of nearby code. The 3 tasks touch exactly the lines listed in spec §4.
