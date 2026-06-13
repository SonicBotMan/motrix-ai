# Motrix AI

> AI-native download manager — describe what you want, AI handles the rest.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)](https://tauri.app/)
[![Vue 3](https://img.shields.io/badge/Vue-3-42B883?logo=vue.js&logoColor=white)](https://vuejs.org/)
[![CI](https://github.com/SonicBotMan/motrix-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/SonicBotMan/motrix-ai/actions)
[![Release](https://github.com/SonicBotMan/motrix-ai/actions/workflows/release.yml/badge.svg)](https://github.com/SonicBotMan/motrix-ai/releases)

Motrix AI flips the download manager paradigm: instead of manually copying links and
managing queues, you **tell the AI what you want in natural language**, and it handles
resource discovery, download scheduling, subtitle matching, and file organization
automatically.

```
You: "Download Interstellar 4K with subtitles"
AI:  Found -> Queued -> Downloaded -> Subtitled -> Organized ✅
```

<!-- Screenshot coming soon -->
<!-- ![Motrix AI Screenshot](docs/screenshots/main.png) -->

---

## Features

### Core

- **Natural language download** — describe what you want, AI parses intent and finds resources
- **aria2 engine** — HTTP / FTP / BitTorrent / Magnet support with 16-connection parallel download
- **Auto subtitle matching** — searches shooter.cn / subhd.tv after download completes
- **Auto file organization** — renames and categorizes files into Movies / TV / Software folders
- **Smart scheduling** — adapts to time of day, available disk space, and network conditions
- **Desktop GUI** — Tauri 2 + Vue 3 + Naive UI, lightweight native install (~7 MB)
- **MCP Server** — 7 tools for AI agent integration (Claude Desktop, Hermes, etc.)
- **Cross-platform** — macOS (ARM64/x64), Windows (x64), Linux (x64)

### AI and Models

- **BYOK multi-model** — OpenCode (free), Anthropic Claude, OpenAI GPT, Ollama (local)
- **Multi-source search** — btdig, mikan, DuckDuckGo with parallel queries
- **Smart ranking** — scores results by seeders, size, and quality match

### UI and UX

- **Chat-first interface** — natural language input as primary interaction
- **Task queue** — real-time progress, speed, ETA, pause/resume/retry
- **Dark/Light/System themes** — follows OS preference
- **i18n** — Chinese, English, Japanese, Korean, French
- **System tray** — minimize to tray, native notifications
- **Scheduling UI** — visual time-based speed rules editor
- **NAS archive UI** — configure automatic rsync to network storage

### Browser Extension

- **Chrome/Firefox extension** — one-click download from any page
- **Auto-detect links** — magnet, ed2k, video sources
- **Right-click menu** — "Download with Motrix AI"

### Developer

- **CLI mode** — `motrix-ai ask "下 XX"` from terminal
- **MCP Server** — expose download capabilities to AI agents
- **212 tests** — 202 TypeScript + 10 Rust, 51% coverage
- **Structured errors** — typed error hierarchy with cause chaining
- **Structured logging** — level-filtered logger replacing console.*

---

## Installation

### macOS

```bash
# Homebrew (recommended)
brew tap SonicBotMan/motrix-ai
brew install --cask motrix-ai

# Or download .dmg from Releases
```

### Windows

```bash
# Scoop (recommended)
scoop bucket add extras
scoop install motrix-ai

# Or download .exe from Releases
```

### Linux

```bash
# Debian/Ubuntu
sudo dpkg -i motrix-ai_*.deb

# Fedora/RHEL
sudo rpm -i motrix-ai-*.rpm

# Universal
chmod +x motrix-ai_*.AppImage
./motrix-ai_*.AppImage
```

> Download the latest release from [GitHub Releases](https://github.com/SonicBotMan/motrix-ai/releases)

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/SonicBotMan/motrix-ai.git
cd motrix-ai

# Install dependencies
pnpm install

# Development mode
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# CLI usage
pnpm cli ask "下 VS Code 最新版"
```

---

## Architecture

```
motrix-ai/
├── apps/gui/              # Tauri 2 desktop app (Vue 3 + Naive UI)
│   ├── src/               # Frontend (components, views, stores, composables)
│   └── src-tauri/         # Rust backend (commands, tray, error handling)
├── packages/
│   ├── core/              # Shared business logic (25 modules)
│   │   ├── ai/            # Intent parser, keyword generator, result evaluator
│   │   ├── aria2/         # aria2 RPC client
│   │   ├── search/        # Search providers (btdig, mikan, duckduckgo)
│   │   ├── subtitle/      # Subtitle matchers (shooter, subhd)
│   │   ├── queue/         # Task queue (SQLite persistence)
│   │   ├── file/          # File organizer, renamer, templates
│   │   ├── scheduler/     # Time/disk/retry schedulers
│   │   ├── archive/       # NAS sync (rsync)
│   │   ├── pipeline/      # Post-processor
│   │   ├── config/        # Config schema, loader, migrations
│   │   ├── errors/        # Typed error hierarchy
│   │   └── logger/        # Structured logging
│   ├── cli/               # Command-line interface
│   └── mcp-server/        # MCP server (7 tools)
├── extensions/browser/    # Chrome/Firefox extension
├── docs/                  # PRD, architecture, design docs
└── scripts/               # Version bump, utilities
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed architecture documentation.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vue 3 + Pinia + Naive UI + TypeScript |
| **Backend** | Rust (Tauri 2) |
| **Download Engine** | aria2 (JSON-RPC, bundled) |
| **AI** | OpenCode SDK (BYOK: Anthropic/OpenAI/Ollama) |
| **Database** | SQLite (better-sqlite3) |
| **Build** | Vite + Cargo + pnpm + Turborepo |
| **Tests** | Vitest + cargo test |
| **CI/CD** | GitHub Actions (4 platform matrix) |

---

## Project Status

| Metric | Value |
|--------|-------|
| **Version** | 1.0.0 |
| **Tests** | 212 (202 TS + 10 Rust) |
| **Coverage** | 51% |
| **ESLint** | 0 errors, 0 warnings |
| **Platforms** | 4 (macOS ARM64/x64, Windows x64, Linux x64) |
| **Languages** | 5 (中/英/日/韩/法) |
| **Core Modules** | 25 |
| **Composables** | 10 |
| **Tauri Plugins** | 6 |

---

## Roadmap

- ✅ **v0.1.0** — PoC (OpenCode SDK validation)
- ✅ **v0.2.0** — Alpha (cross-platform CI, system tray, notifications)
- ✅ **v1.0.0** — Stable release (all features, 212 tests, 5 languages)

### Future

- E2E tests (Playwright)
- Code signing (macOS/Windows)
- Homebrew/Scoop auto-update
- Deep link support (magnet://, ed2k://)
- Startup on boot
- Performance benchmarks
- Accessibility (ARIA)
- More search providers
- More subtitle sources

---

## Contributing

We welcome contributions! Please see:

- [CONTRIBUTING.md](CONTRIBUTING.md) — Development setup, code quality, PR guidelines
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — Community standards
- [PRIVACY.md](PRIVACY.md) — Data handling practices

### Quick Start for Contributors

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/motrix-ai.git
cd motrix-ai

# Install dependencies
pnpm install

# Create feature branch
git checkout -b feature/my-feature

# Make changes, run tests
pnpm test
pnpm lint
pnpm typecheck

# Commit with conventional message
git commit -m "feat: add my feature"

# Push and create PR
git push origin feature/my-feature
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Acknowledgments

- [Motrix Next](https://github.com/AnInsomniacy/motrix-next) — Architecture inspiration
- [Aria2](https://aria2.github.io/) — Download engine
- [OpenCode](https://github.com/anomalyco/opencode) — AI SDK
- [Tauri](https://tauri.app/) — Desktop framework
- [Vue.js](https://vuejs.org/) — Frontend framework
- [Naive UI](https://www.naiveui.com/) — UI components

---

<div align="center">
  <sub>Built with love by <a href="https://github.com/SonicBotMan">Orion</a></sub>
</div>
