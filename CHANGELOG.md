# Changelog

All notable changes to Hermes Launcher will be documented in this file.

## [Unreleased]

## [1.0.7] - 2026-11-03

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
- shared IPC registration `lib/shared-handlers.js` used by both `main.js` and `server.js`
- web security module `lib/web-security.js`: strict Origin validation and token brute-force rate limiting
- forced kill escalation (`SIGKILL` after 5 s) when a terminal process ignores `stop()`
- `TerminalPool.hasActive()` guard for Hermes update, provider unload, and session deletion
- `isEncrypted()` flag in API key status with a UI warning when `safeStorage` is unavailable
- `LICENSE` file (MIT)
- `npm run lint` syntax check across all project JS files
- context sync cache (`createContextSyncCache`): repeated launches with unchanged settings skip the series of `hermes config set` processes

### Changed
- refactored monolithic `renderer.js` into modular structure and concise bootstrap script
- made release flow more deterministic and easier to audit
- restricted model comparison plan to MAX_TERMINALS-1 with sequential execution
- updated `README.md` to match actual capabilities, session limits, and API keys storage
- cleaned up unused imports in `lib/app-ipc.js`
- web server binds to `127.0.0.1` by default; `HERMES_WEB_HOST` is required to expose it on the network
- web token cookie uses `HttpOnly` and `SameSite=Strict`
- `npm start` launches the Electron app; the web mode moved to `npm run start:web`
- long terminal input is chunked into 64 KB writes instead of being silently dropped
- `syncContext` writes `model.ollama_num_ctx` only for the Ollama provider
- process identity check on Windows uses PowerShell `Get-CimInstance` instead of the removed `wmic`

### Fixed
- prevented corrupt config file from overwriting working backup on `save()`
- protected API key storage from silent erasure on corrupt JSON
- fixed `github.clone()` target folder path resolution
- isolated plugin loading errors in `ProviderRegistry`
- closed log file descriptors after service process spawn
- verified process identity in `stopAll()` before termination
- removed unused files, dead lifecycle handlers, and obsolete dependencies
- Origin validation in the web server no longer accepts every origin
- Hermes update and provider unload are blocked while any terminal in the pool is active, not only the default one

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
