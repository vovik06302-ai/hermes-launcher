'use strict';

const { checkLauncherUpdate } = require('./launcher-update');
const { createProviderManager } = require('./provider-manager');
const { getAppVersion } = require('./app-version');

function createAppServices({ app, providerConfig, processStateFile, logger }) {
  const providerManager = createProviderManager(providerConfig);
  const runtimeServices = {
    providerManager,
    // Сигнатура: (manifestUrl, currentVersion) — согласована с вызовами в main.js и server.js.
    updateLauncher: (manifestUrl, currentVersion) => checkLauncherUpdate(currentVersion || getAppVersion(app), manifestUrl),
    appState: {
      isQuitting: false,
      updating: false
    }
  };

  return runtimeServices;
}

module.exports = { createAppServices };
