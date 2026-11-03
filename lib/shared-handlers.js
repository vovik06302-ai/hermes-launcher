'use strict';

const { run, resolveHermes, summarizeVersion } = require('./commands');
const { normalize } = require('./config');

// Общие IPC-хендлеры для Electron (main.js) и веб-режима (server.js):
// регистрация идёт через переданный handle, чтобы наборы каналов не расходились.
function registerSharedHandlers({ handle, terminal, terminalPool, terminalFor, comparisonQueue, sessionServices, startHermes, appState }) {
  let lastCpuUsage = process.cpuUsage();
  let lastCpuTime = process.hrtime.bigint();

  handle('metrics:get', () => {
    const now = process.hrtime.bigint();
    const elapsed = Number(now - lastCpuTime) / 1000;
    const usage = process.cpuUsage(lastCpuUsage);
    lastCpuUsage = process.cpuUsage();
    lastCpuTime = now;
    const cpu = elapsed > 0 ? Math.min(100, ((usage.user + usage.system) / elapsed) * 100) : 0;
    return { cpu, memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024) };
  });

  handle('hermes:launch', (input, terminalId) => startHermes(input, null, terminalId));
  handle('hermes:resume', (input, id, terminalId) => startHermes(input, id, terminalId));
  handle('models:compareRun', async plan => sessionServices.runComparisonPlan(plan, comparisonQueue));
  handle('models:compareQueue', () => comparisonQueue.snapshot());
  handle('models:compareCancel', id => ({ canceled: comparisonQueue.cancel(id) }));

  handle('hermes:version', async input => {
    const result = await run(await resolveHermes(normalize(input)), ['--version']);
    return summarizeVersion(result);
  });

  handle('hermes:update', async input => {
    // Обновление меняет установленный Hermes, поэтому недопустимо,
    // пока работает хотя бы один терминал из пула, а не только основной.
    if (appState.updating || terminalPool.hasActive()) throw new Error('Сначала завершите текущую операцию.');
    appState.updating = true;
    try {
      const result = await run(await resolveHermes(normalize(input)), ['update', '--force-venv'], 300000);
      if (!result.ok) throw new Error(result.error);
      return { output: result.output };
    } finally { appState.updating = false; }
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
}

module.exports = { registerSharedHandlers };
