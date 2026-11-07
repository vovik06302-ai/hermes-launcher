'use strict';

const { createProviderManager } = require('./provider-manager');

function createAppServices({ app, providerConfig, processStateFile, logger }) {
  const providerManager = createProviderManager(providerConfig);
  const runtimeServices = {
    providerManager,
    appState: {
      isQuitting: false,
      updating: false
    }
  };

  return runtimeServices;
}

module.exports = { createAppServices };
