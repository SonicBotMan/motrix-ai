# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-07-13

### Summary

Comprehensive bug audit and fix pass. 80+ bugs fixed across aria2 lifecycle,
RPC authentication, browser extension, core pipelines, frontend interactions,
data integrity, and security hardening. Basic download capability verified
end-to-end across all entry points (GUI, CLI, MCP, browser extension).

### Fixed — Critical (P0)

- **G1**: TaskFirstView disposed aria2 on unmount — navigating to Settings killed the daemon. Moved init/dispose to App.vue app-shell lifetime.
- **G2**: `aria2_rpc()` helper omitted `token:{secret}` — pause_all / unpause_all / add_torrent_file all failed auth.
- **G3**: Browser extension never sent `X-Motrix-Token` — POST /api/download always 403. Extension now fetches and caches token.

### Fixed — Security

- **S1**: HTTP API returned RPC token with `Access-Control-Allow-Origin: *` — localhost CSRF. CORS now restricted to browser-extension schemes.
- **S2**: HTTP API downloads skipped user confirmation. Now emits visibility event to GUI.
- Atomic config write (write-temp-then-rename) prevents corruption on crash.
- Config save race condition fixed (savePending flag prevents lost updates on rapid changes).

### Fixed — Download Capability

- MCP IntentParser now receives `config.ai.base_url` (was hardcoded to default).
- MCP `download_url` and `download_natural_language` now pass `{ dir: base_dir }`.
- CLI `ask` command now passes download directory.
- Schema version corrected to 3 in loader.ts (was 2, skipping nas migration).
- Rust migration threshold fixed from `< 2` to `< 3`.
- Protocol registration for magnet/ed2k/thunder added to tauri.conf.json.
- Session save before aria2 shutdown (saveSession RPC before kill).
- Dead clipboard monitor removed (polled every 5s but never triggered downloads).

### Fixed — Data Integrity

- Progress capped at 100% with `Math.min` (torrents could show >100%).
- `f.selected` logic fixed: `=== 'true'` instead of `!== 'false'` (undefined was treated as true).
- Core `mapToTask` null-safety: files array, path, sizes guarded.
- Core RPC call now has 10s timeout via `AbortSignal.timeout`.
- Memory leak fixes: `gidToId` cleaned in tasks computed, `previousStatuses` cleaned in `fetchAllTasks`.
- `intentByGid` cleaned on `removeTask` (was only cleaned on completion).
- PID restored to `ARIA2_CHILD` if SIGKILL needed (prevents lost process tracking).
- `loadConfig()` uses recursive `deepMerge` instead of shallow spread (nested defaults preserved).
- `organize_file` reads config subdirs (`movie_dir`/`tv_dir`/`software_dir`/etc.) instead of hardcoded names.

### Fixed — Frontend Interactions

- DetailPanel now shows live data via `liveSelectedTask` computed (was frozen snapshot).
- DetailPanel footer buttons state-aware: Pause only for downloading, Resume only for paused, Retry only for failed, Priority only for active/pending.
- RowMenu Resume button only shows for paused tasks (was: all non-downloading).
- Immediate UI refresh after ALL store operations (add/retry/pause/resume/remove/clear/pauseAll/resumeAll/move×3) — no more 2-second delay.
- Immediate refresh after torrent attach and drag-drop.
- Delete confirmation dialog added (was: no confirmation for destructive action).
- Batch download counts succeeded/failed (was: always "Batch complete").
- BottomChat artificial 1100ms sending delay removed.
- Quick action "Add magnet URL" now focuses the input (was: toast only).
- Quick action "Download Ubuntu" now uses direct magnet link (was: triggered NL search that fails without LLM).
- `handleSelectSearchResult` proper error handling (was: fire-and-forget, silent failure with success toast).
- OnboardingCard theme selection now preserved (was: discarded on complete).
- Failed filter tab added to FilterTabs (was: missing).
- Keyboard index resets on filter/search change (was: pointed to invisible rows).
- `fileSelection` Map cleared on detail open/close (was: stale selections leaked between tasks).
- Config save race condition fixed (savePending flag).
- Config save error exposed via `saveError` ref.
- Dead ChromeBar queue button removed (navigated to redirect).
- Dead `task.total` reference removed from TaskTable.
- OnboardingCard "YouTube" claim corrected to "FTP".
- `:focus-within` → `:focus` on BottomChat input (focus ring was never visible).
- TaskTable row `height` → `min-height` (content clipping).
- TaskTable wrapper `overflow-y: auto` added (long lists couldn't scroll).
- Toast prune logic fixed (all-exiting case caused unbounded growth).
- QueueView redirect to `/` (broken view used different data source).
- `aria2AddUri` fallback RPC removed (was guaranteed to fail — no token).

### Fixed — Deep Link & Extension

- Browser extension popup.js/background.js: token fetch + cache + 403 retry.
- HTTP API CORS: scheme-restricted origin echo (blocks CSRF).
- HTTP API `http-api-download` event emission for GUI visibility toast.
- Dead clipboard monitor removed from App.vue.

## [1.2.0] - 2026-07-11

### Added

#### AI Pipeline

- **Smart ranking now works** — ResultEvaluator (quality 20% + size 20% + seeders 30% + relevance 30%) connected to GUI search results
- **Keyword expansion** — KeywordGenerator expands search terms by resource type (movie/TV/anime/software/music)
- **LLM configuration connected** — Settings AI provider/key/model now reaches the Rust intent parser (was: always null)
- **Multi-source parallel search** — btdig + 1337x + nyaa + mikan queried simultaneously with deduplication (was: btdig only)

#### Core Architecture

- **packages/core browser entry point** — `@motrix-ai/core/browser` provides browser-safe exports for the first time; GUI imports from core for the first time
- **Monorepo code sharing is real** — KeywordGenerator + ResultEvaluator + Logger shared between GUI and CLI/MCP

#### Security

- **aria2 RPC secret token** — Random per-session token prevents unauthorized local processes from controlling aria2
- **HTTP API token authentication** — Browser extension requests must include `X-Motrix-Token` header
- **Path traversal protection** — `save_file`/`download_subtitle` canonicalize parent directory and validate against home directory
- **Config file hardening** — Symlink rejection + chmod 0600 on Unix
- **URL scheme whitelist** — Only http/https/ftp/magnet/ed2k/thunder accepted
- **Deep link confirmation** — Magnet/ed2k links from websites show confirmation dialog before downloading

#### Features

- **Drag-and-drop** — Drop .torrent files onto the window to auto-add
- **Clipboard monitoring** — Detects magnet/URL in clipboard every 5s
- **Batch URL adding** — Multi-line input in chat bar processes each URL individually
- **Task search/filter** — Live filter input in TaskFirstView with count indicator
- **SpeedChart component** — SVG sparkline for download speed visualization
- **Proxy configuration** — Network section in config schema; aria2 reads http_proxy/https_proxy/ftp_proxy/no_proxy
- **QueueView error feedback** — 11 silent catch blocks now show user-facing messages via Naive UI

#### Reliability

- **GID-based task operations** — Eliminates positional ID race condition (was: `idx + 1` that changed between polls)
- **Unified task operations** — Both TaskFirstView and QueueView use tasksStore; one operation layer, one GID identification
- **Scheduler lifecycle fix** — Speed scheduler runs at App root level (was: stopped when leaving Settings page)
- **init() listener leak fix** — Post-download pipeline registered once (was: duplicated on every route navigation)
- **Ghost data fix** — localTasks cleared on connect (was: stale local data shown when aria2 temporarily empty)
- **Config-driven directories** — organize_file and aria2 startup read config download directory (was: hardcoded)
- **BT retry validation** — Checks source scheme before retrying (was: `addUri('torrent://name')` always failed)
- **aria2 stdout → log file** — Fixes potential RPC thread hang from `Stdio::null()`
- **Graceful shutdown** — Waits up to 5s for aria2 to save session before SIGKILL

#### CI/Release

- **Cross-platform CI** — Backend quality runs on ubuntu + macOS + Windows (was: ubuntu only)
- **tauri-plugin-updater registered** — Auto-update plugin activated in Cargo.toml + lib.rs

#### Testing

- **16 E2E integration tests** — Cover add/pause/resume/remove/retry/formatting/local-fallback/GID-stability
- **685 total tests** (was: 603)

### Changed

- **Task operations accept GID strings** — pauseTask/resumeTask/retryTask/removeTask/bumpPriority all take `string` GID instead of `number` positional ID
- **Structured logger in tasks store** — 8 `console.error/warn` replaced with `createLogger` from `@motrix-ai/core/browser`
- **Video extension list unified** — `getTypeFromFilename` and `isVideoFile` both have 8 extensions (was: inconsistent 5 vs 8)
- **Root package.json** — Added `"type": "module"` to fix ESLint MODULE_TYPELESS warning
- **README** — Updated version, test count, coverage, feature list to match reality

### Removed

- **ChatPanel.vue** (349 lines) — Dead code, never rendered by any view
- **useChatStore.ts** (84 lines) — Only consumer was dead ChatPanel
- **ChatPanel.test.ts** (187 lines) — Fabricated tests (tested inline function copies, not real code)
- **useChatStore.test.ts** (142 lines) — Tested dead code
- **useTaskAdapter.ts** (268 lines) — Never imported by any active code
- **mock/tasks.ts** (365 lines) — Only imported by dead useTaskAdapter
- **Total dead code removed: 1,395 lines**

### Fixed

- Speed display (50KB → "0.0 MB/s" → "52.3 KB/s" with auto-scaling)
- Size display (500KB → "0 MB" → "512.0 B" with auto-scaling)
- ETA display (7200s → "2h 0m" with h/m/s formatting)
- DetailPanel files/timeline/connections now populated from aria2 (was: always empty)
- Onboarding localStorage key mismatch (`motrix:` vs `motrix-ai:`)
- Hardcoded Chinese strings ("等待中...", "计算中...")
- Fake sample magnet hash replaced with real Ubuntu 24.04.2 hash
- 28 Rust regex `.unwrap()` → `.expect()` with descriptive messages
- tray.rs `.unwrap()` panic on missing window icon
- Clippy: manual_strip, noop_clone, never_loop, unused_assignments (all platforms)

## [1.1.0] - 2026-07-06

### Added

- Multi-platform aria2c binaries (Linux + Windows)
- 1337x search provider fix
- i18n with 58 new translation keys across 5 languages
- Config store unification (localStorage → file persistence)

## [1.0.0] - 2026-06-14

### Added

- Browser extension (Chrome/Firefox) for one-click download
- Smart scheduling UI with visual time-based rules
- NAS archive UI with directory mapping
- BYOK multi-model support (OpenCode/Anthropic/OpenAI/Ollama)
- MCP Server with 7 tools for AI agent integration
- i18n support (Chinese, English, Japanese, Korean, French)
- System tray with native notifications
- Auto-update support (tauri-plugin-updater)
- Cross-platform CI (macOS, Windows, Linux)
- Comprehensive test suite (202 tests, 51% coverage)
- Structured error handling (AppError hierarchy)
- Structured logging (Logger with level filtering)

### Changed

- Migrated from Electron to Tauri 2 for smaller bundle size
- Unified version management with bump script
- Enhanced TypeScript strict mode

### Fixed

- All ESLint errors resolved
- All Clippy warnings resolved
- CI pipeline fully green

## [0.1.0] - 2026-06-13

### Added

- Initial PoC release
- Tauri 2 + Vue 3 project skeleton
- Basic aria2 integration
