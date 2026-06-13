# Motrix AI

> AI-native download manager — describe what you want, AI handles the rest.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri 2](https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black)](https://tauri.app/)
[![Vue 3](https://img.shields.io/badge/Vue-3-42B883?logo=vue.js&logoColor=white)](https://vuejs.org/)

Motrix AI flips the download manager paradigm: instead of manually copying links and
managing queues, you **tell the AI what you want in natural language**, and it handles
resource discovery, download scheduling, subtitle matching, and file organization
automatically.

```
You: "Download Interstellar 4K with subtitles"
AI:  Found → Queued → Downloaded → Subtitled → Organized ✅
```

<!-- 📸 Screenshot coming soon -->
<!-- ![Motrix AI Screenshot](docs/screenshots/main.png) -->

---

## ✨ Features

- 🤖 **Natural language download** — describe what you want, AI parses intent and finds resources
- ⚡ **aria2 engine** — HTTP / FTP / BitTorrent / Magnet support with multi-connection parallel download
- 🎬 **Auto subtitle matching** — searches shooter.cn / subhd.tv after download completes
- 📁 **Auto file organization** — renames and categorizes files into Movies / TV / Software folders
- ⏰ **Smart scheduling** — adapts to time of day, available disk space, and network conditions
- 🖥️ **Desktop GUI** — Tauri 2 + Vue 3 + Naive UI, lightweight native install (~7 MB)
- 🔌 **MCP server** — expose downloads to external AI agents via Model Context Protocol
- 🌐 **Cross-platform** — macOS, Windows, and Linux from a single codebase

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20+
- **pnpm** 10+ (`npm i -g pnpm`)
- **Rust** toolchain (only required to build the desktop GUI / Tauri backend)

### Install

```bash
git clone https://github.com/SonicBotMan/motrix-ai.git
cd motrix-ai
pnpm install
```

### Development

```bash
pnpm dev        # start all workspaces (core, cli, mcp-server, gui) in dev mode
```

### Build

```bash
pnpm build      # build all packages (turbo run build)
pnpm test       # run the test suite
pnpm typecheck  # type-check across the monorepo
```

### CLI usage

```bash
# Ask the AI to find and download something in natural language
motrix-ai ask "下流浪地球 2 4K 字幕版"
```

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Motrix AI                             │
│                                                             │
│   apps/gui            packages/cli      packages/mcp-server │
│   (Tauri 2 + Vue 3)   (Commander)       (MCP SDK)          │
│        │                   │                   │           │
│        └───────────────────┼───────────────────┘           │
│                            ▼                                │
│                    packages/core                           │
│   ┌───────────┬──────────┬──────────┬──────────┬─────────┐ │
│   │   ai      │  search  │  aria2   │ subtitle │  file   │ │
│   │ (intent,  │ (BT/DDG/ │ (client/ │ (shooter │ (organ- │ │
│   │  keywords,│  mikan)  │  queue)  │  /subhd) │  ize)   │ │
│   │  eval)    │          │          │          │         │ │
│   └───────────┴──────────┴──────────┴──────────┴─────────┘ │
│   ┌───────────┬──────────────────────┐                     │
│   │ scheduler │  pipeline + archive  │                     │
│   │ (time/    │  (post-process, NAS  │                     │
│   │  disk/    │   sync)              │                     │
│   │  retry)   │                      │                     │
│   └───────────┴──────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

📄 The full product spec lives in [`docs/PRD.md`](docs/PRD.md).

## 🧰 Tech Stack

| Layer            | Technology                                            |
| ---------------- | ----------------------------------------------------- |
| Frontend         | Vue 3 + Naive UI + Pinia + Vue Router + TypeScript    |
| Desktop Backend  | Rust (Tauri 2)                                        |
| Download Engine  | aria2c (bundled binary, JSON-RPC)                     |
| AI               | OpenCode SDK (free models, BYOK supported)            |
| Search Providers | BTDigg · DuckDuckGo · Mikan                           |
| Subtitle Sources | shooter.cn · subhd.tv                                 |
| Storage          | better-sqlite3 (task queue)                           |
| MCP Integration  | @modelcontextprotocol/sdk                             |
| Build            | pnpm + Turborepo · Vite · tsup                        |
| Testing          | Vitest                                                |

## 📁 Project Structure

```
motrix-ai/
├── apps/
│   └── gui/                      # Tauri desktop app
│       ├── src/                  #   Vue 3 frontend (views, components, composables)
│       └── src-tauri/            #   Rust backend + bundled aria2c binary
│           ├── src/              #     commands.rs, lib.rs, main.rs
│           └── resources/bin/    #     aria2c engine
├── packages/
│   ├── core/                     # Shared business logic
│   │   └── src/
│   │       ├── ai/               #   intent parser, keyword generator, result evaluator
│   │       ├── aria2/            #   aria2 JSON-RPC client
│   │       ├── config/           #   schema + config loader
│   │       ├── file/             #   organizer, renamer, templates
│   │       ├── pipeline/         #   post-processor
│   │       ├── queue/            #   SQLite-backed task database + manager
│   │       ├── scheduler/        #   time-based, disk-based, retry scheduling
│   │       ├── search/           #   btdig, duckduckgo, mikan providers
│   │       ├── subtitle/         #   shooter, subhd, finder
│   │       ├── archive/          #   NAS / multi-device sync
│   │       └── types.ts
│   ├── cli/                      # Command-line interface (`motrix-ai`)
│   │   └── src/commands/         #   add, ask, config, list, pause
│   └── mcp-server/               # MCP server for external agent integration
├── docs/                         # PRD, design preview, interaction audit
├── package.json                  # Monorepo root (turbo scripts)
└── pnpm-workspace.yaml
```

## 🗺️ Roadmap

- [x] **PoC** — natural-language → search → download proof of concept
- [x] **MVP core modules** — intent parser, aria2 client, search, subtitle, file organizer, scheduler, queue
- [ ] 🔄 **MVP GUI integration** — wire core engine into Tauri + Vue desktop app _(in progress)_
- [ ] **Alpha release** — bundled installers, onboarding, settings UI
- [ ] **Beta + 6-platform CI** — macOS / Windows / Linux, automated builds & tests
- [ ] **v1.0** — stable public release

## 🤝 Contributing

Contributions are welcome! This project is early-stage, so please open an issue first
to discuss what you'd like to change.

- 📖 Contributing guide: [`CONTRIBUTING.md`](CONTRIBUTING.md) _(coming soon)_
- 🐛 Found a bug or have an idea? Open an
  [issue](https://github.com/SonicBotMan/motrix-ai/issues/new/choose).
- 🔧 Pull requests are welcome against the `main` branch.

## 📄 License

[MIT](LICENSE) © Motrix AI contributors

## 🙏 Acknowledgments

Motrix AI stands on the shoulders of giants. Built with inspiration from:

- **[Motrix Next](https://github.com/agalwood/Motrix)** — the modern Motrix revival (Tauri 2 + aria2) that proved the architecture
- **[Aria2 Next](https://github.com/aria2/aria2)** — the powerhouse download engine under the hood
- **[OpenCode](https://github.com/opencode-ai)** — AI SDK powering natural-language understanding
- **[Tauri](https://tauri.app/)** — for a secure, lightweight, cross-platform desktop runtime

---

<p align="center">Made with ❤️ for people who'd rather just say it than hunt for the link.</p>
