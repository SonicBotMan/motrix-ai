# Motrix AI

> AI-native download manager — describe what you want, AI handles the rest.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)](https://tauri.app/)
[![Vue 3](https://img.shields.io/badge/Vue-3-42B883?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![CI](https://github.com/SonicBotMan/motrix-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/SonicBotMan/motrix-ai/actions)
[![Release](https://github.com/SonicBotMan/motrix-ai/actions/workflows/release.yml/badge.svg)](https://github.com/SonicBotMan/motrix-ai/releases)

<div align="center">
  <img src="docs/images/motrix-ai-mascot.jpg" alt="Motrix AI Mascot" width="400">
  <p><strong>「高速下载 极简体验」</strong></p>
</div>

Motrix AI flips the download manager paradigm: instead of manually copying links and
managing queues, you **tell the AI what you want in natural language**, and it handles
resource discovery, download scheduling, subtitle matching, and file organization.

```
You: "Download Interstellar 4K with subtitles"
AI:  Found → Queued → Downloaded → Subtitled → Organized ✅
```

---

## What's New in v1.4.0

- 🔒 **Security**: TOCTOU race condition fix in file organization
- 🏗️ **Architecture**: 3 god-components split into focused modules (TaskTable -47%, DetailPanel -24%, TaskFirstView -29%)
- 🔧 **Reliability**: aria2c auto-restart on crash, queue race fix, config mutation fix
- ✨ **Features**: aria2 advanced options (cert/tracker/headers), form validation, responsive breakpoints
- 🎨 **UX**: i18n completion, WCAG accessibility (aria-labels), CLI English output
- 📐 **Type safety**: eliminated `any` / `eslint-disable` / non-null assertions at trust boundaries

[Full changelog →](CHANGELOG.md)

---

## Features

### Core

- **Natural language download** — describe what you want, AI parses intent and finds resources
- **aria2 engine** — HTTP / FTP / BitTorrent / Magnet support with 16-connection parallel download
- **Bundled for all platforms** — macOS / Linux / Windows aria2c binaries included, no manual install required
- **Auto subtitle matching** — searches shooter.cn / subhd.tv after download completes
- **Auto file organization** — renames and categorizes files into Movies / TV / Software folders
- **Smart scheduling** — adapts to time of day, available disk space, and network conditions
- **aria2c crash recovery** — daemon auto-restarts after persistent connection failures
- **Desktop GUI** — Tauri 2 + Vue 3 + Naive UI, lightweight native install (~7 MB)
- **MCP Server** — tools for AI agent integration (Claude Desktop, etc.)
- **Cross-platform** — macOS (ARM64/x64), Windows (x64), Linux (x64) — all out-of-the-box

### AI and Models

- **BYOK multi-model** — OpenCode (free), Anthropic Claude, OpenAI GPT, Ollama (local)
- **Multi-source parallel search** — btdig, 1337x, nyaa, mikan with deduplication
- **Smart ranking** — ResultEvaluator scores results by quality match (20%), size reasonableness (20%), seeders (30%), and title relevance (30%)
- **Keyword expansion** — KeywordGenerator expands search terms by resource type (movie, TV, anime, software, music)
- **Two-step MCP download** — search returns candidates; explicit `confirm_download` required before queueing

### UI and UX

- **Chat-first interface** — natural language input as primary interaction
- **Task queue** — real-time progress, speed (auto-scaling B/KB/MB/GB/s), ETA (h/m/s format), pause/resume/retry
- **Task detail panel** — progress ring, peer list with live polling, file selection, timeline
- **Task search** — live filter tasks by name or source URL
- **Drag-and-drop** — drop .torrent files onto the window
- **Batch download** — paste multiple URLs (one per line) in chat input
- **Delete with files** — remove task and delete downloaded files in one action
- **Form validation** — inline error messages on all settings fields
- **Responsive layout** — adapts to narrow window widths (720px minimum)
- **Dark/Light/System themes** — follows OS preference
- **i18n** — Chinese, English, Japanese, Korean, French
- **Accessibility** — WCAG 2.4.4 aria-labels on all buttons, skip-link, reduced-motion support
- **System tray** — minimize to tray, native notifications
- **Scheduling UI** — visual time-based speed rules editor
- **NAS archive UI** — configure automatic rsync to network storage

### Advanced aria2 Options

- **Custom User-Agent** — override the default UA for sites that block it
- **HTTPS certificate validation** — toggle on/off per use case
- **BitTorrent trackers** — add custom tracker URLs for better peer discovery
- **Custom HTTP headers** — set Referer, Cookie, Authorization, etc.

### Browser Extension

- **Chrome/Firefox extension** — one-click download from any page
- **Auto-detect links** — magnet, ed2k, video sources
- **Right-click menu** — "Download with Motrix AI"

### Developer

- **CLI mode** — `motrix-ai ask "download VS Code latest"` from terminal
- **MCP Server** — expose download capabilities to AI agents
- **702 tests** — TypeScript (Vitest) + Rust (cargo test)
- **Typed errors** — AppError hierarchy with cause chaining
- **Structured logging** — level-filtered logger via @motrix-ai/core/browser
- **Monorepo code sharing** — GUI imports KeywordGenerator + ResultEvaluator + Logger from packages/core
- **Browser-safe defaults** — DEFAULT_CONFIG single source of truth via @motrix-ai/core/browser
- **Security hardened** — aria2 RPC secret (CSPRNG), HTTP API token auth, path traversal protection (TOCTOU-safe), MCP URL scheme allow-list, deep link confirmation
- **Cross-platform CI** — ubuntu + macOS + Windows matrix, Clippy clean on all platforms

---

## Installation

> **No prerequisites.** aria2 download engine is bundled for all platforms — just install and run.

Download the latest release from [GitHub Releases →](https://github.com/SonicBotMan/motrix-ai/releases/latest)

| Platform              | File                                  |
| --------------------- | ------------------------------------- |
| macOS (Apple Silicon) | `Motrix.AI_*_aarch64.dmg`             |
| macOS (Intel)         | `Motrix.AI_*_x64.dmg`                 |
| Windows               | `Motrix.AI_*_x64-setup.exe` or `.msi` |
| Linux (Debian/Ubuntu) | `Motrix.AI_*_amd64.deb`               |
| Linux (Fedora/RHEL)   | `Motrix.AI-*_.x86_64.rpm`             |
| Linux (universal)     | `Motrix.AI_*_amd64.AppImage`          |

---

## Quick Start (Development)

```bash
git clone https://github.com/SonicBotMan/motrix-ai.git
cd motrix-ai

pnpm install

# Development mode
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# CLI usage
pnpm cli ask "download VS Code latest"
```

---

## Architecture

```
motrix-ai/
├── apps/gui/                  # Tauri 2 desktop app (Vue 3 + Naive UI)
│   ├── src/
│   │   ├── components/task/   # TaskTable, TaskRow, DetailPanel, DetailProgressRing, DetailPeerList, DetailFooter
│   │   ├── components/chat/   # BottomChat
│   │   ├── components/chrome/ # ChromeBar
│   │   ├── components/settings/ # DownloadsTab, AiModelTab, AdvancedTab, SubtitlesTab, AppearanceTab
│   │   ├── composables/       # useAria2, useDownloadPipeline, useSettings, useOpenCode
│   │   ├── stores/            # useTasksStore, useConfigStore, useToastStore
│   │   ├── shared/utils/      # task-utils, format
│   │   └── locales/           # strings.ts (5 languages)
│   └── src-tauri/             # Rust backend (commands, tray, aria2 lifecycle)
├── packages/
│   ├── core/                  # Shared business logic
│   │   ├── ai/                # IntentParser, KeywordGenerator, ResultEvaluator
│   │   ├── aria2/             # Aria2Client (JSON-RPC, null-guarded)
│   │   ├── search/            # Search providers (btdig, mikan, nyaa, duckduckgo)
│   │   ├── subtitle/          # Subtitle matchers (shooter, subhd)
│   │   ├── queue/             # QueueManager (polling-based task registration)
│   │   ├── file/              # FileRenamer, organizer, templates
│   │   ├── scheduler/         # Time/disk/retry schedulers
│   │   ├── config/            # defaults.ts (single source), loader, migrations
│   │   ├── errors/            # AppError hierarchy
│   │   └── logger/            # Structured logging
│   ├── cli/                   # Command-line interface
│   └── mcp-server/            # MCP server (search + confirm_download + 5 more tools)
├── extensions/browser/        # Chrome/Firefox extension
├── docs/                      # PRD, architecture, design specs
└── scripts/                   # Version bump, utilities
```

---

## Tech Stack

| Layer               | Technology                                     |
| ------------------- | ---------------------------------------------- |
| **Frontend**        | Vue 3 + Pinia + Naive UI + TypeScript          |
| **Backend**         | Rust (Tauri 2)                                 |
| **Download Engine** | aria2 (JSON-RPC, bundled)                      |
| **AI**              | OpenCode SDK (BYOK: Anthropic/OpenAI/Ollama)   |
| **Database**        | SQLite (better-sqlite3)                        |
| **Build**           | Vite + Cargo + pnpm + Turborepo                |
| **Tests**           | Vitest + cargo test                            |
| **CI/CD**           | GitHub Actions (3-platform matrix, SHA-pinned) |

---

## Project Status

| Metric        | Value                                   |
| ------------- | --------------------------------------- |
| **Version**   | 1.4.0                                   |
| **Tests**     | 702 TS (50 files) + Rust unit tests     |
| **Platforms** | macOS ARM64/x64, Windows x64, Linux x64 |
| **Languages** | 5 (中/英/日/韩/法)                      |
| **ESLint**    | 0 errors, 0 warnings                    |
| **Clippy**    | 0 warnings (all platforms)              |

---

## Roadmap

- ✅ **v0.1.0** — PoC (OpenCode SDK validation)
- ✅ **v0.2.0** — Alpha (cross-platform CI, system tray, notifications)
- ✅ **v1.0.0** — Stable release (all features, 5 languages)
- ✅ **v1.1.0** — Multi-platform aria2c, 1337x fix, i18n, config store
- ✅ **v1.2.0** — AI pipeline connected, security hardening, E2E tests
- ✅ **v1.3.0** — Comprehensive bug audit (80+ fixes)
- ✅ **v1.4.0** — Code quality overhaul, reliability, UX improvements (12 PRs, 42 audit findings addressed)

### Future

- Auto-update (Tauri updater with latest.json)
- Code signing (macOS/Windows)
- Homebrew/Scoop distribution
- Startup on boot
- More search providers
- More subtitle sources
- Performance benchmarks

---

## Contributing

We welcome contributions! Please see:

- [CONTRIBUTING.md](CONTRIBUTING.md) — Development setup, code quality, PR guidelines
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Community standards
- [PRIVACY.md](PRIVACY.md) — Data handling practices

### Quick Start for Contributors

```bash
git clone https://github.com/YOUR_USERNAME/motrix-ai.git
cd motrix-ai
pnpm install

git checkout -b feature/my-feature

# Make changes, verify
pnpm test && pnpm lint && pnpm typecheck

git commit -m "feat: add my feature"
git push origin feature/my-feature
# Open PR → CI runs on 3 platforms → review → merge
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Motrix Next](https://github.com/AnInsomniacy/motrix-next) — Architecture inspiration
- [Aria2](https://aria2.github.io/) — Download engine
- [OpenCode](https://github.com/anomaly/ai/opencode) — AI SDK
- [Tauri](https://tauri.app/) — Desktop framework
- [Vue.js](https://vuejs.org/) — Frontend framework
- [Naive UI](https://www.naiveui.com/) — UI components

---

<div align="center">
  <sub>Built with care by <a href="https://github.com/SonicBotMan">Orion</a></sub>
</div>
