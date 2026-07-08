# Config System Unification & Architecture Optimization

**Date:** 2026-07-08
**Status:** Design
**Scope:** Config system unification, AI config consolidation, reactivity fixes, i18n completion

---

## 1. Problem Statement

Motrix AI has 6 architectural-level config issues identified during settings audit:

1. **Config fragmentation** — 3 independent config systems that never sync:
   - GUI localStorage (15+ scattered keys like `motrix-ai:download-dir`, `motrix-ai:llm-config`)
   - Pinia `useConfigStore` (dead code — 0 consumers in .vue files)
   - Core file config (`~/.motrix-ai/config.json`) — used by CLI/MCP only

2. **AI config triple redundancy** — 3 storage points with one-way sync:
   - `motrix-ai:ai-config` (useAIProvider: provider/model/apiKey/baseUrl)
   - `motrix-ai:llm-endpoint` + `motrix-ai:llm-api-key` + `motrix-ai:llm-model` (SettingsView legacy)
   - `motrix-ai:llm-config` (useOpenCode: the one actually consumed)

3. **i18n incomplete** — ScheduleConfig (12 Chinese hardcoded strings), NASConfig (15 Chinese), SettingsView (~20 English)

4. **Reactivity gaps** — `statusLabel` computed reads non-reactive localStorage; won't update when LLM config changes

5. **NAS backend missing** — `test_nas_connection` Rust command not implemented; no rsync integration (out of scope for this spec)

6. **`commands/config.rs` empty** — Rust backend doesn't participate in config read/write

Items 1-4 and 6 are in scope. Item 5 (NAS backend) is deferred to a separate spec.

---

## 2. Target Architecture

```
~/.motrix-ai/config.json (persistence layer — single source of truth)
        ↕  Tauri commands (load/save/update)
Pinia useConfigStore (reactive cache — sole entry point for components)
        ↕  computed / watch / direct ref access
Vue components (SettingsView, ScheduleConfig, NASConfig, useAria2, useOpenCode...)
```

### Design principles

- **Single source of truth:** `~/.motrix-ai/config.json` is the only persistence layer. No localStorage config keys.
- **Reactive cache:** Pinia store loads from file on init, writes back on any change via deep watch.
- **No scattered keys:** All individual `motrix-ai:*` localStorage keys are eliminated. The store is the only config interface.
- **Schema-validated:** All writes pass through `validateConfig()` from `packages/core/src/config/schema.ts`.
- **CLI/MCP/GUI consistency:** All three read/write the same file. No sync logic needed.

---

## 3. Rust Backend (commands/config.rs)

Implement 3 Tauri commands in `apps/gui/src-tauri/src/commands/config.rs`:

### 3.1 `load_config`

```rust
#[tauri::command]
pub async fn load_config() -> Result<serde_json::Value, String> {
    // Reads ~/.motrix-ai/config.json
    // Falls back to DEFAULT_CONFIG if file doesn't exist
    // Runs migrateConfig() for backward compatibility
    // Returns validated AppConfig as JSON
}
```

Implementation: Rust code using `std::fs` + `serde_json` + `dirs::home_dir()`. The path is `home_dir().join(".motrix-ai").join("config.json")`, matching the core TypeScript `loadConfig()` in `packages/core/src/config/loader.ts`. If the file doesn't exist, create the directory, write defaults, and return them. If the file exists but is unparseable, return defaults. Schema migration (v1→v2) is performed in Rust by checking `schemaVersion` and applying the migration step from Section 5.6.

### 3.2 `save_config`

```rust
#[tauri::command]
pub async fn save_config(config: serde_json::Value) -> Result<(), String> {
    // Validates config structure (basic type checks)
    // Creates config dir if needed
    // Writes JSON to ~/.motrix-ai/config.json
}
```

Wrapped in `tokio::task::spawn_blocking` for file I/O.

### 3.3 `update_config_section`

```rust
#[tauri::command]
pub async fn update_config_section(
    section: String,
    value: serde_json::Value,
) -> Result<serde_json::Value, String> {
    // Loads current config
    // Merges the section update
    // Saves back
    // Returns the updated full config
}
```

This allows partial updates without sending the entire config object. The section parameter is one of: `ai`, `aria2`, `downloads`, `schedule`, `disk`, `subtitles`, `archive`, `ui`.

### 3.4 Registration

All 3 commands registered in `lib.rs` `invoke_handler!` macro:

```rust
commands::config::load_config,
commands::config::save_config,
commands::config::update_config_section,
```

---

## 4. Pinia Store Rewrite (stores/config.ts)

### 4.1 Store responsibilities

- Load config from file on store initialization (async `init()`)
- Expose reactive `config` ref for components
- Auto-persist to file on any change (deep watch)
- Provide `updateSection()` for targeted updates
- Provide `reset()` to restore defaults

### 4.2 Store API

```typescript
export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>(deepClone(DEFAULT_CONFIG))
  const loaded = ref(false)
  const saving = ref(false)

  async function init(): Promise<void> {
    try {
      const fileConfig = await invoke<AppConfig>('load_config')
      config.value = mergeConfig(DEFAULT_CONFIG, fileConfig)
    } catch {
      // Tauri not available (vite dev) — fall back to localStorage migration
      config.value = migrateFromLocalStorage()
    } finally {
      loaded.value = true
    }
  }

  async function save(): Promise<void> {
    if (saving.value) return
    saving.value = true
    try {
      await invoke('save_config', { config: config.value })
    } catch (e) {
      console.error('Failed to save config:', e)
    } finally {
      saving.value = false
    }
  }

  function updateSection<K extends keyof AppConfig>(section: K, value: Partial<AppConfig[K]>): void {
    config.value = {
      ...config.value,
      [section]: { ...config.value[section], ...value },
    }
  }

  async function reset(): Promise<void> {
    config.value = deepClone(DEFAULT_CONFIG)
    await save()
  }

  // Auto-persist on change (debounced to avoid excessive writes)
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  watch(
    config,
    () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        void save()
      }, 500)
    },
    { deep: true },
  )

  return { config, loaded, saving, init, save, updateSection, reset }
})
```

### 4.3 Initialization sequence

Called from `App.vue` `onMounted` (or `main.ts` after pinia setup):

```typescript
// App.vue
import { useConfigStore } from '@/stores/config'

onMounted(async () => {
  const configStore = useConfigStore()
  await configStore.init()
})
```

### 4.4 localStorage migration

On first load after upgrade, if `~/.motrix-ai/config.json` doesn't exist but localStorage keys do, migrate them:

```typescript
function migrateFromLocalStorage(): AppConfig {
  const config = deepClone(DEFAULT_CONFIG)
  try {
    // AI config
    const aiConfig = localStorage.getItem('motrix-ai:ai-config')
    if (aiConfig) {
      const parsed = JSON.parse(aiConfig)
      config.ai = { ...config.ai, ...parsed }
    }
    // Download dir
    const downloadDir = localStorage.getItem('motrix-ai:download-dir')
    if (downloadDir) {
      config.downloads.base_dir = JSON.parse(downloadDir)
    }
    // Subtitle settings
    const subLangs = localStorage.getItem('motrix-ai:subtitle-languages')
    if (subLangs) {
      config.subtitles.preferred_languages = JSON.parse(subLangs)
    }
    // Aria2 RPC
    const rpcUrl = localStorage.getItem('motrix-ai:aria2-rpc-url')
    if (rpcUrl) config.aria2.rpc_url = JSON.parse(rpcUrl)
    const rpcSecret = localStorage.getItem('motrix-ai:aria2-rpc-secret')
    if (rpcSecret) config.aria2.rpc_secret = JSON.parse(rpcSecret)
    // Subtitle dir + API key + auto-search
    const subDir = localStorage.getItem('motrix-ai:subtitle-dir')
    if (subDir) config.subtitles.subtitle_dir = JSON.parse(subDir)
    const subApiKey = localStorage.getItem('motrix-ai:opensubtitles-api-key')
    if (subApiKey) config.subtitles.opensubtitles_api_key = subApiKey
    const autoSub = localStorage.getItem('motrix-ai:auto-search-subtitles')
    if (autoSub !== null) config.subtitles.auto_search = JSON.parse(autoSub) !== false
    // Schedule rules
    const schedRules = localStorage.getItem('motrix-ai:schedule-rules')
    if (schedRules) config.schedule.rules = JSON.parse(schedRules)
    // Log level
    const logLevel = localStorage.getItem('motrix-ai:log-level')
    if (logLevel) config.ui.log_level = JSON.parse(logLevel)
    // Theme & language
    const theme = localStorage.getItem('motrix-ai:theme')
    if (theme) config.ui.theme = JSON.parse(theme)
    const lang = localStorage.getItem('motrix-ai:language')
    if (lang) config.ui.language = JSON.parse(lang)
  } catch {
    /* best-effort */
  }
  return config
}
```

After successful migration, old localStorage keys are cleaned up.

---

## 5. Schema Extension

### 5.1 New `ui` section

Added to `AppConfig` in `packages/core/src/types.ts`:

```typescript
interface AppConfig {
  // ... existing sections ...
  ui: {
    theme: 'dark' | 'light' | 'system'
    language: 'en' | 'zh' | 'ja' | 'ko' | 'fr'
    log_level: 'debug' | 'info' | 'warn' | 'error'
  }
}
```

### 5.2 Extended `subtitles` section

```typescript
subtitles: {
  enabled: boolean
  preferred_languages: string[]
  sources: { shooter: boolean; subhd: boolean; opensubtitles: boolean }
  subtitle_dir?: string           // NEW
  opensubtitles_api_key?: string  // NEW
  auto_search: boolean            // NEW
}
```

### 5.3 Extended `aria2` section

```typescript
aria2: {
  rpc_url: string
  rpc_secret?: string
}
```

(Already exists in schema — no change needed. Just ensuring GUI uses it.)

### 5.4 Default values

```typescript
ui: {
  theme: 'dark',
  language: 'en',
  log_level: 'info',
},
subtitles: {
  // ... existing defaults ...
  subtitle_dir: '~/Downloads/Motrix AI/Subtitles',
  opensubtitles_api_key: '',
  auto_search: true,
},
```

### 5.5 Schema validation

Add validation for the new `ui` section in `packages/core/src/config/schema.ts`:

```typescript
function validateUi(raw: unknown, defaults: AppConfig['ui']): AppConfig['ui'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }

  const VALID_THEMES = ['dark', 'light', 'system'] as const
  const VALID_LANGS = ['en', 'zh', 'ja', 'ko', 'fr'] as const
  const VALID_LEVELS = ['debug', 'info', 'warn', 'error'] as const

  if (raw.theme !== undefined) {
    assert(
      typeof raw.theme === 'string' && (VALID_THEMES as readonly string[]).includes(raw.theme),
      'ui.theme',
      `must be one of: ${VALID_THEMES.join(', ')}`,
    )
    result.theme = raw.theme as AppConfig['ui']['theme']
  }
  if (raw.language !== undefined) {
    assert(
      typeof raw.language === 'string' && (VALID_LANGS as readonly string[]).includes(raw.language),
      'ui.language',
      `must be one of: ${VALID_LANGS.join(', ')}`,
    )
    result.language = raw.language as AppConfig['ui']['language']
  }
  if (raw.log_level !== undefined) {
    assert(
      typeof raw.log_level === 'string' && (VALID_LEVELS as readonly string[]).includes(raw.log_level),
      'ui.log_level',
      `must be one of: ${VALID_LEVELS.join(', ')}`,
    )
    result.log_level = raw.log_level as AppConfig['ui']['log_level']
  }

  return result
}
```

Add `ui` to `validateConfig()` main function.

### 5.6 Migration

Add migration step in `migrations.ts` for schema version 1 → 2:

```typescript
{
  from: 1,
  to: 2,
  migrate: (config) => {
    config.ui = config.ui ?? { theme: 'dark', language: 'en', log_level: 'info' }
    config.subtitles.subtitle_dir = config.subtitles.subtitle_dir ?? ''
    config.subtitles.opensubtitles_api_key = config.subtitles.opensubtitles_api_key ?? ''
    config.subtitles.auto_search = config.subtitles.auto_search ?? true
    config.schemaVersion = 2
    return config
  },
}
```

Bump `SCHEMA_VERSION` to 2.

---

## 6. AI Config Consolidation

### 6.1 Eliminate three stores

| Current store       | Key                                    | Consumer             | After                      |
| ------------------- | -------------------------------------- | -------------------- | -------------------------- |
| useAIProvider       | `motrix-ai:ai-config`                  | SettingsView BYOK UI | `config.ai`                |
| SettingsView legacy | `motrix-ai:llm-endpoint/api-key/model` | Advanced endpoint UI | Removed (merged into BYOK) |
| useOpenCode         | `motrix-ai:llm-config`                 | parseIntent          | `config.ai` (computed)     |

### 6.2 useAIProvider rewrite

```typescript
export function useAIProvider() {
  const store = useConfigStore()
  const config = computed(() => store.config.ai)

  const availableProviders = computed(() => /* same as before */)
  const modelOptions = computed(() => /* same as before */)
  const currentProvider = computed(() => PROVIDERS[config.value.provider])

  function setProvider(provider: AIProvider) {
    store.updateSection('ai', {
      provider,
      model: PROVIDERS[provider].models[0],
    })
  }
  function setModel(model: string) {
    store.updateSection('ai', { model })
  }
  function setApiKey(key: string) {
    store.updateSection('ai', { api_key: key })
  }
  function setBaseUrl(url: string) {
    store.updateSection('ai', { base_url: url })
  }

  return { config, availableProviders, modelOptions, currentProvider,
           setProvider, setModel, setApiKey, setBaseUrl }
}
```

### 6.3 useOpenCode rewrite

```typescript
export function useOpenCode() {
  const store = useConfigStore()
  const llmConfigured = computed(() => {
    const ai = store.config.ai
    return ai.provider !== 'opencode' || !!ai.api_key
  })
  const statusLabel = computed(() => (llmConfigured.value ? 'LLM Connected' : 'Heuristic Mode'))
  const connected = ref(true)

  function getLLMConfig(): LLMConfig | null {
    const ai = store.config.ai
    if (ai.provider === 'opencode') return null
    // Map provider to endpoint
    const endpoints: Record<string, string> = {
      anthropic: 'https://api.anthropic.com/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
      ollama: ai.base_url
        ? `${ai.base_url.replace(/\/$/, '')}/v1/chat/completions`
        : 'http://127.0.0.1:11434/v1/chat/completions',
    }
    const endpoint = endpoints[ai.provider]
    if (!endpoint) return null
    return { endpoint, api_key: ai.api_key ?? '', model: ai.model }
  }

  // parseIntent stays the same, just reads from getLLMConfig()
  // ...
}
```

### 6.4 SettingsView "Advanced: Custom Endpoint" removal

The Advanced section that directly edits `llmEndpoint`/`llmApiKey`/`llmModel` is removed. The BYOK provider selector gains a `custom` provider option for OpenAI-compatible endpoints.

The `AIProvider` type in `packages/core/src/types.ts` and `apps/gui/src/stores/config.ts` is extended:

```typescript
export type AIProvider = 'opencode' | 'anthropic' | 'openai' | 'ollama' | 'custom'
```

The `VALID_PROVIDERS` array in `schema.ts` is updated to include `'custom'`. When `custom` is selected, the `ai.base_url` field stores the endpoint URL (required), `ai.model` stores the model name (required), and `ai.api_key` stores the API key (optional for local endpoints).

```typescript
const PROVIDERS = {
  // ... existing ...
  custom: {
    name: 'Custom (OpenAI Compatible)',
    models: [], // user types model name manually
    requiresKey: true,
  },
}
```

When `custom` is selected, show endpoint + model + API key fields (same as the old Advanced section, but unified into the BYOK flow). The `useOpenCode.getLLMConfig()` function maps `custom` provider by using `ai.base_url` directly as the endpoint.

---

## 7. Reactivity Fixes

All components and composables that currently read from localStorage switch to reading from `useConfigStore`:

| Component       | Current (localStorage)                                              | After (Pinia store)                                  |
| --------------- | ------------------------------------------------------------------- | ---------------------------------------------------- |
| SettingsView    | `useLocalStorage('motrix-ai:download-dir')`                         | `store.config.downloads.base_dir`                    |
| SettingsView    | `useLocalStorage('motrix-ai:aria2-rpc-url')`                        | `store.config.aria2.rpc_url`                         |
| SettingsView    | `useLocalStorage('motrix-ai:log-level')`                            | `store.config.ui.log_level`                          |
| useSettings     | `load('motrix-ai:theme')`                                           | `store.config.ui.theme`                              |
| useSettings     | `load('motrix-ai:language')`                                        | `store.config.ui.language`                           |
| useAIProvider   | `localStorage.getItem('motrix-ai:ai-config')`                       | `store.config.ai`                                    |
| useOpenCode     | `localStorage.getItem('motrix-ai:llm-config')`                      | `store.config.ai` (computed)                         |
| useSubtitle     | `localStorage.getItem('motrix-ai:subtitle-dir')`                    | `store.config.subtitles.subtitle_dir`                |
| useSubtitle     | `localStorage.getItem('motrix-ai:opensubtitles-api-key')`           | `store.config.subtitles.opensubtitles_api_key`       |
| stores/tasks.ts | `localStorage.getItem('motrix-ai:download-dir')`                    | `store.config.downloads.base_dir`                    |
| stores/tasks.ts | `localStorage.getItem('motrix-ai:subtitle-languages')`              | `store.config.subtitles.preferred_languages`         |
| stores/tasks.ts | `localStorage.getItem('motrix-ai:auto-search-subtitles')`           | `store.config.subtitles.auto_search`                 |
| stores/tasks.ts | `localStorage.getItem('motrix-ai:opensubtitles-api-key')`           | `store.config.subtitles.opensubtitles_api_key`       |
| ScheduleConfig  | `localStorage.getItem('motrix-ai:schedule-rules')`                  | `store.config.schedule.rules`                        |
| ScheduleConfig  | `localStorage.getItem('motrix-ai:schedule-enabled')` (per-rule map) | `store.config.schedule.rules[i].enabled` (see below) |
| NASConfig       | `localStorage.getItem('motrix-ai:nas-config')`                      | `store.config.archive`                               |

The `useLocalStorage` helper in SettingsView is removed entirely.

**Per-rule `enabled` field:** The core `ScheduleRule` type in `packages/core/src/types.ts` is extended with an optional `enabled?: boolean` field (defaults to `true` when absent). This allows per-rule toggling within the config file itself, eliminating the separate `motrix-ai:schedule-enabled` localStorage key. The schema validator in `schema.ts` is updated to accept this optional field. The global `schedule.enabled` boolean remains as a master toggle for the entire scheduling system.

---

## 8. i18n Completion

### 8.1 New translation keys

Add to `useSettings.ts` strings object:

**ScheduleConfig (12 keys):**

```
'schedule.title', 'schedule.currentRule', 'schedule.noMatch',
'schedule.ruleName', 'schedule.startTime', 'schedule.endTime',
'schedule.speedLimit', 'schedule.maxConcurrent', 'schedule.unlimited',
'schedule.addRule', 'schedule.save', 'schedule.ruleAdded',
'schedule.ruleDeleted', 'schedule.ruleSaved', 'schedule.nameRequired',
'schedule.invalidTimeFormat', 'schedule.deleteRule'
```

**NASConfig (15 keys):**

```
'nas.title', 'nas.connected', 'nas.disconnected',
'nas.enable', 'nas.host', 'nas.port', 'nas.username',
'nas.dirMapping', 'nas.movies', 'nas.software', 'nas.music',
'nas.testConnection', 'nas.save', 'nas.connectionSuccess',
'nas.connectionFailed', 'nas.connectionError', 'nas.configSaved',
'nas.featureUnavailable'
```

**SettingsView (~20 keys):**

```
'settings.provider', 'settings.model', 'settings.apiKey',
'settings.baseUrl', 'settings.connectionStatus', 'settings.currentMode',
'settings.customEndpoint', 'settings.downloadDir', 'settings.downloadSpeedLimit',
'settings.uploadSpeedLimit', 'settings.autoRetry', 'settings.maxRetries',
'settings.aria2Connection', 'settings.applyNow', 'settings.dangerZone',
'settings.clearHistory', 'settings.subtitleDir', 'settings.autoSearchSubtitles',
'settings.advancedEndpoint', 'settings.llmConnected', 'settings.heuristicMode'
```

### 8.2 All keys get 5 translations (en/zh/ja/ko/fr)

Each key follows the existing pattern:

```typescript
'schedule.title': { en: 'Smart Scheduling', zh: '智能调度', ja: 'スマートスケジュール', ko: '스마트 스케줄링', fr: 'Planification intelligente' },
```

### 8.3 Component changes

- ScheduleConfig.vue: replace all Chinese hardcoded strings with `t('schedule.*')`
- NASConfig.vue: replace all Chinese hardcoded strings with `t('nas.*')`
- SettingsView.vue: replace all English hardcoded labels with `t('settings.*')`

The `t()` function is imported from `useSettings` which reads `language` from the Pinia store (after reactivity fix).

---

## 9. Migration & Backward Compatibility

### 9.1 Schema migration

- `SCHEMA_VERSION` bumped from 1 to 2
- Migration step adds `ui` section and new `subtitles` fields with defaults
- Existing config files are auto-migrated on first load

### 9.2 localStorage migration

On first run after upgrade:

1. Store calls `invoke('load_config')` to read file config
2. If file doesn't exist OR migration is needed, `migrateFromLocalStorage()` runs
3. Old localStorage keys are read and mapped to AppConfig sections
4. Migrated config is saved to file via `invoke('save_config')`
5. Old localStorage keys are deleted

### 9.3 Fallback for non-Tauri context (vite dev server)

If `invoke('load_config')` fails (not in Tauri), the store falls back to localStorage. This allows development without the Rust backend.

---

## 10. Testing Strategy

### 10.1 Rust command tests

- `cargo test` for `load_config`, `save_config`, `update_config_section`
- Test: file doesn't exist → returns defaults
- Test: valid file → returns parsed config
- Test: corrupted file → returns defaults
- Test: save creates file if missing
- Test: save overwrites existing

### 10.2 Pinia store tests

- Test: `init()` loads from Tauri invoke
- Test: `init()` falls back to localStorage when invoke fails
- Test: `updateSection()` updates reactive config
- Test: `save()` calls invoke with current config
- Test: deep watch triggers save (debounced)
- Test: `reset()` restores defaults and saves

### 10.3 AI config consolidation tests

- Test: `useAIProvider.setProvider()` updates `store.config.ai`
- Test: `useOpenCode.getLLMConfig()` reads from store
- Test: `statusLabel` updates reactively when provider changes
- Test: no localStorage keys are read or written

### 10.4 i18n tests

- Test: all new translation keys exist in all 5 languages
- Test: `t('schedule.title')` returns correct string per language
- Test: switching language updates all component labels

### 10.5 Regression tests

- All 628 existing tests must pass
- Update tests that mock localStorage to mock the Pinia store instead
- Update ScheduleConfig.test.ts and NASConfig.test.ts to test against store

---

## 11. Success Criteria

1. **Zero localStorage config keys** — `grep -rn "motrix-ai:" apps/gui/src --include="*.ts" --include="*.vue" | grep -v __tests__ | grep -v "download-history\|onboarded"` returns 0 results
2. **`useConfigStore` is the sole config entry point** — all components and composables read from store, not localStorage
3. **CLI/MCP/GUI config consistency** — editing config in GUI writes to `~/.motrix-ai/config.json`; CLI reads the same file
4. **`statusLabel` is reactive** — changing AI provider in SettingsView immediately updates the status label
5. **Zero hardcoded UI strings** — `grep -rn "[一-鿿]" apps/gui/src/components/ScheduleConfig.vue apps/gui/src/components/NASConfig.vue` returns 0 (no Chinese in templates)
6. **All typecheck + tests pass** — `pnpm typecheck && pnpm test && pnpm lint` all green
7. **`commands/config.rs` implemented** — 3 Tauri commands registered and functional

---

## 12. Out of Scope

- NAS backend implementation (`test_nas_connection` Rust command, rsync integration) — deferred to separate spec
- Browser extension config sync — extension has its own settings
- Config encryption at rest — future security enhancement
- Multi-profile support — single config file is sufficient for v1
- Config import/export UI — can be added later
