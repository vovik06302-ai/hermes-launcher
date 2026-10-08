'use strict';

const { compareVersions } = require('./launcher-update');

/**
 * Преобразует сетевые ошибки и лимиты GitHub в понятные сообщения на русском языке.
 */
function formatUpdaterError(error) {
  const message = error?.message || String(error || '');
  if (/rate limit/i.test(message) || /API rate limit/i.test(message) || /403/i.test(message)) {
    return 'Превышен лимит запросов к GitHub API. Попробуйте позже.';
  }
  if (/ENOTFOUND|ETIMEDOUT|ECONNREFUSED|ERR_INTERNET_DISCONNECTED|net::ERR|offline/i.test(message)) {
    return 'Ошибка сети: нет подключения к интернету или сервер GitHub недоступен.';
  }
  if (/404|not found/i.test(message)) {
    return 'Релизы обновлений не найдены в репозитории GitHub.';
  }
  return `Ошибка при проверке обновления: ${message}`;
}

/**
 * Создаёт менеджер автообновления для Electron через electron-updater.
 */
function createUpdater({ app, processManager, logger, winRef, publishConfig }) {
  let autoUpdater = null;
  let downloadedVersion = null;

  function isEnabled() {
    return Boolean(app && app.isPackaged);
  }

  function getAutoUpdater() {
    if (!isEnabled()) return null;
    if (!autoUpdater) {
      try {
        const updaterModule = require('electron-updater');
        autoUpdater = updaterModule.autoUpdater;
        autoUpdater.autoDownload = false;
        autoUpdater.autoInstallOnAppQuit = false;

        if (publishConfig) {
          autoUpdater.setFeedURL(publishConfig);
        }

        autoUpdater.on('download-progress', progressObj => {
          const percent = Math.round(progressObj.percent || 0);
          const win = typeof winRef === 'function' ? winRef() : null;
          if (win && !win.isDestroyed()) {
            win.webContents.send('updater:progress', {
              stage: 'downloading',
              percent,
              bytesPerSecond: progressObj.bytesPerSecond,
              transferred: progressObj.transferred,
              total: progressObj.total
            });
          }
        });

        autoUpdater.on('update-downloaded', info => {
          downloadedVersion = info.version;
          const win = typeof winRef === 'function' ? winRef() : null;
          if (win && !win.isDestroyed()) {
            win.webContents.send('updater:progress', {
              stage: 'downloaded',
              percent: 100,
              downloaded: true,
              version: info.version
            });
          }
        });

        autoUpdater.on('error', err => {
          if (logger && typeof logger.error === 'function') {
            logger.error('electron-updater error', err);
          }
        });
      } catch (err) {
        if (logger && typeof logger.warn === 'function') {
          logger.warn('Не удалось загрузить модуль electron-updater', err);
        }
      }
    }
    return autoUpdater;
  }

  async function check() {
    if (!isEnabled()) {
      return {
        ok: false,
        disabled: true,
        available: false,
        currentVersion: app?.getVersion ? app.getVersion() : '1.0.3',
        message: 'Обновление работает только в установленной версии'
      };
    }

    const updater = getAutoUpdater();
    if (!updater) {
      return {
        ok: false,
        disabled: true,
        available: false,
        message: 'Обновление работает только в установленной версии'
      };
    }

    try {
      const result = await updater.checkForUpdates();
      if (!result || !result.updateInfo) {
        return {
          ok: true,
          available: false,
          currentVersion: app.getVersion(),
          message: 'Установлена последняя версия'
        };
      }

      const latestVersion = result.updateInfo.version;
      const currentVersion = app.getVersion();
      const isNewer = compareVersions(latestVersion, currentVersion) > 0;

      if (isNewer) {
        return {
          ok: true,
          available: true,
          version: latestVersion,
          currentVersion,
          message: `Есть обновление ${latestVersion}`
        };
      }

      return {
        ok: true,
        available: false,
        currentVersion,
        message: 'Установлена последняя версия'
      };
    } catch (err) {
      if (logger && typeof logger.error === 'function') {
        logger.error('Ошибка проверки обновлений', err);
      }
      return {
        ok: false,
        available: false,
        error: formatUpdaterError(err),
        message: formatUpdaterError(err)
      };
    }
  }

  async function download() {
    if (!isEnabled()) {
      throw new Error('Обновление работает только в установленной версии');
    }
    const updater = getAutoUpdater();
    if (!updater) throw new Error('Модуль обновления недоступен.');

    try {
      await updater.downloadUpdate();
      return { ok: true, message: 'Обновление успешно загружено' };
    } catch (err) {
      if (logger && typeof logger.error === 'function') {
        logger.error('Ошибка загрузки обновления', err);
      }
      throw new Error(formatUpdaterError(err));
    }
  }

  async function install() {
    if (!isEnabled()) {
      throw new Error('Обновление работает только в установленной версии');
    }
    const updater = getAutoUpdater();
    if (!updater) throw new Error('Модуль обновления недоступен.');

    try {
      // Корректно останавливаем все процессы провайдеров перед установкой
      if (processManager && typeof processManager.stopAll === 'function') {
        if (logger && typeof logger.info === 'function') {
          logger.info('Остановка процессов провайдеров перед вызовом quitAndInstall');
        }
        await processManager.stopAll();
      }

      updater.quitAndInstall(false, true);
      return { ok: true };
    } catch (err) {
      if (logger && typeof logger.error === 'function') {
        logger.error('Ошибка установки обновления', err);
      }
      throw new Error(`Ошибка при установке обновления: ${err.message}`);
    }
  }

  return {
    check,
    download,
    install,
    isEnabled,
    getDownloadedVersion: () => downloadedVersion
  };
}

module.exports = { createUpdater, formatUpdaterError, compareVersions };
