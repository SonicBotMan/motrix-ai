# Contributing to Motrix AI

Thank you for your interest in contributing!

## Development Setup

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Start development: `pnpm dev`

## Code Quality

- **Linting**: ESLint + Prettier (auto-fix on commit via Husky)
- **Type Checking**: TypeScript strict mode
- **Testing**: Vitest with coverage thresholds
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, etc.)

## Pull Request Guidelines

- Keep PRs under 300 lines changed
- One concern per PR
- Include tests for new features
- Update documentation as needed

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Type check
pnpm typecheck
```

## Project Structure

```
motrix-ai/
├── apps/gui/            # Tauri desktop app
├── packages/core/       # Shared business logic
├── packages/cli/        # Command-line interface
└── packages/mcp-server/ # MCP server
```

## AI Development Policy

If using AI-assisted development tools:
- Disclose the model/tool used in your PR description
- Review all AI-generated code before submitting
- Ensure AI-generated code follows project conventions
