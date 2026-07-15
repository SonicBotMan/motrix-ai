# Feature: Search Engine Robustness

> **Audit Ref**: P2-15
> **Priority**: P2 — Reliability
> **Estimate**: 6-8 hours
> **Risk**: Medium (external site changes can break at any time)

## Problem

`apps/gui/src-tauri/src/commands/search.rs` uses 29 pre-compiled regex patterns (all with `.expect("regex compile error")`) to scrape HTML from 5 torrent search engines: Btdig, Mikan, 1337x, Nyaa, TorrentGalaxy.

Any site layout change breaks the corresponding parser silently — search returns 0 results from that engine with no user feedback.

## Goal

1. Search degrades gracefully: if one engine fails, others still return results
2. Failed engines are visible to the user (not silently dropped)
3. Regex patterns are testable and maintainable

## Implementation Plan

### Step 1: Add per-engine error isolation (2h)

Currently `searchAll()` in `packages/core/src/search/provider.ts` likely catches errors per-provider. Verify this, and ensure each provider failure is logged and returned as an empty result set, not propagated as a fatal error.

### Step 2: Add HTML fixture tests (3h)

For each search engine, save a sample HTML response as a test fixture. Write tests that:

- Parse the fixture and assert expected results
- Alert when the regex no longer matches (canary tests)

```
packages/core/src/__tests__/fixtures/
  btdig-sample.html
  mikan-sample.xml
  1337x-sample.html
  nyaa-sample.html
```

### Step 3: Add health reporting (1h)

Return per-engine status in the search response:

```typescript
{
  results: SearchResult[],
  engineStatus: { btdig: 'ok', mikan: 'ok', '1337x': 'failed: regex mismatch', nyaa: 'ok' }
}
```

Display in SearchResultsModal: "⚠️ 1337x search unavailable" as a subtle banner.

### Step 4: Prefer APIs over scraping (2h, ongoing)

- Mikan: Already uses RSS (good)
- 1337x: Has an unofficial API — evaluate
- Nyaa: Has RSS feeds — switch from HTML scraping
- Btdig: No API available — keep scraping but add user-agent rotation

### Step 5: Replace .expect() with lazy compilation + fallback (0.5h)

Change regex statics from `.expect()` to `Option<Regex>` compiled lazily. If compilation fails (shouldn't happen with static patterns), return empty results instead of panicking.

## Verification

- All existing search tests pass
- New fixture tests pass
- Simulate a broken regex (temporarily corrupt one pattern) — search still returns results from other engines
