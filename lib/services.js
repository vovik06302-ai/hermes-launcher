'use strict';

const { checkLauncherUpdate } = require('./launcher-update');
const { createProviderManager } = require('./provider-manager');

function createAppServices({ app, providerConfig, processStateFile, logger }) {
  const providerManager = createProviderManager(providerConfig);
  const runtimeServices = {
    providerManager,
    updateLauncher: (url) => checkLauncherUpdate(app.getVersion(), url),
    appState: {
      isQuitting: false,
      updating: false
    }
  };

  return runtimeServices;
}

module.exports = { createAppServices };
