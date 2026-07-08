# Config System Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Motrix AI's fragmented config system (localStorage scatter + dead Pinia store + file config) into a single source of truth (`~/.motrix-ai/config.json`) with a reactive Pinia cache, consolidate 3 AI config stores into 1, fix all reactivity gaps, and complete i18n.

**Architecture:** File config as persistence layer → Rust Tauri commands as bridge → Pinia `useConfigStore` as reactive cache → Vue components read only from store. All 15+ localStorage config keys eliminated.

**Tech Stack:** Rust (Tauri 2, serde_json, std::fs), TypeScript (Vue 3, Pinia, vue-tsc), Vitest, cargo test

## Global Constraints

- TypeScript strict mode — no `as any`, no `@ts-ignore`
- All config writes must pass through `validateConfig()` schema validation
- Existing 628 tests must pass with 0 regressions
- `pnpm typecheck && pnpm test && pnpm lint` must all be green after each task
- Rust 1.96.1 + cargo available for backend changes
- Schema version bumps from 1 to 2 with backward-compatible migration
- 5 languages supported: en, zh, ja, ko, fr

---

### Task 1: Schema Extension — Core Types & Validation

**Files:**

- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/config/schema.ts`
- Modify: `packages/core/src/config/migrations.ts`
- Modify: `packages/core/src/config/loader.ts`
- Modify: `apps/gui/src/stores/config.ts` (mirror types changes)
- Test: `packages/core/src/__tests__/config-schema.test.ts` (existing)

**Interfaces:**

- Produces: `AppConfig.ui` section, `AppConfig.subtitles` extended fields, `ScheduleRule.enabled?`, `AIProvider` includes `'custom'`

- [ ] **Step 1: Extend AppConfig type in types.ts**

Add `ui` section to `AppConfig`. Extend `subtitles` with `subtitle_dir`, `opensubtitles_api_key`, `auto_search`. Add `enabled?` to `ScheduleRule`. Add `'custom'` to `AIProvider` union.

```typescript
// In packages/core/src/types.ts

export type AIProvider = 'opencode' | 'anthropic' | 'openai' | 'ollama' | 'custom'

export interface ScheduleRule {
  name: string
  time_start: string
  time_end: string
  speed_limit: number
  max_concurrent: number
  enabled?: boolean
}

export interface SubtitlesConfig {
  enabled: boolean
  preferred_languages: string[]
  sources: { shooter: boolean; subhd: boolean; opensubtitles: boolean }
  subtitle_dir?: string
  opensubtitles_api_key?: string
  auto_search: boolean
}

export interface UiConfig {
  theme: 'dark' | 'light' | 'system'
  language: 'en' | 'zh' | 'ja' | 'ko' | 'fr'
  log_level: 'debug' | 'info' | 'warn' | 'error'
}

// Add to AppConfig interface:
//   ui: UiConfig
```

- [ ] **Step 2: Update DEFAULT_CONFIG in loader.ts**

Add `ui` section defaults and new `subtitles` fields to `DEFAULT_CONFIG`:

```typescript
// In packages/core/src/config/loader.ts DEFAULT_CONFIG:
export const DEFAULT_CONFIG: AppConfig = {
  ai: { provider: 'opencode', model: 'opencode/deepseek-v4-flash-free' },
  aria2: { rpc_url: 'http://127.0.0.1:6800/jsonrpc' },
  downloads: {
    base_dir: join(homedir(), 'Downloads', 'Motrix AI'),
    movie_dir: join(homedir(), 'Downloads', 'Motrix AI', 'Movies'),
    software_dir: join(homedir(), 'Downloads', 'Motrix AI', 'Software'),
    other_dir: join(homedir(), 'Downloads', 'Motrix AI', 'Other'),
    rename_template: '{title} ({year})/{title}.{quality}.{ext}',
  },
  schedule: {
    enabled: true,
    rules: [
      { name: '深夜全速', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5 },
      { name: '白天让路', time_start: '07:00', time_end: '18:00', speed_limit: 5_000_000, max_concurrent: 2 },
      { name: '晚间适度', time_start: '18:00', time_end: '23:00', speed_limit: 10_000_000, max_concurrent: 3 },
    ],
  },
  disk: { enabled: true, thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 } },
  subtitles: {
    enabled: true,
    preferred_languages: ['zh-Hans', 'en'],
    sources: { shooter: true, subhd: true, opensubtitles: false },
    subtitle_dir: '~/Downloads/Motrix AI/Subtitles',
    opensubtitles_api_key: '',
    auto_search: true,
  },
  archive: { enabled: false, targets: [] },
  ui: { theme: 'dark', language: 'en', log_level: 'info' },
}
```

- [ ] **Step 3: Add validateUi and update validateSubtitles in schema.ts**

```typescript
// In packages/core/src/config/schema.ts

const VALID_PROVIDERS = ['opencode', 'anthropic', 'openai', 'ollama', 'custom'] as const
const VALID_THEMES = ['dark', 'light', 'system'] as const
const VALID_LANGS = ['en', 'zh', 'ja', 'ko', 'fr'] as const
const VALID_LEVELS = ['debug', 'info', 'warn', 'error'] as const

function validateUi(raw: unknown, defaults: AppConfig['ui']): AppConfig['ui'] {
  if (!isObject(raw)) return { ...defaults }
  const result = { ...defaults }
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

Update `validateSubtitles` to handle new fields:

```typescript
// In validateSubtitles, after existing validation:
if (raw.subtitle_dir !== undefined) {
  assert(isString(raw.subtitle_dir), 'subtitles.subtitle_dir', 'must be a string')
  result.subtitle_dir = raw.subtitle_dir
}
if (raw.opensubtitles_api_key !== undefined) {
  assert(isString(raw.opensubtitles_api_key), 'subtitles.opensubtitles_api_key', 'must be a string')
  result.opensubtitles_api_key = raw.opensubtitles_api_key
}
if (raw.auto_search !== undefined) {
  assert(isBoolean(raw.auto_search), 'subtitles.auto_search', 'must be a boolean')
  result.auto_search = raw.auto_search
}
```

Update `validateScheduleRule` to accept optional `enabled`:

```typescript
// In validateScheduleRule, before return:
const enabled = obj.enabled
if (enabled !== undefined) {
  assert(isBoolean(enabled), `schedule.rules[${index}].enabled`, 'must be a boolean')
}
return {
  name,
  time_start: timeStart,
  time_end: timeEnd,
  speed_limit: speedLimit,
  max_concurrent: maxConcurrent,
  ...(enabled !== undefined ? { enabled } : {}),
}
```

Add `ui: validateUi(raw.ui, DEFAULT_CONFIG.ui)` to `validateConfig()`.

- [ ] **Step 4: Add migration v1→v2 in migrations.ts**

```typescript
// In packages/core/src/config/migrations.ts
export const SCHEMA_VERSION = 2

// Add to migrations array:
  {
    from: 1,
    to: 2,
    migrate: (config) => {
      config.ui = config.ui ?? { theme: "dark", language: "en", log_level: "info" }
      if (config.subtitles) {
        config.subtitles.subtitle_dir = config.subtitles.subtitle_dir ?? ""
        config.subtitles.opensubtitles_api_key = config.subtitles.opensubtitles_api_key ?? ""
        config.subtitles.auto_search = config.subtitles.auto_search ?? true
      }
      config.schemaVersion = 2
      return config
    },
  },
```

- [ ] **Step 5: Mirror type changes in GUI store**

Update `apps/gui/src/stores/config.ts` `AppConfig` interface, `AIProvider` type, `ScheduleRule`, `DiskThresholds`, `ArchiveTarget` to match core. Add `UiConfig` interface and `ui` to `AppConfig`. Update `DEFAULT_CONFIG` with `ui` defaults and new subtitle fields.

- [ ] **Step 6: Run typecheck to verify**

Run: `cd /tmp/opencode/motrix-ai && pnpm typecheck`
Expected: All 5 packages pass (may have some type errors in files that reference old types — fix as needed)

- [ ] **Step 7: Run tests to verify no regression**

Run: `cd /tmp/opencode/motrix-ai && pnpm test`
Expected: 628 tests pass

- [ ] **Step 8: Commit**

```bash
cd /tmp/opencode/motrix-ai
git add packages/core/src/types.ts packages/core/src/config/schema.ts packages/core/src/config/migrations.ts packages/core/src/config/loader.ts apps/gui/src/stores/config.ts
git commit -m "feat: extend config schema with ui section, subtitle fields, custom provider, schedule enabled"
```

---

### Task 2: Rust Backend — Config Tauri Commands

**Files:**

- Modify: `apps/gui/src-tauri/src/commands/config.rs`
- Modify: `apps/gui/src-tauri/src/lib.rs`
- Modify: `apps/gui/src-tauri/Cargo.toml` (if dirs crate not already dependency)

**Interfaces:**

- Consumes: `~/.motrix-ai/config.json` file path via `dirs::home_dir()`
- Produces: `load_config() -> serde_json::Value`, `save_config(Value) -> ()`, `update_config_section(String, Value) -> Value`

- [ ] **Step 1: Check Cargo.toml for dirs dependency**

Run: `grep "dirs" /tmp/opencode/motrix-ai/apps/gui/src-tauri/Cargo.toml`
If `dirs` is not present, add `dirs = "5"` to `[dependencies]`.

- [ ] **Step 2: Implement load_config command**

```rust
// apps/gui/src-tauri/src/commands/config.rs
use std::path::PathBuf;
use serde_json::Value;

fn config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Cannot find home directory")?;
    Ok(home.join(".motrix-ai").join("config.json"))
}

fn default_config() -> Value {
    serde_json::json!({
        "ai": { "provider": "opencode", "model": "opencode/deepseek-v4-flash-free" },
        "aria2": { "rpc_url": "http://127.0.0.1:6800/jsonrpc" },
        "downloads": {
            "base_dir": "~/Downloads/Motrix AI",
            "movie_dir": "~/Downloads/Motrix AI/Movies",
            "software_dir": "~/Downloads/Motrix AI/Software",
            "other_dir": "~/Downloads/Motrix AI/Other",
            "rename_template": "{title} ({year})/{title}.{quality}.{ext}"
        },
        "schedule": {
            "enabled": true,
            "rules": [
                { "name": "深夜全速", "time_start": "23:00", "time_end": "07:00", "speed_limit": 0, "max_concurrent": 5 },
                { "name": "白天让路", "time_start": "07:00", "time_end": "18:00", "speed_limit": 5000000, "max_concurrent": 2 },
                { "name": "晚间适度", "time_start": "18:00", "time_end": "23:00", "speed_limit": 10000000, "max_concurrent": 3 }
            ]
        },
        "disk": { "enabled": true, "thresholds": { "low_gb": 5, "critical_gb": 2, "resume_gb": 20 } },
        "subtitles": {
            "enabled": true,
            "preferred_languages": ["zh-Hans", "en"],
            "sources": { "shooter": true, "subhd": true, "opensubtitles": false },
            "subtitle_dir": "~/Downloads/Motrix AI/Subtitles",
            "opensubtitles_api_key": "",
            "auto_search": true
        },
        "archive": { "enabled": false, "targets": [] },
        "ui": { "theme": "dark", "language": "en", "log_level": "info" },
        "schemaVersion": 2
    })
}

#[tauri::command]
pub async fn load_config() -> Result<Value, String> {
    let path = config_path()?;
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        if !path.exists() {
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
            }
            let defaults = default_config();
            std::fs::write(&path, serde_json::to_string_pretty(&defaults).unwrap_or_default())
                .map_err(|e| format!("Write failed: {}", e))?;
            return Ok(defaults);
        }
        let raw = std::fs::read_to_string(&path).map_err(|e| format!("Read failed: {}", e))?;
        let mut config: Value = serde_json::from_str(&raw)
            .map_err(|e| format!("Parse failed: {}, using defaults", e))?;
        // Simple migration: ensure schemaVersion and ui section exist
        if config.get("schemaVersion").and_then(|v| v.as_u64()).unwrap_or(0) < 2 {
            if config.get("ui").is_none() {
                config["ui"] = serde_json::json!({ "theme": "dark", "language": "en", "log_level": "info" });
            }
            if let Some(subs) = config.get_mut("subtitles") {
                if subs.get("subtitle_dir").is_none() { subs["subtitle_dir"] = serde_json::json!(""); }
                if subs.get("opensubtitles_api_key").is_none() { subs["opensubtitles_api_key"] = serde_json::json!(""); }
                if subs.get("auto_search").is_none() { subs["auto_search"] = serde_json::json!(true); }
            }
            config["schemaVersion"] = serde_json::json!(2);
            let _ = std::fs::write(&path, serde_json::to_string_pretty(&config).unwrap_or_default());
        }
        Ok(config)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
```

- [ ] **Step 3: Implement save_config command**

```rust
#[tauri::command]
pub async fn save_config(config: Value) -> Result<(), String> {
    let path = config_path()?;
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("Create dir failed: {}", e))?;
        }
        let json = serde_json::to_string_pretty(&config).map_err(|e| format!("Serialize failed: {}", e))?;
        std::fs::write(&path, json).map_err(|e| format!("Write failed: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
```

- [ ] **Step 4: Implement update_config_section command**

```rust
#[tauri::command]
pub async fn update_config_section(section: String, value: Value) -> Result<Value, String> {
    let path = config_path()?;
    tokio::task::spawn_blocking(move || -> Result<Value, String> {
        let raw = if path.exists() {
            std::fs::read_to_string(&path).unwrap_or_default()
        } else {
            String::new()
        };
        let mut config: Value = if raw.is_empty() {
            default_config()
        } else {
            serde_json::from_str(&raw).unwrap_or_else(|_| default_config())
        };
        config[&section] = value;
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let json = serde_json::to_string_pretty(&config).map_err(|e| format!("Serialize failed: {}", e))?;
        std::fs::write(&path, json).map_err(|e| format!("Write failed: {}", e))?;
        Ok(config)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}
```

- [ ] **Step 5: Register commands in lib.rs**

Add to the `invoke_handler!` macro in `apps/gui/src-tauri/src/lib.rs`:

```rust
            commands::config::load_config,
            commands::config::save_config,
            commands::config::update_config_section,
```

- [ ] **Step 6: Verify Rust compiles**

Run: `cd /tmp/opencode/motrix-ai/apps/gui/src-tauri && cargo check 2>&1 | tail -5`
Expected: `Finished` with no errors

- [ ] **Step 7: Commit**

```bash
cd /tmp/opencode/motrix-ai
git add apps/gui/src-tauri/src/commands/config.rs apps/gui/src-tauri/src/lib.rs apps/gui/src-tauri/Cargo.toml
git commit -m "feat: implement config Tauri commands (load/save/update_section)"
```

---

### Task 3: Pinia Store Rewrite — Reactive Cache

**Files:**

- Rewrite: `apps/gui/src/stores/config.ts`
- Test: `apps/gui/src/__tests__/stores.test.ts`

**Interfaces:**

- Consumes: Tauri `invoke('load_config')`, `invoke('save_config')`
- Produces: `useConfigStore()` with `{ config, loaded, init, save, updateSection, reset }`

- [ ] **Step 1: Rewrite useConfigStore**

```typescript
// apps/gui/src/stores/config.ts
import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { invoke } from '@tauri-apps/api/core'

export type AIProvider = 'opencode' | 'anthropic' | 'openai' | 'ollama' | 'custom'
export type ResourceType = 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other'
export type Quality = '4K' | '1080p' | '720p' | 'other'

export interface ScheduleRule {
  name: string
  time_start: string
  time_end: string
  speed_limit: number
  max_concurrent: number
  enabled?: boolean
}

export interface DiskThresholds {
  low_gb: number
  critical_gb: number
  resume_gb: number
}

export interface ArchiveTarget {
  name: string
  host: string
  path: string
  match: { resource_type?: ResourceType }
}

export interface UiConfig {
  theme: 'dark' | 'light' | 'system'
  language: 'en' | 'zh' | 'ja' | 'ko' | 'fr'
  log_level: 'debug' | 'info' | 'warn' | 'error'
}

export interface AppConfig {
  ai: { provider: AIProvider; model: string; api_key?: string; base_url?: string }
  aria2: { rpc_url: string; rpc_secret?: string }
  downloads: { base_dir: string; movie_dir: string; software_dir: string; other_dir: string; rename_template: string }
  schedule: { enabled: boolean; rules: ScheduleRule[] }
  disk: { enabled: boolean; thresholds: DiskThresholds }
  subtitles: {
    enabled: boolean
    preferred_languages: string[]
    sources: { shooter: boolean; subhd: boolean; opensubtitles: boolean }
    subtitle_dir?: string
    opensubtitles_api_key?: string
    auto_search: boolean
  }
  archive: { enabled: boolean; targets: ArchiveTarget[] }
  ui: UiConfig
}

export const DEFAULT_CONFIG: AppConfig = {
  ai: { provider: 'opencode', model: 'opencode/deepseek-v4-flash-free' },
  aria2: { rpc_url: 'http://127.0.0.1:6800/jsonrpc' },
  downloads: {
    base_dir: '~/Downloads/Motrix AI',
    movie_dir: '~/Downloads/Motrix AI/Movies',
    software_dir: '~/Downloads/Motrix AI/Software',
    other_dir: '~/Downloads/Motrix AI/Other',
    rename_template: '{title} ({year})/{title}.{quality}.{ext}',
  },
  schedule: {
    enabled: true,
    rules: [
      { name: '深夜全速', time_start: '23:00', time_end: '07:00', speed_limit: 0, max_concurrent: 5, enabled: true },
      {
        name: '白天让路',
        time_start: '07:00',
        time_end: '18:00',
        speed_limit: 5_000_000,
        max_concurrent: 2,
        enabled: true,
      },
      {
        name: '晚间适度',
        time_start: '18:00',
        time_end: '23:00',
        speed_limit: 10_000_000,
        max_concurrent: 3,
        enabled: true,
      },
    ],
  },
  disk: { enabled: true, thresholds: { low_gb: 5, critical_gb: 2, resume_gb: 20 } },
  subtitles: {
    enabled: true,
    preferred_languages: ['zh-Hans', 'en'],
    sources: { shooter: true, subhd: true, opensubtitles: false },
    subtitle_dir: '~/Downloads/Motrix AI/Subtitles',
    opensubtitles_api_key: '',
    auto_search: true,
  },
  archive: { enabled: false, targets: [] },
  ui: { theme: 'dark', language: 'en', log_level: 'info' },
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function migrateFromLocalStorage(): AppConfig {
  const config = deepClone(DEFAULT_CONFIG)
  try {
    const aiConfig = localStorage.getItem('motrix-ai:ai-config')
    if (aiConfig) {
      const parsed = JSON.parse(aiConfig)
      config.ai = { ...config.ai, ...parsed }
    }
    const downloadDir = localStorage.getItem('motrix-ai:download-dir')
    if (downloadDir) config.downloads.base_dir = JSON.parse(downloadDir)
    const rpcUrl = localStorage.getItem('motrix-ai:aria2-rpc-url')
    if (rpcUrl) config.aria2.rpc_url = JSON.parse(rpcUrl)
    const rpcSecret = localStorage.getItem('motrix-ai:aria2-rpc-secret')
    if (rpcSecret) config.aria2.rpc_secret = JSON.parse(rpcSecret)
    const subLangs = localStorage.getItem('motrix-ai:subtitle-languages')
    if (subLangs) config.subtitles.preferred_languages = JSON.parse(subLangs)
    const subDir = localStorage.getItem('motrix-ai:subtitle-dir')
    if (subDir) config.subtitles.subtitle_dir = JSON.parse(subDir)
    const subApiKey = localStorage.getItem('motrix-ai:opensubtitles-api-key')
    if (subApiKey) config.subtitles.opensubtitles_api_key = subApiKey
    const autoSub = localStorage.getItem('motrix-ai:auto-search-subtitles')
    if (autoSub !== null) config.subtitles.auto_search = JSON.parse(autoSub) !== false
    const schedRules = localStorage.getItem('motrix-ai:schedule-rules')
    if (schedRules) config.schedule.rules = JSON.parse(schedRules)
    const logLevel = localStorage.getItem('motrix-ai:log-level')
    if (logLevel) config.ui.log_level = JSON.parse(logLevel)
    const theme = localStorage.getItem('motrix-ai:theme')
    if (theme) config.ui.theme = JSON.parse(theme)
    const lang = localStorage.getItem('motrix-ai:language')
    if (lang) config.ui.language = JSON.parse(lang)
  } catch {
    /* best-effort */
  }
  return config
}

function cleanupOldKeys(): void {
  const keys = [
    'motrix-ai:ai-config',
    'motrix-ai:llm-endpoint',
    'motrix-ai:llm-api-key',
    'motrix-ai:llm-model',
    'motrix-ai:llm-config',
    'motrix-ai:download-dir',
    'motrix-ai:aria2-rpc-url',
    'motrix-ai:aria2-rpc-secret',
    'motrix-ai:subtitle-languages',
    'motrix-ai:subtitle-dir',
    'motrix-ai:opensubtitles-api-key',
    'motrix-ai:auto-search-subtitles',
    'motrix-ai:schedule-rules',
    'motrix-ai:schedule-enabled',
    'motrix-ai:log-level',
    'motrix-ai:theme',
    'motrix-ai:language',
    'motrix-ai:config',
    'motrix-ai:nas-config',
  ]
  for (const key of keys) {
    try {
      localStorage.removeItem(key)
    } catch {
      /* ignore */
    }
  }
}

export const useConfigStore = defineStore('config', () => {
  const config = ref<AppConfig>(deepClone(DEFAULT_CONFIG))
  const loaded = ref(false)
  const saving = ref(false)

  async function init(): Promise<void> {
    try {
      const fileConfig = await invoke<AppConfig>('load_config')
      config.value = {
        ...DEFAULT_CONFIG,
        ...fileConfig,
        ai: { ...DEFAULT_CONFIG.ai, ...fileConfig.ai },
        aria2: { ...DEFAULT_CONFIG.aria2, ...fileConfig.aria2 },
        downloads: { ...DEFAULT_CONFIG.downloads, ...fileConfig.downloads },
        schedule: { ...DEFAULT_CONFIG.schedule, ...fileConfig.schedule },
        disk: { ...DEFAULT_CONFIG.disk, ...fileConfig.disk },
        subtitles: { ...DEFAULT_CONFIG.subtitles, ...fileConfig.subtitles },
        archive: { ...DEFAULT_CONFIG.archive, ...fileConfig.archive },
        ui: { ...DEFAULT_CONFIG.ui, ...fileConfig.ui },
      }
    } catch {
      config.value = migrateFromLocalStorage()
      cleanupOldKeys()
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
    config.value = { ...config.value, [section]: { ...config.value[section], ...value } }
  }

  async function reset(): Promise<void> {
    config.value = deepClone(DEFAULT_CONFIG)
    await save()
  }

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

- [ ] **Step 2: Update existing store tests**

Update `apps/gui/src/__tests__/stores.test.ts` to mock `@tauri-apps/api/core` invoke and test against the new store API. Ensure `init()`, `updateSection()`, `save()` are tested.

- [ ] **Step 3: Run typecheck + tests**

Run: `cd /tmp/opencode/motrix-ai && pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add apps/gui/src/stores/config.ts apps/gui/src/__tests__/stores.test.ts
git commit -m "feat: rewrite useConfigStore as reactive cache with file persistence"
```

---

### Task 4: App Initialization — Wire Store at Boot

**Files:**

- Modify: `apps/gui/src/App.vue`

- [ ] **Step 1: Add config store init to App.vue**

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useConfigStore } from '@/stores/config'

const configStore = useConfigStore()

onMounted(async () => {
  await configStore.init()
})
</script>

<template>
  <router-view />
</template>
```

Keep existing `<style>` block unchanged.

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: 5/5 pass

- [ ] **Step 3: Commit**

```bash
git add apps/gui/src/App.vue
git commit -m "feat: initialize config store on app mount"
```

---

### Task 5: AI Config Consolidation — Merge 3 Stores into 1

**Files:**

- Rewrite: `apps/gui/src/composables/useAIProvider.ts`
- Rewrite: `apps/gui/src/composables/useOpenCode.ts`
- Test: `apps/gui/src/__tests__/useAIProvider.test.ts`

**Interfaces:**

- Consumes: `useConfigStore().config.ai`
- Produces: `useAIProvider()` reads/writes `config.ai`; `useOpenCode()` reads `config.ai` reactively

- [ ] **Step 1: Rewrite useAIProvider.ts**

```typescript
// apps/gui/src/composables/useAIProvider.ts
import { computed } from 'vue'
import { useConfigStore, type AIProvider } from '@/stores/config'

const PROVIDERS: Record<AIProvider, { name: string; models: string[]; requiresKey: boolean }> = {
  opencode: { name: 'OpenCode (Free)', models: ['opencode/deepseek-v4-flash-free'], requiresKey: false },
  anthropic: { name: 'Anthropic Claude', models: ['claude-sonnet-4', 'claude-haiku-4'], requiresKey: true },
  openai: { name: 'OpenAI GPT', models: ['gpt-4o', 'gpt-4o-mini'], requiresKey: true },
  ollama: { name: 'Ollama (Local)', models: ['llama3', 'mistral', 'codellama'], requiresKey: false },
  custom: { name: 'Custom (OpenAI Compatible)', models: [], requiresKey: true },
}

export function useAIProvider() {
  const store = useConfigStore()
  const config = computed(() => store.config.ai)

  const availableProviders = computed(() =>
    Object.entries(PROVIDERS).map(([key, val]) => ({ id: key as AIProvider, ...val })),
  )
  const modelOptions = computed(() => PROVIDERS[config.value.provider].models.map((m) => ({ label: m, value: m })))
  const currentProvider = computed(() => PROVIDERS[config.value.provider])
  const requiresApiKey = computed(() => currentProvider.value.requiresKey)
  const needsBaseUrl = computed(() => config.value.provider === 'ollama' || config.value.provider === 'custom')

  function setProvider(provider: AIProvider) {
    store.updateSection('ai', { provider, model: PROVIDERS[provider].models[0] || '' })
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

  return {
    config,
    availableProviders,
    modelOptions,
    currentProvider,
    requiresApiKey,
    needsBaseUrl,
    setProvider,
    setModel,
    setApiKey,
    setBaseUrl,
  }
}
```

- [ ] **Step 2: Rewrite useOpenCode.ts**

```typescript
// apps/gui/src/composables/useOpenCode.ts
import { ref, computed } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useConfigStore } from '@/stores/config'

export interface DownloadIntent {
  title: string
  year?: number | null
  quality: '4K' | '1080p' | '720p' | 'other'
  need_subtitle: boolean
  search_keywords: string[]
  resource_type: 'movie' | 'tv' | 'software' | 'music' | 'anime' | 'other'
  raw_input?: string
}

export interface LLMConfig {
  endpoint: string
  api_key: string
  model: string
}

export function useOpenCode() {
  const store = useConfigStore()
  const connected = ref(true)
  const parsing = ref(false)

  const llmConfigured = computed(() => {
    const ai = store.config.ai
    return ai.provider !== 'opencode'
  })

  const statusLabel = computed(() => (llmConfigured.value ? 'LLM Connected' : 'Heuristic Mode'))

  function getLLMConfig(): LLMConfig | null {
    const ai = store.config.ai
    if (ai.provider === 'opencode') return null

    const endpoints: Partial<Record<string, string>> = {
      anthropic: 'https://api.anthropic.com/v1/chat/completions',
      openai: 'https://api.openai.com/v1/chat/completions',
      ollama: ai.base_url
        ? `${ai.base_url.replace(/\/$/, '')}/v1/chat/completions`
        : 'http://127.0.0.1:11434/v1/chat/completions',
      custom: ai.base_url || '',
    }

    const endpoint = endpoints[ai.provider]
    if (!endpoint) return null
    return { endpoint, api_key: ai.api_key ?? '', model: ai.model }
  }

  const parseIntent = async (input: string): Promise<DownloadIntent> => {
    parsing.value = true
    try {
      const llmConfig = getLLMConfig()
      const result = await invoke<DownloadIntent>('parse_nl_intent', {
        input,
        llmConfig: llmConfig || undefined,
      })
      return result
    } catch (e) {
      console.error('NL parsing failed:', e)
      return {
        title: input.replace(/^下[载个]?|^download|^get/i, '').trim() || input,
        quality: 'other',
        need_subtitle: /字幕|subtitle/i.test(input),
        search_keywords: [input],
        resource_type: 'other',
        raw_input: input,
      }
    } finally {
      parsing.value = false
    }
  }

  return { connected, statusLabel, llmConfigured, parsing, parseIntent }
}
```

- [ ] **Step 3: Update useAIProvider tests**

Update `apps/gui/src/__tests__/useAIProvider.test.ts` to mock `useConfigStore` instead of localStorage. Test that `setProvider()` calls `store.updateSection('ai', ...)`.

- [ ] **Step 4: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add apps/gui/src/composables/useAIProvider.ts apps/gui/src/composables/useOpenCode.ts apps/gui/src/__tests__/useAIProvider.test.ts
git commit -m "feat: consolidate AI config into store.config.ai, reactive statusLabel"
```

---

### Task 6: SettingsView Rewrite — Remove localStorage, Use Store

**Files:**

- Rewrite: `apps/gui/src/views/SettingsView.vue`

**Interfaces:**

- Consumes: `useConfigStore`, `useAIProvider`, `useOpenCode`, `useAria2`, `useAria2Manager`
- Produces: All settings read from store, `useLocalStorage` helper removed

- [ ] **Step 1: Rewrite SettingsView script section**

Replace the entire `<script setup>` block. Remove `useLocalStorage` helper. All settings refs become computed/store-derived. Keep aria2 watchers but read from store. Keep log level filter.

Key changes:

- Remove `useLocalStorage` function and all its usages
- `downloadDir` → `computed(() => store.config.downloads.base_dir)` with setter calling `store.updateSection('downloads', { base_dir: val })`
- `maxConcurrent`, `downloadSpeedLimit`, etc. → store-backed computeds (these are aria2 runtime settings, store in `config.aria2` or keep as local refs that apply to aria2)
- `aria2RpcUrl`/`aria2RpcSecret` → `computed(() => store.config.aria2.rpc_url)` with setter
- `logLevel` → `computed(() => store.config.ui.log_level)` with setter
- `subtitleApiKey` → `computed(() => store.config.subtitles.opensubtitles_api_key)` with setter
- `subtitleLanguages` → `computed(() => store.config.subtitles.preferred_languages)` with setter
- `autoSearchSubtitles` → `computed(() => store.config.subtitles.auto_search)` with setter
- `subtitleDir` → `computed(() => store.config.subtitles.subtitle_dir)` with setter
- Remove `llmEndpoint`, `llmApiKey`, `llmModel` refs and their watchers (replaced by AI provider consolidation)
- Remove `currentModel` computed (replaced by `aiProvider.config.value.model`)
- Remove the `watch` that syncs aiProvider to llmEndpoint/llmApiKey/llmModel
- Keep aria2 RPC watcher: `watch([() => store.config.aria2.rpc_url, () => store.config.aria2.rpc_secret], ...)`
- Keep log level `applyLogLevel` function, read initial value from `store.config.ui.log_level`

- [ ] **Step 2: Update SettingsView template**

- Remove "Advanced: Custom Endpoint" section entirely
- Replace `llmEndpoint`/`llmApiKey`/`llmModel` NInput bindings with nothing (removed)
- Update `currentModel` display to use `aiProvider.config.value.model`
- Update `openCode.statusLabel.value` display (already done in P1-3 fix, verify still correct)
- All label text that's hardcoded English → wrap with `t()` (done in Task 8)

- [ ] **Step 3: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add apps/gui/src/views/SettingsView.vue
git commit -m "feat: rewrite SettingsView to use config store, remove localStorage and AI config redundancy"
```

---

### Task 7: stores/tasks.ts — Read from Store

**Files:**

- Modify: `apps/gui/src/stores/tasks.ts`

- [ ] **Step 1: Replace localStorage reads with store reads**

In `addTask()`, replace `localStorage.getItem('motrix-ai:download-dir')` with:

```typescript
import { useConfigStore } from '@/stores/config'
// In addTask:
const configStore = useConfigStore()
const dir = configStore.config.downloads.base_dir
if (dir && dir.trim()) {
  let resolvedDir = dir
  if (dir === '~' || dir.startsWith('~/') || dir.startsWith('~\\')) {
    try {
      const { homeDir } = await import('@tauri-apps/api/path')
      const home = await homeDir()
      resolvedDir = dir === '~' ? home : home + dir.slice(1)
    } catch {
      /* not in Tauri */
    }
  }
  opts.dir = resolvedDir
}
```

In the subtitle auto-search block, replace localStorage reads:

```typescript
const configStore = useConfigStore()
if (configStore.config.subtitles.auto_search) {
  const apiKey = configStore.config.subtitles.opensubtitles_api_key || ''
  if (apiKey) {
    const langs = configStore.config.subtitles.preferred_languages.join(',')
    await invoke('opensubtitles_search', {
      apiKey,
      query: filename.replace(/\.[^.]+$/, ''),
      languages: langs || undefined,
    })
  }
}
```

- [ ] **Step 2: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass (update test mocks if needed)

- [ ] **Step 3: Commit**

```bash
git add apps/gui/src/stores/tasks.ts
git commit -m "feat: stores/tasks.ts reads config from Pinia store instead of localStorage"
```

---

### Task 8: useSubtitle.ts — Read from Store

**Files:**

- Modify: `apps/gui/src/composables/useSubtitle.ts`

- [ ] **Step 1: Replace localStorage reads with store reads**

Replace `getApiKey()` to read from store:

```typescript
import { useConfigStore } from '@/stores/config'

function getApiKey(): string {
  return useConfigStore().config.subtitles.opensubtitles_api_key || ''
}
```

Replace `hasApiKey()`:

```typescript
export function hasApiKey(): boolean {
  return !!useConfigStore().config.subtitles.opensubtitles_api_key
}
```

In `downloadSubtitleFile`, replace localStorage subtitle-dir read:

```typescript
const configStore = useConfigStore()
const configuredDir = configStore.config.subtitles.subtitle_dir
if (configuredDir && configuredDir.trim()) {
  let resolvedDir = configuredDir
  if (configuredDir === '~' || configuredDir.startsWith('~/') || configuredDir.startsWith('~\\')) {
    try {
      const { homeDir } = await import('@tauri-apps/api/path')
      const home = await homeDir()
      resolvedDir = configuredDir === '~' ? home : home + configuredDir.slice(1)
    } catch {
      /* not in Tauri */
    }
  }
  targetDir = resolvedDir
}
```

Remove `setApiKey` export (store handles persistence). Remove `SETTINGS_KEY` constant.

- [ ] **Step 2: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add apps/gui/src/composables/useSubtitle.ts
git commit -m "feat: useSubtitle reads config from Pinia store"
```

---

### Task 9: ScheduleConfig.vue — Read Rules from Store

**Files:**

- Rewrite: `apps/gui/src/components/ScheduleConfig.vue`

- [ ] **Step 1: Replace localStorage with store**

Replace `loadRules()`/`persistRules()` with store-backed computed:

```typescript
import { useConfigStore } from '@/stores/config'

const store = useConfigStore()
const rules = computed(() => store.config.schedule.rules)

function updateRule(index: number, patch: Partial<ScheduleRule>) {
  const newRules = [...rules.value]
  newRules[index] = { ...newRules[index], ...patch }
  store.updateSection('schedule', { rules: newRules })
}

function addRule(rule: ScheduleRule) {
  store.updateSection('schedule', { rules: [...rules.value, rule] })
}

function removeRule(index: number) {
  const newRules = rules.value.filter((_, i) => i !== index)
  store.updateSection('schedule', { rules: newRules })
}
```

Remove `STORAGE_KEY`, `loadRules`, `persistRules`, `enabledMap`, `loadEnabledMap`, `persistEnabledMap`. Use `rule.enabled` field directly (from Task 1 schema extension). Keep `useSchedule` integration, `sched.start()`, validation, and form fields from the P0-2 fix.

- [ ] **Step 2: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass (update ScheduleConfig.test.ts if needed)

- [ ] **Step 3: Commit**

```bash
git add apps/gui/src/components/ScheduleConfig.vue
git commit -m "feat: ScheduleConfig reads rules from config store"
```

---

### Task 10: NASConfig.vue — Read from Store

**Files:**

- Modify: `apps/gui/src/components/NASConfig.vue`

- [ ] **Step 1: Replace localStorage with store**

Replace the local `config` ref and localStorage load/save with store-backed computed. Map NAS fields to `store.config.archive`:

```typescript
import { useConfigStore } from '@/stores/config'

const store = useConfigStore()
const config = computed(() => ({
  enabled: store.config.archive.enabled,
  host: store.config.archive.targets[0]?.host ?? '',
  port: '22',
  username: '',
  moviePath: store.config.archive.targets[0]?.path ?? '',
  softwarePath: '',
  musicPath: '',
  connected: false,
}))

function saveConfig() {
  store.updateSection('archive', {
    enabled: config.value.enabled,
    targets: config.value.host
      ? [
          {
            name: 'NAS',
            host: config.value.host,
            path: config.value.moviePath,
            match: {},
          },
        ]
      : [],
  })
  message.success('NAS 配置已保存')
}
```

Remove localStorage load at bottom of script. Keep `testConnection` with graceful error handling.

- [ ] **Step 2: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass (update NASConfig.test.ts if needed)

- [ ] **Step 3: Commit**

```bash
git add apps/gui/src/components/NASConfig.vue
git commit -m "feat: NASConfig reads config from store"
```

---

### Task 11: useSettings.ts — Theme/Language from Store

**Files:**

- Modify: `apps/gui/src/composables/useSettings.ts`

- [ ] **Step 1: Replace theme/language localStorage with store**

```typescript
import { computed, watch } from 'vue'
import { useConfigStore } from '@/stores/config'

export const theme = computed({
  get: () => useConfigStore().config.ui.theme,
  set: (v) => useConfigStore().updateSection('ui', { theme: v }),
})

export const language = computed({
  get: () => useConfigStore().config.ui.language,
  set: (v) => useConfigStore().updateSection('ui', { language: v }),
})
```

Keep `resolvedTheme`, `isDark`, `applyThemeAttribute`, `systemDark`, `t()`, `toggleTheme()`. Remove `load()` and `save()` localStorage helpers. Remove the `watch(theme, ...)` and `watch(language, ...)` that persisted to localStorage — store auto-persists now.

Keep `applyThemeAttribute` call — trigger it via `watch(resolvedTheme, ...)`.

- [ ] **Step 2: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add apps/gui/src/composables/useSettings.ts
git commit -m "feat: useSettings reads theme/language from config store"
```

---

### Task 12: i18n Completion — Add All Translation Keys

**Files:**

- Modify: `apps/gui/src/composables/useSettings.ts` (add ~47 keys × 5 languages)
- Modify: `apps/gui/src/components/ScheduleConfig.vue` (wrap Chinese with `t()`)
- Modify: `apps/gui/src/components/NASConfig.vue` (wrap Chinese with `t()`)
- Modify: `apps/gui/src/views/SettingsView.vue` (wrap English with `t()`)

- [ ] **Step 1: Add translation keys to useSettings.ts**

Add all keys from the spec Section 8.1 with 5-language translations each. Follow the existing pattern:

```typescript
'schedule.title': { en: 'Smart Scheduling', zh: '智能调度', ja: 'スマートスケジュール', ko: '스마트 스케줄링', fr: 'Planification intelligente' },
'schedule.unlimited': { en: 'Unlimited', zh: '无限制', ja: '無制限', ko: '무제한', fr: 'Illimité' },
// ... all 47 keys
```

- [ ] **Step 2: Wrap ScheduleConfig hardcoded strings with t()**

Replace all Chinese strings in ScheduleConfig.vue template with `t()` calls:

- `深夜全速` → `t('schedule.nightRule')` (or use rule.name directly)
- `无限制` → `t('schedule.unlimited')`
- `请输入规则名称` → `t('schedule.nameRequired')`
- `规则已添加` → `t('schedule.ruleAdded')`
- `规则已删除` → `t('schedule.ruleDeleted')`
- `调度规则已保存并生效` → `t('schedule.ruleSaved')`
- `当前:` → `t('schedule.currentRule')`
- `删除` → use icon only
- `添加规则` → `t('schedule.addRule')`
- `保存并生效` → `t('schedule.save')`
- Card title `⏰ 智能调度` → `t('schedule.title')`
- `最大并发:` → `t('schedule.maxConcurrent')`
- `规则名称` → `t('schedule.ruleName')`
- `开始 HH:mm` → `t('schedule.startTime')`
- `结束 HH:mm` → `t('schedule.endTime')`
- `速度限制` → `t('schedule.speedLimit')`
- `取消` → `t('btn.cancel')` (add this key)
- `添加` → `t('schedule.addRule')`

- [ ] **Step 3: Wrap NASConfig hardcoded strings with t()**

Replace all Chinese strings in NASConfig.vue:

- `NAS 归档` → `t('nas.title')`
- `已连接` → `t('nas.connected')`
- `未连接` → `t('nas.disconnected')`
- `启用 NAS 归档` → `t('nas.enable')`
- `主机地址` → `t('nas.host')`
- `端口` → `t('nas.port')`
- `用户名` → `t('nas.username')`
- `目录映射` → `t('nas.dirMapping')`
- `电影` → `t('nas.movies')`
- `软件` → `t('nas.software')`
- `音乐` → `t('nas.music')`
- `测试连接` → `t('nas.testConnection')`
- `保存` → `t('nas.save')`
- `连接成功！` → `t('nas.connectionSuccess')`
- `连接失败` → `t('nas.connectionFailed')`
- `连接错误` → `t('nas.connectionError')`
- `NAS 配置已保存` → `t('nas.configSaved')`
- `NAS 连接测试功能暂不可用` → `t('nas.featureUnavailable')`

- [ ] **Step 4: Wrap SettingsView hardcoded English with t()**

Replace hardcoded English labels:

- `Provider` → `t('settings.provider')`
- `Model` → `t('settings.model')`
- `API Key` → `t('settings.apiKey')`
- `Base URL` → `t('settings.baseUrl')`
- `Connection Status` → `t('settings.connectionStatus')`
- `Current Mode` → `t('settings.currentMode')`
- `Default Download Directory` → `t('settings.downloadDir')`
- `Global Download Speed Limit (KB/s)` → `t('settings.downloadSpeedLimit')`
- `Global Upload Speed Limit (KB/s)` → `t('settings.uploadSpeedLimit')`
- `Auto-Retry on Failure` → `t('settings.autoRetry')`
- `Max Retries` → `t('settings.maxRetries')`
- `aria2 Connection` → `t('settings.aria2Connection')`
- `Apply Settings Now` → `t('settings.applyNow')`
- `Danger Zone` → `t('settings.dangerZone')`
- `Clear Download History` → `t('settings.clearHistory')`
- `Subtitle Download Directory` → `t('settings.subtitleDir')`
- `Auto-Search Subtitles on Download` → `t('settings.autoSearchSubtitles')`

- [ ] **Step 5: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 6: Commit**

```bash
git add apps/gui/src/composables/useSettings.ts apps/gui/src/components/ScheduleConfig.vue apps/gui/src/components/NASConfig.vue apps/gui/src/views/SettingsView.vue
git commit -m "feat: complete i18n with 47 new translation keys across 5 languages"
```

---

### Task 13: OnboardingView — Use Store

**Files:**

- Modify: `apps/gui/src/views/OnboardingView.vue`

- [ ] **Step 1: Replace localStorage writes with store**

```typescript
import { useConfigStore } from '@/stores/config'

const configStore = useConfigStore()

// In nextStep() completion:
configStore.updateSection('downloads', { base_dir: downloadDir.value })
configStore.updateSection('ui', { language: uiLanguage.value })
localStorage.setItem('motrix-ai:onboarded', 'true')
```

- [ ] **Step 2: Run typecheck + tests**

Run: `pnpm typecheck && pnpm test`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add apps/gui/src/views/OnboardingView.vue
git commit -m "feat: OnboardingView writes config to store"
```

---

### Task 14: Final Verification — Full Regression Check

**Files:**

- All modified files

- [ ] **Step 1: Run full typecheck**

Run: `cd /tmp/opencode/motrix-ai && pnpm typecheck`
Expected: 5/5 successful, 0 errors

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests pass (628+ — new tests may have been added)

- [ ] **Step 3: Run lint**

Run: `pnpm lint`
Expected: 0 errors, 0 warnings

- [ ] **Step 4: Verify Rust compiles**

Run: `cd apps/gui/src-tauri && cargo check`
Expected: Finished with no errors

- [ ] **Step 5: Verify zero localStorage config keys remain**

Run: `grep -rn "motrix-ai:" apps/gui/src --include="*.ts" --include="*.vue" | grep -v __tests__ | grep -v "download-history\|onboarded"`
Expected: 0 results (all config keys eliminated)

- [ ] **Step 6: Verify no hardcoded Chinese in component templates**

Run: `grep -rn "[一-鿿]" apps/gui/src/components/ScheduleConfig.vue apps/gui/src/components/NASConfig.vue | grep -v "script\|console\|message\.\|DEFAULT_RULES\|深夜\|白天\|晚间"`
Expected: 0 results in template sections

- [ ] **Step 7: Commit verification**

```bash
git add -A
git commit -m "chore: final verification — config unification complete"
```

---

## Self-Review Notes

**Spec coverage:** All 12 spec sections mapped to tasks:

- Section 3 (Rust) → Task 2
- Section 4 (Pinia) → Task 3
- Section 5 (Schema) → Task 1
- Section 6 (AI consolidation) → Task 5
- Section 7 (Reactivity) → Tasks 6-11
- Section 8 (i18n) → Task 12
- Section 9 (Migration) → Task 3 (migrateFromLocalStorage)
- Section 10 (Testing) → Each task has test steps
- Section 11 (Success criteria) → Task 14 verification steps

**Dependency order:** Task 1 (schema) → Task 2 (Rust) → Task 3 (store) → Task 4 (init) → Tasks 5-11 (parallel-able component rewrites) → Task 12 (i18n) → Task 13 (onboarding) → Task 14 (verify)
