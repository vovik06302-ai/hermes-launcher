# Changelog

All notable changes to Hermes Launcher will be documented in this file.

## [Unreleased]

### Added
- modular architecture for renderer UI in `renderer/modules/` (`state.js`, `api.js`, `notify.js`, `logic.js`, `dialogs.js`, `config-form.js`, `sessions.js`, `terminal.js`)
- map of renderer architecture and zone dependencies in `docs/RENDERER_MAP.md`
- unit tests for renderer pure logic in `tests/renderer-logic.test.js`
- release preflight and version checks for packaged builds
- beta GitHub Actions workflow for prerelease validation
- diagnostics artifact upload for CI and release pipeline
- token authentication and Origin validation for local web server (`server.js`)
- structured readiness checks in `buildLaunchReadiness` (`{ text, ok }`)
- support for plugin providers with `plugin-` prefix in `ProviderRegistry` and `providerName()`
- environment variable requirement `HERMES_LOCAL_AI_ROOT` for process manager

### Changed
- refactored monolithic `renderer.js` into modular structure and concise bootstrap script
- made release flow more deterministic and easier to audit
- restricted model comparison plan to MAX_TERMINALS-1 with sequential execution
- updated `README.md` to match actual capabilities, session limits, and API keys storage
- cleaned up unused imports in `lib/app-ipc.js`

### Fixed
- prevented corrupt config file from overwriting working backup on `save()`
- protected API key storage from silent erasure on corrupt JSON
- fixed `github.clone()` target folder path resolution
- isolated plugin loading errors in `ProviderRegistry`
- closed log file descriptors after service process spawn
- verified process identity in `stopAll()` before termination
- removed unused files, dead lifecycle handlers, and obsolete dependencies

## [1.0.3]

### Added
- auto-update support via `electron-updater` from GitHub Releases
- NSIS Windows installer configuration with per-user installation and shortcuts
- migration of user data and settings from portable directories into `userData`
- IPC channels for updater check, download, install, and download progress
- rainbow progress indicator for updater downloads

### Changed
- switched default distribution target from portable to NSIS installer
- added separate `dist:portable` npm script for portable builds

## [1.0.2]

### Added
- CI diagnostics artifact uploads
- packaged smoke checks in release workflow
- hardened config fallback logic and IPC formatting

### Fixed
- stable startup with corrupted config fallback
- session parsing and version diagnostics cleanup
- provider and terminal lifecycle stability
