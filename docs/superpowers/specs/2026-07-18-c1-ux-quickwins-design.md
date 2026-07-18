# C1 — UX Quick Wins (aria-labels + SearchResultsModal i18n + AdvancedTab aria2 options)

**Date:** 2026-07-18 | **Branch:** `feature/c1-ux-quickwins` | **Base:** `e2e594e`

## 3 fixes

### P2-11: aria-label gaps (~13 missing across 6 files)

- DetailFooter.vue: 4 buttons (Pause/Resume/Retry/Priority) — 0 labels
- EmptyState.vue: 2 buttons — 0 labels
- RowMenu.vue: 4 buttons — 1 label
- BottomChat.vue: 1 missing
- OnboardingCard.vue: 1 missing
- TaskFirstView.vue: 1 missing

### P1-3: SearchResultsModal i18n (~7 hardcoded strings)

Wire `t()` for: "Search Results:", "resources", "Searching...", "No resources found", "Download", "Subtitles". Add keys to `locales/strings.ts`.

### P1-7: AdvancedTab aria2 options (3 new fields)

Add: `check-certificate` (checkbox), `bt-tracker` (text), `header` (textarea).

## Verification

- `pnpm typecheck` + `pnpm test` (702) + `pnpm lint`: all pass
- No new tests (UI changes, no behavioral logic)

## Execution: 3 commits (one per fix)
