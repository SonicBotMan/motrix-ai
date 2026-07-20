# Motrix AI — Agent Context

## Architecture

Motrix AI is a monorepo with 4 packages:

- **core**: Business logic (intent parsing, search, queue, subtitle, file ops)
- **cli**: Command-line interface
- **mcp-server**: MCP server for AI agent integration
- **gui**: Tauri 2 desktop app (Vue 3 + Naive UI + Rust backend)

### Key File Paths

```
packages/
├── core/src/
│   ├── types.ts               # All TypeScript interfaces (AppConfig, Task, etc.)
│   ├── config/
│   │   ├── defaults.ts        # DEFAULT_CONFIG single source of truth (browser-safe)
│   │   └── loader.ts          # Config load/save with tilde expansion (Node only)
│   ├── ai/                     # IntentParser, KeywordGenerator, ResultEvaluator
│   ├── aria2/client.ts         # Aria2Client JSON-RPC (null-guarded)
│   ├── queue/manager.ts        # QueueManager (polling-based task registration)
│   └── errors.ts              # AppError hierarchy (Aria2Error, SearchError, etc.)
├── cli/src/commands/           # add, ask, list, pause, config
└── mcp-server/src/index.ts    # MCP tools (search + confirm_download pattern)

apps/gui/
├── src/
│   ├── components/task/        # TaskTable, TaskRow, DetailPanel, DetailProgressRing,
│   │                           # DetailPeerList, DetailFooter, FilterTabs, RowMenu
│   ├── components/settings/    # DownloadsTab, AiModelTab, AdvancedTab, SubtitlesTab
│   ├── composables/            # useAria2, useDownloadPipeline, useSettings
│   ├── stores/                 # useTasksStore, useConfigStore, useToastStore
│   ├── shared/utils/task-utils.ts  # formatSource, statusPillClass, typeIcons
│   └── locales/strings.ts     # 5-language i18n (en/zh/ja/ko/fr)
└── src-tauri/src/
    ├── commands/aria2.rs       # Engine lifecycle: start/stop/crash-detect/cleanup_port
    ├── commands/config.rs      # Config CRUD (Rust-side defaults mirror defaults.ts)
    ├── commands/fs.rs          # File ops, organize_file (TOCTOU-safe)
    └── commands/mod.rs         # configured_download_dir (tilde expansion)
```

## Development Workflow

1. Create feature branch
2. Make changes
3. Run verification (see below)
4. Commit with conventional message
5. Open PR — CI runs on ubuntu + macOS + Windows

## Verification Commands

Run ALL before committing:

```bash
# Frontend
pnpm lint                      # ESLint
pnpm prettier --check .        # Format check (CI enforces this)
cd apps/gui && npx vue-tsc --noEmit  # Vue + TS type checking (catches template errors)
pnpm test                      # Vitest (702+ tests)

# Backend (from apps/gui/src-tauri/)
cargo fmt -- --check           # Rust format
cargo clippy --all-targets -- -D warnings  # Rust lint (zero warnings allowed)
cargo test --all-targets       # Rust tests + integration tests
```

> **`vue-tsc --noEmit` catches Vue template type errors** that plain `tsc` misses
> (e.g. passing wrong prop types to components). Always use it instead of `tsc --noEmit`.

## Release Process

```bash
# 1. Bump version (updates all 6 files atomically)
node scripts/bump-version.mjs 1.6.0

# 2. Run release script (runs ALL checks, then commits + tags + pushes)
pnpm release
# or: bash scripts/release.sh

# 3. Create GitHub Release from the pushed tag
# Release CI builds for macOS (ARM64/x64) + Windows (x64) + Linux (x64)
```

> **Never skip the release script.** It runs 7 quality gates before tagging.
> Tagging without verification causes CI failures that waste 15+ minutes.

## Error Handling

- Use typed errors from `packages/core/src/errors.ts` (AppError hierarchy)
- Never leave catch blocks empty — capture and log via `createLogger`
- GUI logger: `import { createLogger } from '@motrix-ai/core/browser'`
- Core/CLI logger: `import { createLogger } from './logger.js'`

## Config System

- **Single source of truth**: `packages/core/src/config/defaults.ts` (browser-safe, `~/` paths)
- **GUI imports** via `@motrix-ai/core/browser` (no Node.js APIs in browser bundle)
- **Rust mirrors** defaults in `commands/config.rs` (keep in sync manually)
- **schemaVersion** is a migration marker, NOT a default — injected at load time
- **Subdir fields** are relative names (`"Movies"`), NOT full paths

## Engine (aria2) Management

- Binary renamed to `motrix-ai-engine-*` to avoid AV false positives
- `aria2.conf` bundled at `resources/bin/aria2.conf` (based on motrix-next's proven config)
- **Windows paths** use `dunce::simplified()` to strip `\\?\` prefix
- **Proxy env vars** cleared before spawning aria2c
- **Crash detection** via monitor thread (`child.wait()` + `ARIA2_INTENTIONAL_STOP` flag)
- **Port cleanup** before start: kills leftover engine processes on RPC port
- **Integration tests** in `aria2.rs::tests` verify real downloads on CI

## Testing Strategy

- **Unit tests**: Core modules + GUI stores/composables (Vitest, 702+ tests)
- **Rust unit tests**: Format/extract_subdir_name/error handling
- **Rust integration tests**: Engine lifecycle + real HTTPS download (runs on CI)
- **E2E tests**: 16 integration tests covering add/pause/resume/remove/retry

## Code Conventions

- TypeScript strict mode. No `any`, no `eslint-disable`, no `as` without justification
- Vue: `<script setup lang="ts">` for all components
- Rust: `Result<T, String>` for Tauri commands, no `unwrap()` in production
- CSS: design tokens from `tokens.css`, no hardcoded hex colors
- Comments: only for non-obvious WHY, never for WHAT
