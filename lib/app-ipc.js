'use strict';

const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { normalize } = require('./config');
const { resolveHermes } = require('./commands');
const { listModels, unload } = require('./providers');
const { createComparisonPlan } = require('./model-compare');
const { buildLaunchReadiness } = require('./launch-readiness');
const { TIMINGS } = require('./constants');
const { buildErrorResult, buildSuccessResult, normalizeResult } = require('./ipc-utils');

function registerIpcHandlers({ ipcMain, app, dialog, clipboard, logger, store, apiKeys, providerRegistry, processManager, providerManager, terminalPool, terminal, modelCache, comparisonQueue, updateManager, github, winRef, providerConfig, sessionServices, updater }) {
  function trusted(event) {
    const win = winRef();
    return win && event.sender === win.webContents && event.senderFrame?.url === win.webContents.getURL();
  }

  function handle(channel, action) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trusted(event)) return buildErrorResult(new Error('Недопустимый источник запроса.'), 'UNTRUSTED_SOURCE', 'Проверьте источник запроса.');
      try {
        const result = await action(...args);
        return buildSuccessResult(normalizeResult(result));
      } catch (error) {
        logger.error(`IPC ${channel}`, error);
        return buildErrorResult(error, 'IPC_ERROR', 'Проверьте введённые данные и повторите действие.');
      }
    });
  }

  const createTerminal = (id = 'default') => {
    const existing = terminalPool.get(id);
    if (existing) return existing;
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id)) throw new Error('Некорректный идентификатор терминала.');
    return terminalPool.create(id, (channel, data) => {
      const win = winRef();
      if (win && !win.isDestroyed()) win.webContents.send(`terminal:${id}:${channel.slice('terminal:'.length)}`, data);
    });
  };

  handle('config:get', () => ({ config: store.load(), version: app.getVersion(), isPackaged: Boolean(app && app.isPackaged) }));
  handle('config:save', cfg => ({ config: store.save(cfg) }));
  handle('clipboard:read', () => ({ text: clipboard.readText() }));
  handle('clipboard:write', text => {
    if (typeof text !== 'string' || text.length > 1024 * 1024) throw new Error('Некорректный текст для копирования.');
    clipboard.writeText(text);
  });
  handle('dialog:chooseFolder', async () => {
    const result = await dialog.showOpenDialog(winRef(), { properties: ['openDirectory'] });
    return { path: result.canceled ? null : result.filePaths[0] };
  });
  handle('models:list', async cfg => {
    const normalized = normalize(cfg);
    normalized.apiKey = apiKeys.get(normalized.provider);
    const key = JSON.stringify([normalized.provider, normalized.localBaseUrl, normalized.apiBaseUrl, Boolean(normalized.apiKey)]);
    const cached = modelCache.get(key);
    if (cached && Date.now() - cached.time < TIMINGS.modelCacheMs) return { models: cached.models, cached: true };
    const plugin = providerRegistry.get(normalized.provider);
    const models = plugin ? await plugin.listModels(normalized) : await listModels(normalized);
    modelCache.set(key, { time: Date.now(), models });
    return { models, cached: false };
  });
  handle('models:cacheClear', () => { modelCache.clear(); });
  handle('apiKey:status', provider => ({ saved: apiKeys.has(provider) }));
  handle('apiKey:set', (provider, key) => { apiKeys.set(provider, key); modelCache.clear(); return { saved: true }; });
  handle('apiKey:clear', provider => { apiKeys.clear(provider); modelCache.clear(); return { saved: false }; });
  handle('providers:list', () => ({ providers: providerRegistry.list() }));
  handle('start-provider', name => providerManager.start(name));
  handle('stop-provider', name => providerManager.stop(name));
  handle('get-providers-status', () => providerManager.status());
  handle('launcher:updateCheck', url => updateManager.check(app.getVersion(), url));
  handle('github:status', folder => github.status(folder));
  handle('github:list', () => github.list());

  function sendUpdateProgress(data) {
    const win = winRef();
    if (win && !win.isDestroyed()) win.webContents.send('update-progress', data);
  }

  async function withUpdateProgress(action) {
    try { return await action(sendUpdateProgress); }
    finally {
      const win = winRef();
      if (win && !win.isDestroyed()) win.webContents.send('update-done');
    }
  }

  handle('github:clone', (repo, parentFolder) => withUpdateProgress(progress => github.clone(repo, parentFolder, progress)));
  handle('github:pull', folder => withUpdateProgress(progress => github.pull(folder, progress)));
  handle('github:push', (folder, message) => withUpdateProgress(progress => github.push(folder, message, progress)));
  handle('processes:startAll', () => processManager.startAll());
  handle('processes:stopAll', () => processManager.stopAll());
  handle('processes:status', () => processManager.getStatus());
  handle('autostart:get', () => ({ enabled: Boolean(app.getLoginItemSettings().openAtLogin) }));
  handle('autostart:set', enabled => {
    if (typeof enabled !== 'boolean') throw new Error('Некорректное значение автозапуска.');
    app.setLoginItemSettings({ openAtLogin: enabled, path: process.env.PORTABLE_EXECUTABLE_FILE || process.execPath });
    return { enabled: Boolean(app.getLoginItemSettings().openAtLogin) };
  });
  handle('launcher:update', () => ({ status: 'not_implemented', message: 'Используйте штатный механизм обновления лаунчера через updater:check.' }));
  handle('updater:check', () => (updater ? updater.check() : { ok: false, disabled: true, available: false, message: 'Обновление работает только в установленной версии' }));
  handle('updater:download', () => {
    if (!updater) throw new Error('Обновление работает только в установленной версии');
    return updater.download();
  });
  handle('updater:install', () => {
    if (!updater) throw new Error('Обновление работает только в установленной версии');
    return updater.install();
  });
  handle('gpu:stats', () => new Promise(resolve => {
    execFile('nvidia-smi', ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'], { windowsHide: true }, (error, stdout) => {
      const ram = { used: Math.round((os.totalmem() - os.freemem()) / 1024 / 1024), total: Math.round(os.totalmem() / 1024 / 1024) };
      if (error) return resolve({ error: error.message, ram });
      const [used, total, util] = String(stdout).trim().split(',').map(value => value.trim());
      resolve({ used, total, util, ram });
    });
  }));
  handle('models:comparePlan', (input, models) => ({ plan: createComparisonPlan(normalize(input), models) }));
  handle('diagnostics:run', async input => {
    const cfg = normalize(input);
    const checks = [];
    const readiness = buildLaunchReadiness(cfg);
    checks.push({
      name: 'Готовность запуска',
      ok: readiness.ok,
      detail: readiness.summary
    });
    for (const item of readiness.details) checks.push({ name: 'Проверка', ok: item.ok, detail: item.text });
    try { checks.push({ name: 'Hermes', ok: true, detail: await resolveHermes(cfg) }); }
    catch (error) { checks.push({ name: 'Hermes', ok: false, detail: error.message }); }
    checks.push({ name: 'Папка проекта', ok: Boolean(cfg.projectFolder && fs.existsSync(cfg.projectFolder)), detail: cfg.projectFolder || 'Не указана' });
    if (['ollama', 'lmstudio', 'llm', 'llamacpp', 'vllm'].includes(cfg.provider)) {
      try { const models = await listModels(cfg); checks.push({ name: 'Провайдер', ok: true, detail: `Доступен, моделей: ${models.length}` }); }
      catch (error) { checks.push({ name: 'Провайдер', ok: false, detail: error.message }); }
    } else checks.push({ name: 'Провайдер', ok: true, detail: 'Проверка выполняется Hermes при запуске.' });
    return { checks };
  });
  handle('provider:unload', async provider => {
    if (['starting', 'running', 'stopping'].includes(terminal.state)) throw new Error('Сначала остановите сессию.');
    await unload(provider);
  });
  handle('sessions:list', async cfg => sessionServices.listSessions(cfg));
  handle('sessions:delete', async (input, session) => sessionServices.deleteSession(input, session, terminal.state, options => dialog.showMessageBox(winRef(), options)));

  return { createTerminal, handle };
}

module.exports = { registerIpcHandlers };
