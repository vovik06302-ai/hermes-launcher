# Changelog

All notable changes to Hermes Launcher will be documented in this file.

## [Unreleased]

## [1.0.20] - 2026-11-12

### Changed
- сжатие контекста переведено в режим `lean` (`compression.tail_mode`): при заполнении 75% окна диалог сворачивается в сводку с коротким хвостом вместо хвоста в 45% окна — меньше токенов на каждый запрос, старый чат не теряется

## [1.0.19] - 2026-11-08

### Added
- циклическая обрезка контекста, единая для всех моделей: при заполнении 75% окна начало диалога сбрасывается, дословно сохраняется хвост 45% окна (`compression.threshold` 0.75, `compression.target_ratio` 0.6, `compression.tail_mode` legacy) — каждый цикл освобождает ~30% окна

### Changed
- «Сравнение моделей» переименовано в «Параллельный запуск»: запускается N сессий одновременно с ручным подтверждением действий, сводка ответов не формируется

### Fixed
- удалён мёртвый путь обновления через кастомный манифест `metadata.json` (вызов `launcher:updateCheck` без явного URL всегда падал: в манифесте нет полей version/url); оставлен единственный механизм — electron-updater через GitHub Releases, `compareVersions` перенесён в `lib/version.js`
- первое «Запустить всё» больше не подвешивает окно: проба интерпретатора (`import torch`) переведена с синхронного `execFileSync` на асинхронный `execFile` с кэшированием результата

## [1.0.18] - 2026-11-04

### Fixed
- установщик больше не прерывается и не показывает диалог, если старый деинсталлятор не смог удалить файлы (заняты антивирусом/проводником): добавлены хуки customUnInstallCheck — установка продолжается и перезаписывает файлы поверх

## [1.0.17] - 2026-11-04

### Fixed
- обновление устанавливается тихо (`quitAndInstall(true, true)`): мастер установщика больше не показывается, а блокирующие диалоги electron-builder («Не удалось закрыть Hermes Launcher» при занятых файлах или сбое удаления старой версии) получают безопасный ответ по умолчанию — установка проходит без единого окна и перезапускает приложение

## [1.0.16] - 2026-11-04

### Fixed
- обновление больше не останавливается диалогом «Не удалось закрыть Hermes Launcher»: при установке обновления приложение принудительно завершает фоновые процессы Hermes Agent (gateway `hermes_cli` / `openclaw`), выставляет флаг выхода (окно не сворачивается в трей вместо завершения) и имеет страховочный `app.exit(0)`, если штатный выход зависнет
- при любом выходе из приложения фоновые процессы агента теперь завершаются вместе с ним (обработчик `before-quit`)
- установщик (и при ручном запуске setup) завершает лаунчер со всеми дочерними процессами (`taskkill /F /T`) и фоновые процессы агента по строгому фильтру (путь `*\hermes\*` или `hermes_cli`/`openclaw` в командной строке) — чужие python.exe/node.exe пользователя не затрагиваются

## [1.0.15] - 2026-11-03

### Fixed
- кнопка с бегущей строкой обновления ограничена по ширине (260px) и больше не раздвигает шапку приложения

## [1.0.14] - 2026-11-03

### Fixed
- установщик принудительно завершает работающее приложение через хук `customCheckAppRunning` (вместо диалога «Не удалось закрыть»), с проверкой исчезновения процесса до трёх попыток

## [1.0.13] - 2026-11-03

### Fixed
- установщик автоматически завершает работающий экземпляр приложения (включая свёрнутый в трей) перед копированием файлов — обновление больше не останавливается диалогом «Не удалось закрыть Hermes Launcher»

## [1.0.12] - 2026-11-03

### Added
- кнопка обновления во время загрузки заполняется цветным градиентом пропорционально проценту скачивания, с текстом «Загрузка… N%» прямо в кнопке

## [1.0.11] - 2026-11-03

### Added
- бегущая строка «Доступно обновление vX.Y.Z» прямо в кнопке обновления, когда найдена новая версия (в том числе при автопроверке на старте)
- режим единственного экземпляра: повторный запуск открывает существующее окно вместо нового процесса с лишней иконкой в трее

## [1.0.10] - 2026-11-03

### Changed
- GitHub-релиз публикуется сразу, без черновика (`releaseType: release` в конфигурации electron-builder)

## [1.0.9] - 2026-11-03

### Fixed
- release workflow no longer fails on `WIN_CSC_LINK` resolution: empty certificate variables are removed from the environment before the unsigned NSIS build (an empty string is treated as a path by electron-builder)
- исправлена версия пакета для релизного пайплайна: тег `v1.0.9` теперь совпадает с `package.json`

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
