# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- AI natural language download (NL→search→magnet→queue)
- aria2 download engine integration (HTTP/BT/Magnet/FTP)
- Chat-first GUI (Tauri 2 + Vue 3 + Naive UI)
- Task management (list/pause/resume/delete/retry)
- Auto subtitle matching (shooter.cn + subhd)
- File auto-rename + classify + organize
- Smart scheduling (time-based + disk protection + retry)
- NAS archive sync (rsync)
- MCP Server for AI agent integration
- CLI mode (motrix-ai ask/add/list/pause/config)
- i18n support (Chinese + English)
- Dark/Light/System theme
- Structured error handling (AppError hierarchy)
- Structured logging (Logger with level filtering)
- Comprehensive test suite (196 tests, 51% coverage)
- CI/CD pipeline (GitHub Actions)
- Pre-commit hooks (Husky + lint-staged)

## [0.1.0] - 2026-06-13

### Added
- Initial PoC release
- Tauri 2 + Vue 3 project skeleton
- Basic aria2 integration
