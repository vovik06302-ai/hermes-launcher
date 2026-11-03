'use strict';

/**
 * Инициализирует запуск приложения Electron и окно.
 * Второй экземпляр приложения не создаётся: вместо нового окна
 * показывается и активируется уже существующее.
 */
function bootstrapApp({ app, providerRegistry, logger, createWindow, createTrayIcon, focusWindow }) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    if (typeof focusWindow === 'function') focusWindow();
  });

  app.whenReady().then(async () => {
    try {
      if (providerRegistry && typeof providerRegistry.loadAll === 'function') {
        await providerRegistry.loadAll();
      }
    } catch (err) {
      if (logger) logger.error('Ошибка загрузки плагинов провайдеров', err);
    }
    createWindow();
    createTrayIcon();
  });

  app.on('activate', () => {
    if (typeof createWindow === 'function') {
      createWindow();
    }
  });
}

module.exports = { bootstrapApp };
