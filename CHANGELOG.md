# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
