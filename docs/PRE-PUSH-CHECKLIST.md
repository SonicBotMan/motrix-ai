# Pre-Push Verification Checklist

> **MANDATORY** — run ALL of these before `git push`. Missing any item = CI will fail.

## 1. TypeScript (all packages)

```bash
# NOT just GUI — turbo runs all 4 packages
pnpm typecheck

# Equivalent to:
#   packages/core:     tsc --noEmit
#   packages/cli:      tsc --noEmit
#   packages/mcp-server: tsc --noEmit
#   apps/gui:          vue-tsc --noEmit
```

If only GUI changed, still run full `pnpm typecheck` — core types are shared.

## 2. Lint

```bash
pnpm lint
```

## 3. Tests

```bash
pnpm test
```

## 4. Core package build (needed before GUI tests)

```bash
pnpm --filter @motrix-ai/core build
```

## 5. Rust — format check

```bash
cd apps/gui/src-tauri && cargo fmt --check
```

If it fails, run `cargo fmt` and re-commit.

## 6. Rust — compile check (catches warnings-as-errors)

```bash
cd apps/gui/src-tauri && cargo build 2>&1 | grep -i "warning\|error"
```

CI uses `-D warnings` — any warning is a hard error. Common gotchas:

- Unused variables → prefix with `_`
- Non-camel-case type names → rename or add `#[allow(non_camel_case_types)]`
- `&String` where `String` expected → use `.clone()`
- `handle` moved → use `.clone()` before passing to async functions

## 7. Rust — clippy (if available)

```bash
cd apps/gui/src-tauri && cargo clippy 2>&1 | grep -i "warning\|error"
```

## 8. Verify CI workflow locally

Read `.github/workflows/ci.yml` and mentally walk through each step.
Your local verification MUST cover every step the CI runs.

## Common Misses (learned from 5 rounds of CI failures)

| Issue                             | Root cause                                                    | Fix                                          |
| --------------------------------- | ------------------------------------------------------------- | -------------------------------------------- |
| `schema.ts` missing field         | Added field to `AppConfig` type but forgot `validateConfig()` | Search all usages of the type                |
| `createdAt` missing on toast      | Nested if/else branch missed when adding new code             | Check all branches                           |
| `cargo fmt` diff                  | Never ran `cargo fmt` locally                                 | Add to checklist                             |
| `.body(&body)` type error         | `reqwest::Body` doesn't impl `From<&String>`                  | Use `.body(body.clone())`                    |
| `unwrap_or_else(\|_\|)` on Option | `Option::unwrap_or_else` takes `FnOnce()`, not `FnOnce(T)`    | Use `\|\|` not `\|_\|` or use `.unwrap_or()` |
| `handle` moved into async         | AppHandle doesn't impl Copy                                   | Always `.clone()` before async moves         |
| `EXECUTION_STATE` naming          | Rust requires UpperCamelCase for types                        | Rename or `#[allow(non_camel_case_types)]`   |

## Rule

**"Tests pass" ≠ "CI will pass". Tests are necessary but insufficient.
Run the FULL verification checklist, not just the parts you can easily do.**
