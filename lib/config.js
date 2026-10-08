'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { LIMITS } = require('./constants');
const themes = ['aurora', 'neon', 'sunset', 'ocean', 'forest', 'candy', 'ember', 'amethyst', 'light', 'high-contrast'];
const CONFIG_VERSION = 2;
const defaults = { configVersion: CONFIG_VERSION, projectFolder: os.homedir(), savedProjects: [], projectProfiles: {}, modelProfiles: {}, providerModels: {}, provider: 'ollama', model: '', contextLength: 65536, maxTokens: 4096, systemPrompt: '', autoApprove: false, hermesPath: '', lmstudioProvider: 'lmstudio-launch', localBaseUrl: 'http://localhost:5000/v1', apiBaseUrl: '', localProvider: '', disableUpdateCheck: false, animatedBackground: true, theme: 'aurora' };
function migrate(input) {
  const source = { ...(input || {}) };
  if (!source.configVersion) source.configVersion = 1;
  if (source.configVersion < 2) { source.projectProfiles = source.projectProfiles || {}; source.providerModels = source.providerModels || {}; source.configVersion = 2; }
  return source;
}
function normalize(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Некорректные настройки.');
  const cfg = { ...defaults, ...migrate(input), configVersion: CONFIG_VERSION };
  delete cfg.initialPrompt;
  const builtInProvider = ['ollama', 'openai', 'gemini', 'claude', 'llm', 'lmstudio', 'llamacpp', 'vllm', 'kilocode'].includes(cfg.provider);
  if (!builtInProvider && !/^plugin-[a-z0-9-]+$/.test(cfg.provider)) throw new Error('Неизвестный провайдер.');
  for (const key of ['projectFolder', 'model', 'systemPrompt', 'hermesPath', 'lmstudioProvider', 'localBaseUrl', 'apiBaseUrl', 'localProvider']) {
    if (typeof cfg[key] !== 'string' || cfg[key].includes('\0')) throw new Error(`Некорректное поле: ${key}`);
  }
  for (const [key, limits] of Object.entries(LIMITS)) {
    const { min, max } = limits;
    cfg[key] = Number(cfg[key]);
    if (!Number.isInteger(cfg[key]) || cfg[key] < min || cfg[key] > max) throw new Error(`Поле ${key}: требуется целое число от ${min} до ${max}.`);
  }
  cfg.autoApprove = cfg.autoApprove === true;
  cfg.disableUpdateCheck = cfg.disableUpdateCheck === true;
  cfg.animatedBackground = cfg.animatedBackground !== false;
  cfg.theme = themes.includes(cfg.theme) ? cfg.theme : 'aurora';
  cfg.savedProjects = [...new Set((Array.isArray(cfg.savedProjects) ? cfg.savedProjects : []).filter(p => typeof p === 'string'))];
  for (const key of ['projectProfiles', 'modelProfiles', 'providerModels']) {
    if (!cfg[key] || typeof cfg[key] !== 'object' || Array.isArray(cfg[key])) cfg[key] = {};
  }
  return cfg;
}
function createConfigStore(directory) {
  const file = path.join(directory, 'config.json');
  const backup = `${file}.bak`;
  return {
    load() {
      if (!fs.existsSync(file)) return normalize();
      try {
        return normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
      } catch (error) {
        if (fs.existsSync(backup)) {
          try {
            return normalize(JSON.parse(fs.readFileSync(backup, 'utf8')));
          } catch (backupError) {
            try {
              return normalize();
            } catch (fallbackError) {
              throw new Error(`Не удалось восстановить настройки: ${fallbackError.message}. Исходные файлы сохранены.`);
            }
          }
        }
        try {
          return normalize();
        } catch (fallbackError) {
          throw new Error(`Не удалось прочитать ${file}: ${error.message}. Исходный файл сохранён.`);
        }
      }
    },
    save(input) {
      const cfg = normalize(input);
      fs.mkdirSync(directory, { recursive: true });
      if (fs.existsSync(file)) {
        try {
          const currentContent = fs.readFileSync(file, 'utf8');
          normalize(JSON.parse(currentContent));
          fs.copyFileSync(file, backup);
        } catch (_) {
          // Игнорируем копирование в бэкап, если текущий файл повреждён
        }
      }
      const temporary = file + '.tmp';
      fs.writeFileSync(temporary, JSON.stringify(cfg, null, 2), 'utf8');
      try { fs.renameSync(temporary, file); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
      return cfg;
    }
  };
}
module.exports = { normalize, createConfigStore, themes, CONFIG_VERSION };
