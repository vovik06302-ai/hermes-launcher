'use strict';
const { app, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { createConfigStore, normalize } = require('./lib/config');
const { run, resolveHermes, summarizeVersion } = require('./lib/commands');
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
const github = require('./lib/github');
let win;
let tray = null;
app.isQuitting = false;
app.on('before-quit', () => { app.isQuitting = true; });
let updating = false;
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
const providerManager = services.providerManager;
const providerRegistry = new ProviderRegistry(path.join(app.getPath('userData'), 'plugins', 'providers'));
const comparisonQueue = new TaskQueue(4);
let lastCpuUsage = process.cpuUsage();
let lastCpuTime = process.hrtime.bigint();
const page = pathToFileURL(path.join(__dirname, 'renderer', 'index.html')).href;
const hermesRuntime = createHermesRuntime({ apiKeys, logger, winRef: () => win });
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
  createTrayIcon
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
  updateManager: { check: (version, url) => services.updateLauncher(url, version) },
  github,
  winRef: () => win,
  providerConfig: require('./providers-config.json'),
  sessionServices,
  updater
});
handle('metrics:get', () => {
  const now = process.hrtime.bigint();
  const elapsed = Number(now - lastCpuTime) / 1000;
  const usage = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage(); lastCpuTime = now;
  const cpu = elapsed > 0 ? Math.min(100, ((usage.user + usage.system) / elapsed) * 100) : 0;
  return { cpu, memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024) };
});
async function start(input, sessionId, terminalId = 'default') {
  return hermesRuntime.start(input, sessionId, terminalId, () => updating);
}
handle('hermes:launch', (input, terminalId) => start(input, null, terminalId));
handle('hermes:resume', (input, id, terminalId) => start(input, id, terminalId));
handle('models:compareRun', async plan => sessionServices.runComparisonPlan(plan, comparisonQueue));
handle('models:compareQueue', () => comparisonQueue.snapshot());
handle('models:compareCancel', id => ({ canceled: comparisonQueue.cancel(id) }));
handle('hermes:version', async input => {
  const result = await run(await resolveHermes(normalize(input)), ['--version']);
  return summarizeVersion(result);
});
handle('hermes:update', async input => {
  if (updating || ['starting', 'running', 'stopping'].includes(terminal.state)) throw new Error('Сначала завершите текущую операцию.');
  updating = true;
  try {
    const result = await run(await resolveHermes(normalize(input)), ['update', '--force-venv'], 300000);
    if (!result.ok) throw new Error(result.error);
    return { output: result.output };
  } finally { updating = false; }
});
handle('terminal:state', () => ({ state: terminal.state }));
handle('terminal:sessions', () => ({ sessions: [...terminalPool.terminals].map(([id, item]) => ({ id, state: item.state, pid: item.process?.pid || null })) }));
handle('terminal:create', (_input, id) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(id)) throw new Error('Некорректный идентификатор терминала.');
  terminalFor(id);
  return { id };
});
handle('terminal:close', id => {
  if (id === 'default') throw new Error('Основной терминал закрыть нельзя.');
  return { removed: terminalPool.remove(id) };
});
handle('terminal:kill', () => terminal.stop());
ipcMain.on('terminal:input', (event, data) => { if (trusted(event)) terminal.write(data); });
ipcMain.on('terminal:resize', (event, cols, rows) => { if (trusted(event)) { try { terminal.resize(cols, rows); } catch (e) { console.error(e.message); } } });
ipcMain.on('terminal:input-for', (event, id, data) => { if (trusted(event)) terminalFor(id).write(data); });
ipcMain.on('terminal:resize-for', (event, id, cols, rows) => { if (trusted(event)) { try { terminalFor(id).resize(cols, rows); } catch (e) { logger.error(`Resize ${id}`, e); } } });
