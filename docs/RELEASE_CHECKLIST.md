# Release checklist

## Перед выпуском

1. Обновить версию в `package.json` до желаемого значения `x.y.z`.
2. Убедиться, что Git tag для релиза совпадает с версией: `vX.Y.Z`.
3. Запустить предварительную проверку релиза:

```powershell
npm run release:check
```

4. Запустить полный набор проверок:

```powershell
npm run quality
```

5. Сформировать директориальную сборку:

```powershell
npm run dist:dir
```

6. Запустить packaged smoke test:

```powershell
npm run test:packaged
```

7. Проверить наличие артефактов в `dist/` и логов в `electron_log.txt` и `.hermes-state.json`.

## Перед публикацией GitHub Release

1. Убедиться, что `release.yml` выполняется на теге `v*`.
2. Подтвердить, что `WINDOWS_CERTIFICATE_BASE64` и `WINDOWS_CERTIFICATE_PASSWORD` добавлены в GitHub Secrets.
3. Выполнить подписанную portable-сборку через `npm run dist`.
4. Проверить, что `.exe` присутствует в `dist/*.exe` и корректно загружен в release.
5. Сохранить диагностические артефакты из workflow для последующего анализа ошибок.

## Что обязательно проверить после релиза

- запуск `Hermes Launcher` с локальным Hermes CLI;
- отображение версии и диагностик;
- интерактивный PTY терминал;
- корректная работа сохранённых профилей и сессий;
- отсутствие ошибок в логах запуска и сборки.
