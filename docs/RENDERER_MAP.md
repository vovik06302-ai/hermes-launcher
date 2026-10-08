# Карта модулей renderer.js (RENDERER_MAP.md)

Документ содержит полную карту функций, переменных состояния, элементов DOM, IPC-вызовов и связей между подсистемами `renderer/renderer.js`.

---

## 1. Глобальные переменные состояния

| Переменная | Описание | Зона | Использование |
|---|---|---|---|
| `el` | Функция-хелпер `id => document.getElementById(id)` | Прочее | Используется во всех функциях для доступа к DOM |
| `cfg` | Текущий объект конфигурации приложения | Форма и конфиг | Читается и обновляется почти во всех зонах |
| `displayedProvider` | Имя провайдера, для которого сейчас заполнены поля формы | Форма и конфиг | Читается при смене провайдера в UI |
| `sessions` | Массив загруженных сессий Hermes | Сессии | Читается при поиске, фильтрации и экспорте сессий |
| `sessionsVisibleCount` | Количество отображаемых сессий (пагинация по 100) | Сессии | Изменяется при клике «Показать ещё» и сбросе поиска |
| `selectedId` | ID выбранной пользователем сессии в списке | Сессии | Читается кнопками «Продолжить» и «Удалить» |
| `processState` | Состояние терминала ('idle', 'starting', 'running', 'stopping', 'error') | Метрики и статус / Терминал | Читается `updateControls()` и подписками терминала |
| `busy` | Флаг блокировки UI во время выполнения асинхронных операций | Метрики и статус | Читается `updateControls()` и `perform()` |
| `modelsRequest` | Счетчик запросов списка моделей (защита от race condition) | Провайдеры и процессы | Увеличивается при каждом запросе моделей |
| `sessionsRequest` | Счетчик запросов списка сессий (защита от race condition) | Сессии | Увеличивается при каждом запросе сессий |
| `terminalWriteQueue` | Очередь символов для групповой записи в xterm | Терминал | Заполняется подпиской `onTerminalData` |
| `terminalFlushTimer` | Таймер сброса очереди записи в xterm (16 мс / ~60fps) | Терминал | Флаг активности таймера сброса |
| `lastLaunchConfig` | Копия конфигурации последнего запуска для кнопки «Повторить» | Терминал / Форма и конфиг | Записывается при `launch()`, читается при `retry` |
| `recoveryTimer` | Таймер автовосстановления после сбоя процесса | Терминал | Запускается при ошибке завершения терминала |
| `recoveryAttempted` | Флаг, предотвращающий бесконечный цикл автовосстановления | Терминал | Сбрасывается при новом ручном запуске |
| `metricsTimer` | Таймер интервального опроса системных ресурсов (CPU, RAM) | Метрики и статус | Активен во время работы сессии |
| `sessionStartedAt` | Timestamp (мс) начала текущей сессии для отсчета времени | Метрики и статус | Записывается при переходе терминала в 'running' |
| `gpuTimer` | Таймер интервального опроса VRAM/GPU/RAM | Метрики и статус | Запускается при старте приложения (интервал 3с) |
| `terminalTabs` | Список активных вкладок терминала `[{ id, state, pid }]` | Терминал | Управляет вкладками верхнего бара терминала |
| `activeTerminalId` | ID текущей выбранной вкладки терминала (по умолчанию 'default') | Терминал | Определяет активный xterm и маршрутизацию PTY |
| `commands` | Список команд для модальной палитры команд (`Ctrl+K`) | Диалоги и палитра | Используется для поиска и выполнения команд |
| `searchTimer` | Таймер дебаунса ввода в поле поиска сессий | Сессии | Задержка 180 мс перед перерисовкой списка |
| `saveTimer` | Таймер автосохранения формы настроек | Форма и конфиг | Задержка 900 мс перед вызовом `save()` |
| `UI_TIMINGS` | Замороженный объект констант задержек (`autoSaveMs`, `searchDebounceMs`) | Прочее | Читается таймерами сохранения и поиска |
| `uiThemes` | Словарь 8 цветных тем с палитрами для UI и xterm | Темы | Читается при вызове `applyTheme()` |
| `states` | Текстовые локализованные статусы состояний процесса | Метрики и статус | Читается `updateControls()` для статусов |
| `term` | Главный инстанс xterm.js для вкладки 'default' | Терминал | Читается и используется для вывода PTY |
| `terminalInstances` | Map инстансов xterm.js по ID вкладок | Терминал | Хранит инстансы всех созданных терминалов |

---

## 2. Карта функций

| Функция | Зона | Описание | DOM ID / Селекторы | Вызовы window.api.* | Состояние (Read/Write) |
|---|---|---|---|---|---|
| `log(message, error)` | Метрики и статус | Добавляет строку с временем в лог-бокс | `#logBox` | Нет | Read: none / Write: none |
| `checked(result)` | Прочее | Проверяет `{ok:true}`, иначе выбрасывает Error | Нет | Нет | Read: none / Write: none |
| `active()` | Метрики и статус | Проверяет, активен ли процесс (starting/running/stopping) | Нет | Нет | Read: `processState` |
| `applyTheme(id)` | Темы | Применяет тему к HTML, xterm и кнопке | `#themeBtn`, `#themePicker`, `.theme-swatch` | Нет | Read: `uiThemes`, `term` |
| `closeThemePicker()` | Темы | Закрывает выпадающее меню тем | `#themePicker`, `#themeBtn` | Нет | Read: none / Write: none |
| `closeCommandPalette()` | Диалоги | Скрывает палитру команд | `#commandPalette` | Нет | Read: none / Write: none |
| `askText(options)` | Диалоги | Модальный диалог ввода текста (замена `prompt`) | `#promptDialog`, `#promptForm`, `#promptInput`, `#promptTitle`, `#promptCancelBtn` | Нет | Read: none / Write: none |
| `openCommandPalette()` | Диалоги | Открывает палитру команд и фокусирует поиск | `#commandPalette`, `#commandSearch` | Нет | Read: none / Write: none |
| `renderCommands()` | Диалоги | Отрисовывает отфильтрованный список команд | `#commandSearch`, `#commandList` | Нет | Read: `commands` |
| `setRuntimeStatus(text, state)`| Метрики и статус | Обновляет текст и индикатор состояния плашки | `#runtimeStatusBanner`, `#runtimeStatusText` | Нет | Read: none / Write: none |
| `refreshLaunchReadiness()` | Метрики и статус | Запрашивает диагностику готовности к запуску | Нет | `runDiagnostics` | Read: `cfg` |
| `updateControls()` | Метрики и статус | Обновляет состояния доступности кнопок и тексты | `#configuration`, `#launchBtn`, `#retryBtn`, `#killTermBtn`, `#resumeBtn`, `#deleteSessionBtn`, `#statusText`, `#currentModel`, `#currentProvider`, `#unloadBtn`, `#refreshModelsBtn`, `#progressPanel`, `#progressTitle`, `#progressDetail`, `#model`, `#provider` | Нет | Read: `processState`, `busy`, `cfg`, `lastLaunchConfig`, `selectedId` |
| `renderTerminalTabs()` | Терминал | Отрисовывает вкладки терминалов | `#terminalTabs` | Нет | Read: `terminalTabs`, `activeTerminalId` |
| `readForm()` | Форма и конфиг | Собирает объект конфигурации из полей формы | `#provider`, `#systemPrompt`, `#hermesPath`, `#lmstudioProvider`, `#localProvider`, `#localBaseUrl`, `#apiBaseUrl`, `#projectPath`, `#model`, `#maxTokens`, `#contextLength`, `#autoApprove`, `#disableUpdateCheck` | Нет | Read: `cfg` |
| `projectOptions()` | Профили проектов | Обновляет выпадающий список сохраненных проектов | `#projectSelect` | Нет | Read: `cfg` |
| `modelProfileOptions()` | Форма и конфиг | Обновляет выпадающий список профилей моделей | `#modelProfilePicker` | Нет | Read: `cfg` |
| `fillForm()` | Форма и конфиг | Заполняет все поля формы значениями из `cfg` | Поля формы, `#projectPath`, `#autoApprove`, `#disableUpdateCheck` | Нет | Read: `cfg` / Write: `displayedProvider` |
| `refreshProviders()` | Провайдеры и процессы | Загружает список провайдеров и добавляет в select | `#provider` | `listProviders` | Read: none / Write: none |
| `save()` | Форма и конфиг | Сохраняет текущую конфигурацию из формы | `#projectSelect` | `saveConfig` | Read: `cfg` / Write: `cfg` |
| `scheduleSave()` | Форма и конфиг | Запускает таймер автосохранения настроек | Нет | Нет | Read: `busy`, `cfg` / Write: `saveTimer` |
| `refreshModels()` | Провайдеры и процессы | Запрашивает список моделей для провайдера | `#modelPicker`, `#modelHint`, `#model`, `#provider` | `listModels` | Read: `modelsRequest`, `cfg` / Write: `modelsRequest`, `cfg.providerModels` |
| `refreshApiKeyStatus()` | Провайдеры и процессы | Проверяет статус сохраненности API-ключа | `#apiKey`, `#pasteApiKeyBtn`, `#saveApiKeyBtn`, `#clearApiKeyBtn`, `#apiBaseUrl`, `#apiKeyStatus`, `#provider` | `apiKeyStatus` | Read: none / Write: none |
| `renderSessions()` | Сессии | Фильтрует, сортирует и отрисовывает сессии | `#sessionSearch`, `#sessionSort`, `#sessionsList`, `#loadMoreSessionsBtn` | Нет | Read: `sessions`, `sessionsVisibleCount`, `selectedId` / Write: `selectedId` |
| `refreshSessions()` | Сессии | Загружает актуальный список сессий с сервера | `#refreshSessionsBtn`, `#sessionsList` | `listSessions` | Read: `sessionsRequest` / Write: `sessionsRequest`, `sessions`, `sessionsVisibleCount`, `selectedId` |
| `perform(action)` | Прочее | Обертка вызова действия с флагом `busy` | Нет | Нет | Read: `busy` / Write: `busy` |
| `activeTerm()` | Терминал | Возвращает активный инстанс xterm.js | Нет | Нет | Read: `terminalInstances`, `activeTerminalId`, `term` |
| `bindTerminal(id, instance, container)` | Терминал | Подключает горячие клавиши, контекстное меню и PTY | DOM контейнер | `writeClipboard`, `readClipboard`, `sendTerminalData`, `sendTerminalDataFor`, `onTerminalDataFor` | Read: none / Write: none |
| `fitTerminal()` | Терминал | Подгоняет размер xterm под размеры DOM | `#terminal` | `resizeTerminal`, `resizeTerminalFor` | Read: `activeTerminalId` |
| `createTerminalView(id)` | Терминал | Создает DOM и xterm инстанс для новой вкладки | `#terminal` | Нет | Read: `activeTerminalId`, `term` / Write: `terminalInstances` |
| `showTerminalView(id)` | Терминал | Переключает видимый терминал | `#terminal` | Нет | Read: `terminalInstances` / Write: `activeTerminalId` |
| `stopMetrics()` | Метрики и статус | Останавливает опрос ресурсов | `#metricsLine` | Нет | Read: `metricsTimer` / Write: `metricsTimer` |
| `updateMetrics()` | Метрики и статус | Запрашивает и выводит CPU/RAM | `#metricsLine` | `getMetrics` | Read: `sessionStartedAt` |
| `startMetrics()` | Метрики и статус | Запускает интервал сбора ресурсов | Нет | Нет | Write: `metricsTimer` |
| `launch(id)` | Терминал / Сессии | Запускает или возобновляет сессию Hermes | Нет | `resumeSession`, `launchHermes` | Read: `cfg`, `activeTerminalId` / Write: `lastLaunchConfig`, `recoveryAttempted` |
| `refreshProcessStatus()` | Провайдеры и процессы | Обновляет статус фоновых сервисов | `#processStatus` | `processesStatus` | Read: none / Write: none |
| `refreshProvidersStatus()` | Провайдеры и процессы | Обновляет статус портов провайдеров | `.provider-row`, `.provider-status`, `#providers-panel-status` | `window.providersAPI.status` | Read: none / Write: none |
| `controlProvider(row, action)` | Провайдеры и процессы | Запускает/останавливает локальный провайдер | `.provider-row`, `.provider-feedback` | `window.providersAPI[action]` | Read: none / Write: none |
| `refreshGpuStats()` | Метрики и статус | Запрашивает VRAM/GPU/RAM | `#gpu-status` | `getGpuStats` | Read: none / Write: none |
| `refreshGitHubRepos()` | GitHub | Загружает список репозиториев GitHub | `#githubRepoPicker`, `#githubStatus` | `githubList` | Read: none / Write: none |
| `refreshGitHubStatus()` | GitHub | Проверяет Git status для папки проекта | `#projectPath`, `#githubStatus` | `githubStatus` | Read: none / Write: none |
| `showVersion(version)` | Обновления / Статус | Выводит номер версии и результат диагностики | `#updateStatus`, `#versionDiagnostic`, `#versionDetails` | Нет | Read: none / Write: none |
| `init()` | Прочее (Bootstrap) | Инициализирует все подсистемы при старте | Различные | `getConfig`, `terminalState`, `terminalSessions`, `getAutostart`, `getHermesVersion` | Read/Write: `cfg`, `processState`, `terminalTabs`, `gpuTimer` |

---

## 3. Зависимости между зонами (Кто кого вызывает)

```
[Bootstrap: init()]
  ├──> [Провайдеры и процессы]: refreshProviders(), refreshProcessStatus(), refreshProvidersStatus()
  ├──> [Форма и конфиг]: getConfig, fillForm(), scheduleSave(), save()
  ├──> [Терминал]: terminalState, terminalSessions, renderTerminalTabs(), fitTerminal()
  ├──> [Метрики и статус]: refreshGpuStats(), startMetrics(), setRuntimeStatus()
  ├──> [Сессии]: refreshSessions()
  └──> [Обновления]: getHermesVersion(), showVersion()

[Терминал: launch() / kill / retry / tabs]
  ├──> Вызывает [Форма и конфиг]: save(), readForm()
  ├──> Вызывает [Метрики и статус]: startMetrics(), stopMetrics(), setRuntimeStatus(), log()
  └──> Вызывает [Сессии]: refreshSessions()

[Форма и конфиг: изменения полей / сохранение]
  ├──> Вызывает [Провайдеры и процессы]: refreshModels(), refreshApiKeyStatus()
  ├──> Вызывает [Метрики и статус]: refreshLaunchReadiness()
  └──> Вызывает [Темы]: applyTheme()

[Профили проектов: выбор проекта]
  ├──> Вызывает [Форма и конфиг]: fillForm(), save()
  └──> Вызывает [Провайдеры и процессы]: refreshModels()

[Сессии: выбор / продолжение / удаление]
  ├──> Вызывает [Терминал]: launch(id)
  └──> Вызывает [Метрики и статус]: updateControls()
```

---

## 4. Дублирование и мертвый код

1. **Дублирование привязки обработчиков xterm для главный терминала 'default'**:
   - Функция `bindTerminal('default', term, el('terminal'))` навешивает обработчики `attachCustomKeyEventHandler` и `contextmenu`.
   - Сразу после этого в строках 320–339 дублируются вызовы `term.attachCustomKeyEventHandler` и `el('terminal').addEventListener('contextmenu', ...)`.
2. **Двойная подписка на `window.api.onTerminalData`**:
   - В строках 359–368 подписка записывает данные в очередь терминала.
   - В строках 369–377 подписка сканирует данные на опасные команды и предупреждения о лимите контекста. Их следует объединить в один модуль терминала.
3. **Отсутствие отписки от PTY-событий при закрытии/удалении вкладок**:
   - При создании терминалов через `window.api.onTerminalDataFor(id)` не сохраняются функции отписки (`unsubscribe`), что при многократном пересоздании приводит к утечкам памяти и дублированию вывода.
4. **Дублирование обновлений текстов статуса в `updateControls`**:
   - Установка `states[processState]` выполняется одновременно в `#statusText` и `#progressTitle`.
