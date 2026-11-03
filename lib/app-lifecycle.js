'use strict';

const fs = require('fs');
const path = require('path');
const { killHermesBackgroundSync } = require('./hermes-killer');

function resolveStateFile(app) {
  return app.isPackaged
    ? path.join(app.getPath('userData'), '.hermes-state.json')
    : path.join(process.cwd(), '.hermes-state.json');
}

function ensureAppLifecycle(app, runtime, logger, processManager) {
  const terminal = runtime && runtime.terminal;
  const terminalPool = runtime && runtime.terminalPool;

  function beforeQuit() {
    try {
      // Гасим все PTY пула, иначе параллельные сессии остаются висеть после выхода.
      if (terminalPool) terminalPool.stopAll();
      else if (terminal && terminal.process) terminal.stop();
    } catch (error) {
      logger.error('Завершение PTY', error);
    }
    // Фоновые процессы агента (gateway hermes_cli/openclaw) живут отдельно от PTY
    // и переживают выход лаунчера — завершаем их при любом выходе из приложения.
    try {
      killHermesBackgroundSync();
    } catch (error) {
      logger.error('Завершение фоновых процессов Hermes Agent', error);
    }
  }

  app.on('before-quit', beforeQuit);

  return {
    resolveStateFile: () => resolveStateFile(app),
    onBeforeQuit: beforeQuit
  };
}

module.exports = { resolveStateFile, ensureAppLifecycle };
