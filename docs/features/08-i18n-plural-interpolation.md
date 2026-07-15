# Feature: i18n Pluralization and Interpolation

> **Audit Ref**: P3-6
> **Priority**: P3 — i18n maturity
> **Estimate**: 3-4 hours
> **Risk**: Low (additive, backward-compatible)

## Problem

The custom `t()` function (`useSettings.ts:854`) does simple key→string lookup with no support for:

1. **Pluralization**: "1 task" vs "5 tasks" vs "0 tasks" — different forms in many languages
2. **Interpolation**: `"Found {count} results in {seconds}s"` — variables in strings
3. **Gender/context**: Some languages need grammatical agreement

Current workaround: template literal concatenation like `` `${count} tasks` `` which is untranslatable.

## Goal

`t()` supports ICU MessageFormat for plurals and interpolation. Existing single-string translations continue to work (backward-compatible).

## Implementation Plan

### Option A: Upgrade custom `t()` (2h, recommended)

Add minimal ICU MessageFormat parsing:

```typescript
export function t(key: string, params?: Record<string, unknown>): string {
  const template = strings[key]?.[language.value] ?? key
  if (!params) return template

  // Simple interpolation: {count} → params.count
  let result = template.replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ''))

  // Plural: {count, plural, one {1 task} other {# tasks}}
  result = result.replace(/\{(\w+),\s*plural,\s*([^}]+)\}/g, (_, name, body) => {
    const count = Number(params[name]) || 0
    // Parse "one {...} other {...}" pairs
    const forms: Record<string, string> = {}
    body.replace(/(\w+)\s+\{([^}]+)\}/g, (_, form, text) => {
      forms[form] = text
    })
    const form = count === 1 ? 'one' : 'other'
    return (forms[form] || forms.other || '').replace(/#/g, String(count))
  })

  return result
}
```

### Option B: Switch to vue-i18n (4h, heavier)

Add `vue-i18n` as dependency, migrate all `t()` calls, move translations to JSON files.

**Not recommended** — the custom system works and adding a dependency for this is overkill.

### Migration Plan

1. Upgrade `t()` signature to accept optional `params` (backward-compatible — no params = current behavior)
2. Update the ~10 call sites that use template literals to use `t('key', { count: n })`
3. Add pluralized translation keys for common patterns:
   - `task.count`: `{count, plural, one {# task} other {# tasks}}`
   - `search.found`: `{count, plural, one {Found # result} other {Found # results}}`
   - `queue.active`: `{count, plural, one {# active download} other {# active downloads}}`

## Verification

- `t('task.count', { count: 1 })` returns "1 task" in English, "1个任务" in Chinese
- `t('task.count', { count: 5 })` returns "5 tasks" in English, "5个任务" in Chinese
- `t('search.title')` (no params) still works exactly as before
- All existing tests pass
