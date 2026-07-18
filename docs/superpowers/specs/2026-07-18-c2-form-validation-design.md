# C2 — Form Validation (P2-10)

**Branch:** `feature/c2-form-validation` | **Base:** `830ac8b`

## Problem

Settings tabs accept any input without validation. Empty download dir → aria2 writes to CWD. Empty API key → LLM calls fail silently. Invalid RPC URL → connection failure with confusing error.

## Scope — 4 files, inline validation (no NForm migration)

### DownloadsTab.vue

- `downloadDir`: non-empty (empty = aria2 writes to CWD)

### AiModelTab.vue

- `model`: non-empty when provider ≠ 'opencode'
- `api_key`: non-empty when provider ∈ {'anthropic', 'openai'}
- `base_url`: valid URL format when non-empty

### AdvancedTab.vue

- `aria2RpcUrl`: valid URL format (must start with http:// or https://)
- `btTracker`: if non-empty, each comma-separated value should look like a URL

### SubtitlesTab.vue

- `subtitleDir`: if non-empty, should look like a path (not validate filesystem)

## Pattern

Inline validation using Naive UI's `status` prop + error text:

```vue
<NInput v-model:value="x" :status="xError ? 'error' : undefined" />
<p v-if="xError" class="form-error">{{ xError }}</p>
```

Computed error:

```typescript
const xError = computed(() => {
  if (!x.value.trim()) return 'Required'
  return ''
})
```

Add `.form-error` CSS class (red, small text, margin-top: 4px) to each tab's scoped styles or to a shared style file.

## Out of scope

- NForm migration (too large)
- Real-time URL reachability checking
- Path existence checking (would need Rust command)
- BottomChat input validation (already has trim check)

## Verification

- `pnpm typecheck` + `pnpm test` (702) + `pnpm lint`: all pass
- No new tests (UI validation, no behavioral logic to test)
