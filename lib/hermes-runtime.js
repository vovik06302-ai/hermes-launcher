'use strict';

const fs = require('fs');
const { TerminalPool } = require('./terminal-pool');
const { TerminalManager } = require('./terminal');
const { normalize } = require('./config');
const { resolveHermes, launchArgs, syncContext } = require('./commands');

function createHermesRuntime({ apiKeys, logger, winRef, defaultTerminalId = 'default' }) {
  // Основной терминал пишет в общие каналы terminal:*, дополнительные вкладки —
  // в собственные terminal:<id>:*, иначе вывод всех сессий смешивается в первой вкладке.
  function notifierFor(id) {
    const prefix = id === defaultTerminalId ? '' : `terminal:${id}:`;
    return (channel, data) => {
      const win = winRef();
      if (win && !win.isDestroyed()) win.webContents.send(prefix ? `${prefix}${channel.slice('terminal:'.length)}` : channel, data);
    };
  }

  const terminalPool = new TerminalPool(notify => new TerminalManager(notify));

  const terminal = terminalPool.create(defaultTerminalId, notifierFor(defaultTerminalId));

  function terminalFor(id = defaultTerminalId) {
    const existing = terminalPool.get(id);
    if (existing) return existing;
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(id)) throw new Error('Некорректный идентификатор терминала.');
    return terminalPool.create(id, notifierFor(id));
  }

  async function start(input, sessionId, terminalId = defaultTerminalId, updatingRef) {
    if (updatingRef && updatingRef()) throw new Error('Дождитесь завершения обновления Hermes.');
    const currentTerminal = terminalFor(terminalId);
    if (['starting', 'running', 'stopping'].includes(currentTerminal.state)) throw new Error('Этот терминал уже занят.');
    return currentTerminal.start(async () => {
      const cfg = normalize(input);
      if (!cfg.projectFolder || !fs.existsSync(cfg.projectFolder) || !fs.statSync(cfg.projectFolder).isDirectory()) {
        throw new Error('Укажите существующую папку проекта.');
      }
      const args = launchArgs(cfg, sessionId);
      const file = await resolveHermes(cfg);
      await syncContext(file, cfg);
      const apiKey = apiKeys.get(cfg.provider);
      const openAiCompatibleLocal = ['llamacpp', 'vllm'].includes(cfg.provider);
      const localBaseUrls = { llamacpp: 'http://127.0.0.1:8081/v1', vllm: 'http://127.0.0.1:8001/v1' };

      const providerEnv = {};
      if (cfg.provider === 'claude') {
        if (apiKey) providerEnv.ANTHROPIC_API_KEY = apiKey;
        if (cfg.apiBaseUrl) providerEnv.ANTHROPIC_BASE_URL = cfg.apiBaseUrl;
      } else if (cfg.provider === 'gemini') {
        if (apiKey) {
          providerEnv.GEMINI_API_KEY = apiKey;
          providerEnv.GOOGLE_API_KEY = apiKey;
        }
        providerEnv.GEMINI_BASE_URL = cfg.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';
      } else {
        let openAiKey = apiKey;
        if (!openAiKey && openAiCompatibleLocal) {
          openAiKey = process.env.OPENAI_API_KEY || 'local';
        }
        if (openAiKey) {
          providerEnv.OPENAI_API_KEY = openAiKey;
        }
        const baseUrl = cfg.apiBaseUrl || (openAiCompatibleLocal ? localBaseUrls[cfg.provider] : '');
        if (baseUrl) {
          providerEnv.OPENAI_BASE_URL = baseUrl;
        }
      }

      const env = { ...process.env, ...providerEnv, TERM: 'xterm-256color', COLORTERM: 'truecolor', FORCE_COLOR: '1', PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HERMES_MAX_TOKENS: String(cfg.maxTokens), HERMES_CONTEXT_LENGTH: String(cfg.contextLength), HERMES_EPHEMERAL_SYSTEM_PROMPT: cfg.systemPrompt, HERMES_YOLO_MODE: cfg.autoApprove ? '1' : '0' };
      delete env.NO_COLOR;
      return { file, args, cwd: cfg.projectFolder, env };
    }).catch(error => {
      if (logger && typeof logger.error === 'function') {
        logger.error(`Запуск терминала (${terminalId})`, error);
      }
      throw error;
    });
  }

  return { terminal, terminalPool, terminalFor, start };
}

module.exports = { createHermesRuntime };
