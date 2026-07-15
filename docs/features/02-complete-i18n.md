# Feature: Complete Frontend i18n

> **Audit Ref**: P1-3
> **Priority**: P1 — User experience
> **Estimate**: 8-12 hours
> **Risk**: Low (additive changes, no behavior change for English users)

## Problem

The app declares 5 supported languages (en/zh/ja/ko/fr) in `config.ts:58`, but hundreds of user-facing strings are hardcoded. Verified hardcoded strings exist in:

- `SearchResultsModal.vue` — 9 Chinese strings (lines 75, 76, 86, 91, 139, 149, 150, 177)
- `AppearanceTab.vue` — Chinese strings
- `OnboardingView.vue` — Chinese strings
- `TaskDetailModal.vue` — English status text (lines 141-145)
- `TaskFirstView.vue` — mix of `t()` calls and hardcoded strings
- `DetailPanel.vue` — hardcoded English labels
- `BottomChat.vue` — hardcoded placeholder
- CLI commands — now converted to English (P2-21 done)

The custom `t()` function (`useSettings.ts:854`) returns the key itself on miss, silently hiding gaps.

## Goal

Every user-facing string in the GUI passes through `t()`. All 5 languages have complete coverage.

## Implementation Plan

### Phase 1: Audit all hardcoded strings (2h)

Run a comprehensive grep for hardcoded user-facing text in all `.vue` files:

```bash
grep -rn ">[A-Z\u4e00-\u9fff]" apps/gui/src --include="*.vue" | grep -v "v-if\|v-for\|@\|:\|<!--"
```

Build a spreadsheet of: file, line, current text, proposed i18n key.

### Phase 2: Add missing translation keys (2h)

Add keys to the `strings` object in `useSettings.ts` for all 5 languages. Group by component prefix:

- `search.*` — SearchResultsModal
- `detail.*` — DetailPanel
- `task.*` — TaskFirstView, TaskTable
- `onboarding.*` — OnboardingView
- `settings.*` — Settings tabs

### Phase 3: Replace hardcoded strings (4h)

Mechanically replace each hardcoded string with `{{ t('key') }}` or `:placeholder="t('key')"`.

### Phase 4: Extract translation dictionary (2h)

Move the 800+ line `strings` object from `useSettings.ts` to `apps/gui/src/locales/{en,zh,ja,ko,fr}.ts`. Load lazily based on `language.value`.

### Phase 5: Add missing-translation warning (optional, 1h)

In dev mode, log a warning when `t()` returns the key itself (translation miss).

## Verification

- `grep -P "[\x{4e00}-\x{9fff}]" apps/gui/src/**/*.vue` returns 0 matches (no hardcoded Chinese)
- Switch language to Japanese — all visible text changes
- `pnpm test` passes

## Scope Notes

- CLI is already English (P2-21 done) — no i18n needed for CLI
- MCP server returns English JSON — no i18n needed
- Rust backend logs are English — no i18n needed
