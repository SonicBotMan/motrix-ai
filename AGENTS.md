# Motrix AI — Agent Context

## Architecture

Motrix AI is a monorepo with 4 packages:
- **core**: Business logic (intent parsing, search, queue, subtitle, file ops)
- **cli**: Command-line interface
- **mcp-server**: MCP server for AI agent integration
- **gui**: Tauri 2 desktop app (Vue 3 + Naive UI)

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/types.ts` | All TypeScript interfaces |
| `packages/core/src/index.ts` | Core module exports |
| `apps/gui/src-tauri/src/commands.rs` | Rust IPC commands |
| `apps/gui/src/views/MainView.vue` | Main GUI view |
| `docs/PRD.md` | Product requirements |

## Development Workflow

1. Create feature branch
2. Make changes
3. Run `pnpm typecheck && pnpm test && pnpm lint`
4. Commit with conventional message
5. Open PR

## Testing Strategy

- **Unit tests**: Core modules (vitest)
- **Integration tests**: CLI commands
- **E2E tests**: GUI (planned)

## Error Handling

- Use typed errors from `packages/core/src/errors.ts`
- Never leave catch blocks empty
- Use logger from `packages/core/src/logger.ts`

## Version Management

Single source of truth: `node scripts/bump-version.mjs <version>`
Updates: package.json, tauri.conf.json, Cargo.toml, all workspace packages
