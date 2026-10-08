'use strict';
const fs = require('fs');
const path = require('path');

class ProviderRegistry {
  constructor(pluginDirectory) { this.pluginDirectory = pluginDirectory; this.providers = new Map(); }
  register(provider) {
    if (!provider || typeof provider.id !== 'string' || !/^plugin-[a-z0-9-]+$/.test(provider.id) || typeof provider.listModels !== 'function') throw new Error('Некорректный плагин провайдера. Идентификатор должен начинаться с plugin-.');
    this.providers.set(provider.id, Object.freeze({ ...provider }));
  }
  loadPlugins(logger) {
    if (!fs.existsSync(this.pluginDirectory)) return 0;
    let loaded = 0;
    for (const file of fs.readdirSync(this.pluginDirectory).filter(name => name.endsWith('.js'))) {
      try {
        const plugin = require(path.join(this.pluginDirectory, file));
        this.register(plugin);
        loaded++;
      } catch (err) {
        if (logger && typeof logger.error === 'function') {
          logger.error(`Ошибка загрузки плагина провайдера из ${file}`, err);
        }
      }
    }
    return loaded;
  }
  get(id) { return this.providers.get(id); }
  list() { return [...this.providers.values()].map(({ id, name }) => ({ id, name })); }
}

module.exports = { ProviderRegistry };
