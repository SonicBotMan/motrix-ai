# C4 — P2 Residual Cleanup (CLI i18n + design tokens + icons)

**Branch:** `fix/c4-p2-cleanup` | **Base:** `01b6aaf`

## Scope

### P2-21: CLI Chinese → English (5 files in packages/cli/src/commands/)

Translate ALL Chinese user-facing strings in console.log/error/warn to English.
Translate command descriptions (.description(), .argument(), .option()) to English.
Translate Chinese code comments to English (optional but preferred for consistency).

### P2-8: Hardcoded hex → CSS tokens (3 component files)

Replace hex colors (`#A855F7`, `#3B82F6`, `#EC4899`) with CSS custom properties.

### P2-9: Icon unification (2 component files)

Replace inline SVGs with @vicons/ionicons5 components where mixed.

## Out of scope (too large / platform-specific)

- P2-15: search.rs regex robustness (Rust, large refactor)
- P2-16: Windows anti-sleep (platform Rust)
- P2-17: Auto-start (Tauri plugin setup)
- P2-29: MCP module-level aria2 (architecture refactor)
