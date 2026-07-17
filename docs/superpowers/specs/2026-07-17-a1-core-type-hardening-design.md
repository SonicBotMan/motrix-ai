# A1 — Core Type Hardening (IntentParser + Aria2Client)

**Date:** 2026-07-17
**Status:** Design — Pending Implementation
**Spec owner:** Maintainer
**Audit baseline:** `AUDIT-REPORT.md` @ commit `cd20305` (2026-07-15)
**Verified against:** `main` @ commit `98b6b7f` (2026-07-17)
**Parent initiative:** Sub-project A (Code Quality / Architecture) → A1 quick wins slice

---

## 1. Problem Statement

The post-v1.3.0 audit (`AUDIT-REPORT.md`) flagged 5 low-risk code-quality items under the "A1 quick wins" slice. Verification against current `main` (`98b6b7f`) shows **2 of the 5 are already resolved** by follow-up commits; **3 remain open** plus **2 related type-safety issues** surfaced during verification. All 5 remaining issues live in 2 files under `packages/core/src/`.

### Findings already resolved (no action required)

| Audit # | Originally flagged | Current state |
|---|---|---|
| P1-2 | `QueueView.vue` 1159 lines of dead code | ✅ File deleted. Only a historical comment reference remains in `apps/gui/src/composables/useAria2.ts:16`. |
| P2-7 | Duplicate design tokens in `main.css` vs `tokens.css` | ✅ `main.css:2` now declares `tokens.css` as the single source of truth; no duplicate token definitions remain. |

### Findings still open (in scope)

| # | File:line | Issue | Audit # |
|---|---|---|---|
| 1 | `packages/core/src/ai/intent-parser.ts:30-31` | `private client: any = null` with `// eslint-disable-next-line @typescript-eslint/no-explicit-any` | P2-24 |
| 2 | `packages/core/src/ai/intent-parser.ts:48, 121` | `this.client!.session.create()` and `this.client!.session.prompt(...)` use non-null assertion (`!`) on a nullable field | Derived from P2-24 |
| 3 | `packages/core/src/ai/intent-parser.ts:49` | `res.data!.id as string` — non-null assertion **plus** `as string` cast (id may be `string \| number`) | Derived from P2-24 |
| 4 | `packages/core/src/ai/intent-parser.ts:165-169` | `catch {` does not bind the error object; uses `console.warn` instead of the structured `createLogger` mandated by repo `AGENTS.md` | P2-25 |
| 5 | `packages/core/src/aria2/client.ts:62` | `return data.result as T` — when aria2 returns a malformed response (neither `result` nor `error`), this silently returns `undefined as T` to every caller | P2-26 |

### Why this matters

- **Issue 1–3** defeat TypeScript's strict mode at the most critical trust boundary (untrusted external service response). The `eslint-disable` is also a linting regression the repo explicitly wants gone.
- **Issue 4** violates two explicit constraints in `AGENTS.md`: *"Use logger from `packages/core/src/logger.ts`"* and *"Never leave catch blocks empty"*. The current `catch {` loses the error object entirely — when OpenCode fails, the actual root cause (network? auth? malformed response?) is unobservable.
- **Issue 5** lets a protocol violation propagate as `undefined` through the call chain. Callers like `tellStatus()` would then try to read `.gid` on `undefined` and throw an opaque `TypeError` far from the actual root cause.

---

## 2. Scope

### In scope

- 5 type-safety / observability fixes in exactly 2 files:
  - `packages/core/src/ai/intent-parser.ts` (171 lines → ~190 lines)
  - `packages/core/src/aria2/client.ts` (174 lines → ~180 lines)
- 2 new test cases appended to existing test files (no new test files)
- Removal of 1 `eslint-disable` comment

### Out of scope (explicit)

- All P0 / P1 audit findings (security, race conditions, crash recovery)
- Sub-project A2 (type/config unification between GUI and core)
- Sub-project A3 (splitting `DetailPanel` / `TaskFirstView` / `TaskTable` / `useSettings`)
- Any Rust changes
- Any frontend / Vue changes
- Any new dependencies (uses existing `createLogger`, `Aria2Error`)
- Refactoring beyond the 5 specific issues — even if adjacent code looks improvable

---

## 3. Design Decision: How to Type the IntentParser Client Field

The `client` field holds the return value of `createOpencodeClient()` from `@opencode-ai/sdk` (v1.17.18+). Three approaches were considered.

### Approach A — `ReturnType<typeof createOpencodeClient>` (RECOMMENDED)

```typescript
import type { createOpencodeClient } from '@opencode-ai/sdk'
type OpencodeClient = ReturnType<typeof createOpencodeClient>

export class IntentParser {
  private client: OpencodeClient | null = null
  // ...
}
```

- Type-only import — zero runtime impact, does not interfere with the existing dynamic `await import('@opencode-ai/sdk')` at line 41.
- Type auto-tracks SDK signature changes.
- Standard TypeScript idiom for "type the return of a factory function."

### Approach B — Structural interface (deferred fallback)

```typescript
interface OpencodeClientLike {
  session: {
    create(): Promise<{ data?: { id: string | number } }>
    prompt(args: unknown): Promise<{ data?: unknown }>
  }
}
```

Used only if Approach A fails (e.g., SDK does not export `createOpencodeClient` as a typed named export). Decision is made at implementation time after running `pnpm typecheck`.

### Approach C — `unknown` + user-defined type guard

Considered and rejected: overkill for a single-use private field; forces a type guard at every call site.

**Decision:** Approach A. Fall back to Approach B only if typecheck fails, and document the fallback reason in the commit message.

---

## 4. Implementation

All changes are localized. Each subsection shows exact before/after.

### 4.1 IntentParser: client field typing (Issues 1, 2, 3 — combined)

The three issues are intertwined (`any` field is what makes `!` and `as string` necessary) and must be fixed together.

**Before** (`intent-parser.ts:29-51`):

```typescript
export class IntentParser {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK client has complex union types
  private client: any = null
  private sessionId: string | null = null
  private baseUrl: string

  constructor(options: IntentParserOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:4096'
  }

  private async ensureClient() {
    if (this.client) return
    const { createOpencodeClient } = await import('@opencode-ai/sdk')
    this.client = createOpencodeClient({ baseUrl: this.baseUrl })
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId
    await this.ensureClient()
    const res = await this.client!.session.create()
    this.sessionId = res.data!.id as string
    return this.sessionId
  }
```

**After**:

```typescript
import type { createOpencodeClient } from '@opencode-ai/sdk'
import { createLogger } from '../logger.js'

type OpencodeClient = ReturnType<typeof createOpencodeClient>

const logger = createLogger('intent-parser')

export class IntentParser {
  private client: OpencodeClient | null = null
  private sessionId: string | null = null
  private baseUrl: string

  constructor(options: IntentParserOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:4096'
  }

  private async ensureClient(): Promise<OpencodeClient> {
    if (this.client) return this.client
    const { createOpencodeClient } = await import('@opencode-ai/sdk')
    this.client = createOpencodeClient({ baseUrl: this.baseUrl })
    return this.client
  }

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

Key changes:
1. `any` field → properly typed `OpencodeClient | null`. `eslint-disable` line removed.
2. `ensureClient()` now returns the client, so callers get a non-null reference through the type system (no more `this.client!`).
3. `ensureSession()` uses optional chaining `res.data?.id` instead of `res.data!.id`.
4. `as string` replaced with explicit `String(id)` after guarding `id === undefined`. Handles both `string` and `number` SDK return shapes safely.

**Side effect — `parse()` call site at line 121:**

The `parse()` method currently calls `this.client!.session.prompt(...)`. After the type change, it must obtain the client through `ensureClient()`:

**Before** (`intent-parser.ts:116-121`):

```typescript
async parse(input: string): Promise<DownloadIntent> {
  try {
    await this.ensureClient()
    const sessionId = await this.ensureSession()

    const result = await this.client!.session.prompt({
```

**After**:

```typescript
async parse(input: string): Promise<DownloadIntent> {
  try {
    const client = await this.ensureClient()
    const sessionId = await this.ensureSession()

    const result = await client.session.prompt({
```

### 4.2 IntentParser: error capture + structured logger (Issue 4)

**Before** (`intent-parser.ts:165-169`):

```typescript
} catch {
  console.warn('[intent-parser] OpenCode unavailable, falling back to heuristic')
  // OpenCode 不可用,使用内置启发式解析. Error logged above.
  return this.parseHeuristic(input)
}
```

**After**:

```typescript
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err)
  logger.warn('OpenCode unavailable, falling back to heuristic', { error: detail })
  return this.parseHeuristic(input)
}
```

The `logger` constant is module-scoped (declared at the top, alongside the new `OpencodeClient` type alias, per §4.1).

This satisfies both `AGENTS.md` constraints:
- ✅ Uses `createLogger` from `packages/core/src/logger.ts`
- ✅ Catch block is not empty (captures `err`, surfaces it via structured log)

### 4.3 Aria2Client: null guard on RPC result (Issue 5)

**Before** (`client.ts:44-63`):

```typescript
private async call<T>(method: string, ...params: unknown[]): Promise<T> {
  // ... fetch, parse ...
  const data = (await res.json()) as { result?: T; error?: { code: number; message: string } }
  if (data.error) {
    logger.error(`RPC call "${method}" failed: ${data.error.code} ${data.error.message}`)
    throw new Aria2Error(`aria2 error ${data.error.code}: ${data.error.message}`)
  }
  return data.result as T
}
```

**After**:

```typescript
private async call<T>(method: string, ...params: unknown[]): Promise<T> {
  // ... fetch, parse ...
  const data = (await res.json()) as { result?: T; error?: { code: number; message: string } }
  if (data.error) {
    logger.error(`RPC call "${method}" failed: ${data.error.code} ${data.error.message}`)
    throw new Aria2Error(`aria2 error ${data.error.code}: ${data.error.message}`)
  }
  if (data.result === undefined) {
    // JSON-RPC 2.0 spec §5.1: response MUST contain either result or error.
    // Reaching this branch means aria2 violated the protocol or sent a malformed response.
    logger.error(`RPC call "${method}" returned malformed response: no result and no error`)
    throw new Aria2Error(`aria2 RPC "${method}" returned malformed response (no result, no error)`)
  }
  return data.result
}
```

No other lines in `client.ts` are touched.

---

## 5. Testing Strategy

### Existing tests — must remain green

| File | Tests | Why unaffected |
|---|---|---|
| `packages/core/src/__tests__/intent-parser.test.ts` | 15 | All exercise the heuristic fallback path. The mocked SDK throws, the new `catch (err)` block captures it, fallback fires — identical behavior. |
| `packages/core/src/__tests__/intent-parser-edge-cases.test.ts` | 13 | Same path. The existing `vi.mock('@opencode-ai/sdk', () => ({ createOpencodeClient: vi.fn() }))` returns `undefined`, which means `this.client` is assigned `undefined`; the new `ensureClient()` still returns it (no runtime guard inside `ensureClient` itself — TypeScript narrows at the call site via the `const client = await this.ensureClient()` pattern, but at runtime an `undefined` value still flows through and throws at `client.session.create()`). The outer `catch` then handles it as before. |
| `packages/core/src/__tests__/aria2-client.test.ts` | 20+ | All existing mocks return a `result` field. The new `undefined` guard is not triggered. |

### New tests — exactly 2

#### Test 1: IntentParser logs error info on fallback

Add to `packages/core/src/__tests__/intent-parser-edge-cases.test.ts`:

```typescript
it('logs the underlying error when falling back to heuristic', async () => {
  const { IntentParser } = await import('../ai/intent-parser.js')
  const parser = new IntentParser()

  // Mock the SDK to throw a specific error
  const { createOpencodeClient } = await import('@opencode-ai/sdk')
  vi.mocked(createOpencodeClient).mockImplementation(() => {
    throw new Error('connection refused')
  })

  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  // parse() should fall back; the structured logger writes via console.error
  await parser.parse('any input')

  expect(consoleErrorSpy).toHaveBeenCalled()
  const [msg] = consoleErrorSpy.mock.calls[0]
  expect(String(msg)).toContain('intent-parser')
  expect(String(msg)).toContain('connection refused')

  consoleErrorSpy.mockRestore()
})
```

#### Test 2: Aria2Client throws on malformed RPC response

Add to `packages/core/src/__tests__/aria2-client.test.ts`, in the `describe('error handling')` block:

```typescript
it('throws Aria2Error when response has neither result nor error', async () => {
  // Malformed JSON-RPC response: spec violation
  fetchSpy.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ jsonrpc: '2.0', id: 'test' }),  // no result, no error
  } as unknown as Response)

  const client = new Aria2Client()
  await expect(client.tellActive()).rejects.toThrow(Aria2Error)
  await expect(client.tellActive()).rejects.toThrow(/malformed response/)
})
```

**Total new test count: 2.** Total tests in repo changes from 685 to 687.

---

## 6. Verification Gates

All must pass before PR is mergeable. No exceptions.

| Check | Command | Expected |
|---|---|---|
| TypeScript strict | `pnpm --filter @motrix-ai/core typecheck` | 0 errors. Critically: **no `eslint-disable` for `no-explicit-any` remains in `intent-parser.ts`**. |
| Unit tests | `pnpm --filter @motrix-ai/core test` | All green. Count: 685 existing + 2 new = 687. |
| ESLint | `pnpm --filter @motrix-ai/core lint` | 0 errors, 0 warnings. The previously-disabled `no-explicit-any` line is gone. |
| Workspace-wide | `pnpm typecheck && pnpm test && pnpm lint` (repo root) | All green. Confirms no caller of IntentParser or Aria2Client breaks due to type changes. |
| Rust | `cargo test` (in `apps/gui/src-tauri/`) | Not run **locally** — no Rust changes in this PR. (CI still runs Rust tests as part of the matrix; they will be green because nothing in `apps/gui/src-tauri/` is touched.) |

### Manual spot check (optional but recommended)

```bash
cd /home/h523034406/motrix-ai
pnpm --filter @motrix-ai/core test -- intent-parser
pnpm --filter @motrix-ai/core test -- aria2-client
```

Both targeted test runs must be green.

---

## 7. Execution Strategy

**Single PR**, 5 commits with conventional-message prefixes. Each commit is independently reviewable and revertible.

| # | Commit message | Files touched |
|---|---|---|
| 1 | `refactor(core): type IntentParser client via ReturnType<typeof createOpencodeClient>` | `intent-parser.ts` |
| 2 | `refactor(core): replace non-null assertions in IntentParser with explicit guards` | `intent-parser.ts` |
| 3 | `fix(core): use structured logger in IntentParser catch, preserve error info` | `intent-parser.ts` |
| 4 | `fix(core): guard Aria2Client.call against malformed RPC responses` | `client.ts` |
| 5 | `test(core): cover IntentParser logger call + Aria2Client null-result path` | `intent-parser-edge-cases.test.ts`, `aria2-client.test.ts` |

**Branch name:** `refactor/a1-core-type-hardening`

**Why single PR:** total diff is ~60–80 lines across 4 files. Splitting further adds review overhead without risk-isolation benefit (all 5 changes are type-safety improvements with the same verification gate).

---

## 8. Risks & Rollback

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `@opencode-ai/sdk` does not export `createOpencodeClient` as a typed named export (Approach A fails) | Low | Blocked implementation | Fall back to Approach B (structural interface). Commit message documents the pivot. Decision made within first implementation step. |
| 28 existing IntentParser tests go red after type change | Low | Blocked PR | Type changes are confined to `ensureClient` / `ensureSession` internals. Heuristic path (used by tests) does not touch these except via the outer try/catch, which preserves fallback behavior. If red: investigate test mock assumptions, fix forward. |
| New `data.result === undefined` guard triggers on a real-world malformed aria2 response nobody noticed before | Very low | Surfaced latent bug | This is a *good* outcome. Investigate the aria2 instance producing the malformed response; the new `Aria2Error` includes the method name for diagnosis. |
| Logger output format changes break a log-parsing consumer | Very low | Observability regression | The repo has no log-parsing consumer (logs go to stderr only, per `logger.ts` docstring). |

**Rollback:** Single PR → single `git revert`. No migration, no data changes.

---

## 9. Acceptance Criteria

The PR is accepted when **all** of the following are true:

1. `pnpm --filter @motrix-ai/core typecheck` reports 0 errors.
2. `pnpm --filter @motrix-ai/core lint` reports 0 errors and 0 warnings.
3. `pnpm --filter @motrix-ai/core test` reports all green (687 tests).
4. `grep -nF "eslint-disable" packages/core/src/ai/intent-parser.ts` returns no matches.
5. `grep -nE "as any|eslint-disable|!\\.session|data!\\.id" packages/core/src/ai/intent-parser.ts` returns no matches.
6. `grep -nE "as T$|data\\.result as T" packages/core/src/aria2/client.ts` returns no matches.
7. The 2 new tests exist and pass.

---

## 10. Follow-up (not in this spec)

Items this spec intentionally does not address but should be tracked:

- **A2:** Unify GUI types/config with `@motrix-ai/core` (audit P1-1, P1-13). This is the next sub-project in the A track.
- **A3:** Split oversized components (`DetailPanel`, `TaskFirstView`, `TaskTable`, `useSettings`).
- Other `any` / non-null assertion instances elsewhere in `packages/core` — a workspace-wide sweep is a separate spec.
- The `console.warn` → `createLogger` migration is repo-wide; this spec handles only the `intent-parser.ts` instance.

---

## 11. References

- `AUDIT-REPORT.md` — source of audit findings (commit `cd20305`)
- `AGENTS.md` — repo conventions (typed errors, structured logger, no empty catch)
- `packages/core/src/errors.ts` — `AppError` / `Aria2Error` hierarchy
- `packages/core/src/logger.ts` — `createLogger(prefix)` factory
- `docs/superpowers/specs/2026-07-08-config-system-unification-design.md` — sibling spec (A2 preview)
