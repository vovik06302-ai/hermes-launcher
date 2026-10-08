'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Миграция пользовательских данных из директории портативной версии
 * в постоянную директорию userData.
 */
function migratePortableData(userDataDir, logger = console) {
  if (!userDataDir || typeof userDataDir !== 'string') return;

  try {
    const markerFile = path.join(userDataDir, '.portable-migrated');
    if (fs.existsSync(markerFile)) return;

    fs.mkdirSync(userDataDir, { recursive: true });

    const candidateDirs = [];
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      candidateDirs.push(process.env.PORTABLE_EXECUTABLE_DIR);
    }
    if (process.execPath) {
      const execDir = path.dirname(process.execPath);
      if (!candidateDirs.includes(execDir)) {
        candidateDirs.push(execDir);
      }
    }

    const itemsToCopy = [
      'config.json',
      'config.json.bak',
      'api-keys.json',
      '.hermes-state.json',
      'hermes-launcher.log'
    ];

    let migratedAny = false;

    for (const sourceDir of candidateDirs) {
      if (!sourceDir || path.resolve(sourceDir) === path.resolve(userDataDir)) continue;
      try {
        if (!fs.existsSync(sourceDir)) continue;

        for (const item of itemsToCopy) {
          const src = path.join(sourceDir, item);
          const dest = path.join(userDataDir, item);
          if (fs.existsSync(src) && !fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
            migratedAny = true;
            if (logger && typeof logger.info === 'function') {
              logger.info(`Миграция файла ${item}: ${src} -> ${dest}`);
            }
          }
        }

        const srcPlugins = path.join(sourceDir, 'plugins');
        const destPlugins = path.join(userDataDir, 'plugins');
        if (fs.existsSync(srcPlugins) && !fs.existsSync(destPlugins)) {
          fs.cpSync(srcPlugins, destPlugins, { recursive: true });
          migratedAny = true;
          if (logger && typeof logger.info === 'function') {
            logger.info(`Миграция плагинов: ${srcPlugins} -> ${destPlugins}`);
          }
        }
      } catch (e) {
        if (logger && typeof logger.warn === 'function') {
          logger.warn(`Ошибка проверки каталога ${sourceDir} при миграции: ${e.message}`);
        }
      }
    }

    fs.writeFileSync(markerFile, JSON.stringify({ migratedAt: new Date().toISOString(), migratedAny }), 'utf8');
  } catch (err) {
    if (logger && typeof logger.error === 'function') {
      logger.error('Ошибка миграции данных пользователя', err);
    }
  }
}

module.exports = { migratePortableData };
