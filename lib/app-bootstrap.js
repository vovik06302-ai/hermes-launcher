'use strict';

/**
 * Инициализирует запуск приложения Electron и окно.
 */
function bootstrapApp({ app, providerRegistry, logger, createWindow, createTrayIcon }) {
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
