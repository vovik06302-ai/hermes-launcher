'use strict';
const { app, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { createConfigStore, normalize } = require('./lib/config');
const { run, resolveHermes, createContextSyncCache } = require('./lib/commands');
const { createLogger } = require('./lib/logger');
const { ProviderRegistry } = require('./lib/provider-registry');
const { TaskQueue } = require('./lib/task-queue');
const { createApiKeyStore } = require('./lib/api-keys');
const { createProcessManager } = require('./lib/process-manager');
const { createMainWindow, createTray } = require('./lib/app-shell');
const { ensureAppLifecycle } = require('./lib/app-lifecycle');
const { bootstrapApp } = require('./lib/app-bootstrap');
const { registerIpcHandlers } = require('./lib/app-ipc');
const { createHermesRuntime } = require('./lib/hermes-runtime');
const { createAppServices } = require('./lib/services');
const { createSessionServices } = require('./lib/session-services');
const { migratePortableData } = require('./lib/data-migration');
const { createUpdater } = require('./lib/updater');
const { registerSharedHandlers } = require('./lib/shared-handlers');
const github = require('./lib/github');
let win;
let tray = null;
const userDataDir = app.getPath('userData');
const logger = createLogger(userDataDir);
migratePortableData(userDataDir, logger);
const store = createConfigStore(userDataDir);
const apiKeys = createApiKeyStore(userDataDir);
const processStateFile = path.join(userDataDir, '.hermes-state.json');
const processManager = createProcessManager(processStateFile);
const publishConfig = {
  provider: 'github',
  owner: 'vovik06302-ai',
  repo: 'hermes-launcher'
};
const updater = createUpdater({ app, processManager, logger, winRef: () => win, publishConfig });
const services = createAppServices({ app, providerConfig: require('./providers-config.json'), processStateFile, logger });
// Единый источник состояния quit/update: флаги живут в services.appState,
// а app.isQuitting — геттер поверх него, чтобы значения не могли разъехаться.
Object.defineProperty(app, 'isQuitting', {
  get: () => services.appState.isQuitting,
  set: value => { services.appState.isQuitting = Boolean(value); },
  configurable: true
});
app.on('before-quit', () => { services.appState.isQuitting = true; });
const providerManager = services.providerManager;
const providerRegistry = new ProviderRegistry(path.join(app.getPath('userData'), 'plugins', 'providers'));
const comparisonQueue = new TaskQueue(4);
// updating — единственный мутатор: services.appState.updating (см. hermes:update в shared-handlers)
const page = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;
const hermesRuntime = createHermesRuntime({ apiKeys, logger, winRef: () => win, syncCache: createContextSyncCache(path.join(userDataDir, '.context-sync.json')) });
const { terminal, terminalPool, terminalFor } = hermesRuntime;
const sessionServices = createSessionServices({
  startHermes: (input, id, terminalId) => start(input, id, terminalId),
  runHermesCommand: (file, args, timeout) => run(file, args, timeout),
  resolveHermes,
  normalize,
  logger
});
const modelCache = new Map();
function trusted(event) { return win && event.sender === win.webContents && event.senderFrame?.url === page; }
function createWindow() {
  win = createMainWindow({
    page,
    iconPath: path.join(__dirname, 'hermes.ico'),
    onClose: event => {
      if (!app.isQuitting) {
        event.preventDefault();
        win.hide();
      }
    }
  });
  global.__hermesWin = win;
}
function createTrayIcon() {
  tray = createTray({
    iconPath: path.join(__dirname, 'hermes.ico'),
    onOpen: () => { win.show(); win.focus(); },
    onStartAll: () => processManager.startAll().catch(error => logger.error('Запуск сервисов из трея', error)),
    onStopAll: () => processManager.stopAll().catch(error => logger.error('Остановка сервисов из трея', error)),
    onQuit: () => { app.isQuitting = true; app.quit(); }
  });
}
ensureAppLifecycle(app, hermesRuntime, logger, processManager);
bootstrapApp({
  app,
  providerRegistry,
  logger,
  createWindow,
  createTrayIcon,
  focusWindow: () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

const { handle } = registerIpcHandlers({
  ipcMain,
  app,
  dialog,
  clipboard,
  logger,
  store,
  apiKeys,
  providerRegistry,
  processManager,
  providerManager,
  terminalPool,
  terminal,
  modelCache,
  comparisonQueue,
  github,
  winRef: () => win,
  providerConfig: require('./providers-config.json'),
  sessionServices,
  updater
});
async function start(input, sessionId, terminalId = 'default') {
  return hermesRuntime.start(input, sessionId, terminalId, () => services.appState.updating);
}
registerSharedHandlers({
  handle,
  terminal,
  terminalPool,
  terminalFor,
  comparisonQueue,
  sessionServices,
  startHermes: (input, id, terminalId) => start(input, id, terminalId),
  appState: services.appState
});
ipcMain.on('terminal:input', (event, data) => { if (trusted(event)) terminal.write(data); });
ipcMain.on('terminal:resize', (event, cols, rows) => { if (trusted(event)) { try { terminal.resize(cols, rows); } catch (e) { console.error(e.message); } } });
ipcMain.on('terminal:input-for', (event, id, data) => { if (trusted(event)) terminalFor(id).write(data); });
ipcMain.on('terminal:resize-for', (event, id, cols, rows) => { if (trusted(event)) { try { terminalFor(id).resize(cols, rows); } catch (e) { logger.error(`Resize ${id}`, e); } } });
