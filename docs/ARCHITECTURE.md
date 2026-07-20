# Architecture

## Overview

Motrix AI is a monorepo with 4 packages:

```
motrix-ai/
├── apps/gui/          # Tauri 2 desktop app
├── packages/core/     # Shared business logic
├── packages/cli/      # Command-line interface
├── packages/mcp-server/ # MCP server
└── extensions/browser/ # Browser extension
```

## Data Flow

```
User Input (NL/URL)
    ↓
Intent Parser (OpenCode SDK)
    ↓
Keyword Generator
    ↓
Search Providers (btdig/mikan/duckduckgo)
    ↓
Result Evaluator (score: seeders + size + quality)
    ↓
Queue Manager → aria2 RPC
    ↓
Download Progress → GUI Update
    ↓
Post-Processor (subtitle + rename + organize + archive)
```

## Key Technologies

| Layer    | Technology                    |
| -------- | ----------------------------- |
| Frontend | Vue 3 + Pinia + Naive UI      |
| Backend  | Rust (Tauri 2)                |
| Download | aria2 (JSON-RPC)              |
| AI       | OpenCode SDK (BYOK supported) |
| Build    | Vite + Cargo                  |
| Tests    | Vitest + cargo test           |

## Module Responsibilities

### packages/core

- Intent parsing (NL → structured intent)
- Keyword generation
- Search provider abstraction
- Result evaluation
- Queue management (aria2 RPC)
- Subtitle matching
- File organization
- Scheduling (time/disk/retry)
- Archive sync
- Config management
- Error handling
- Logging

### apps/gui

- Tauri 2 desktop shell
- Vue 3 frontend
- System tray
- Notifications
- File dialogs

### packages/cli

- Command-line interface
- Direct core module usage

### packages/mcp-server

- MCP protocol implementation
- 7 tools for AI agent integration

### extensions/browser

- Chrome/Firefox extension
- Context menu integration
- Content script (link detection)
- Popup UI
