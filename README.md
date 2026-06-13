# Motrix AI

> AI-native download manager — describe what you want, AI handles the rest.

## What is this?

Motrix AI flips the download manager paradigm: instead of manually copying links and managing queues, you **tell the AI what you want in natural language**, and it handles resource discovery, download scheduling, subtitle matching, and file organization automatically.

```
You: "Download Interstellar 4K with subtitles"
AI:  Found → Queued → Downloaded → Subtitled → Organized ✅
```

## Features (MVP)

- 🤖 **Natural language download** — describe what you want, AI parses intent and finds resources
- ⚡ **aria2 engine** — HTTP/FTP/BitTorrent/Magnet support with 16-connection parallel download
- 🎬 **Auto subtitle matching** — searches shooter.cn / subhd.tv after download completes
- 📁 **Auto file organization** — renames and categorizes files into Movies/TV/Software folders
- 🖥️ **Desktop GUI** — Tauri 2 + Vue 3 + Naive UI, ~7 MB install size

## Architecture

```
motrix-ai/
├── apps/gui/          # Tauri desktop app (Vue 3 frontend + Rust backend)
├── packages/core/     # Shared business logic (intent parser, aria2 client, search, subtitle)
├── packages/cli/      # CLI interface
├── packages/mcp-server/ # MCP server for external agent integration
└── docs/              # PRD, design docs
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 3 + Naive UI + TypeScript |
| Backend | Rust (Tauri 2) |
| Download Engine | aria2c (bundled) |
| AI | OpenCode SDK (free models, BYOK supported) |
| Build | pnpm + Turborepo |

## Getting Started

```bash
# Prerequisites
pnpm install

# Development
pnpm dev

# Build
pnpm build
```

## License

MIT
