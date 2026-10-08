'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { isPortFree } = require('./process-manager');

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function validateConfig(config) {
  if (!config || typeof config !== 'object' || !config.providers || typeof config.providers !== 'object') {
    throw new Error('Некорректный providers-config.json: отсутствует объект providers.');
  }

  for (const [name, provider] of Object.entries(config.providers)) {
    if (!/^[a-z0-9_-]+$/i.test(name) || !provider || typeof provider !== 'object') {
      throw new Error(`Некорректная конфигурация провайдера: ${name}.`);
    }
    if (!Number.isInteger(provider.port) || provider.port < 1 || provider.port > 65535) {
      throw new Error(`Некорректный порт провайдера ${name}.`);
    }
    if (provider.cwd !== null && provider.cwd !== undefined && typeof provider.cwd !== 'string') {
      throw new Error(`Некорректная рабочая папка провайдера ${name}.`);
    }
    if (provider.startCmd !== null && provider.startCmd !== undefined &&
        (!Array.isArray(provider.startCmd) || !provider.startCmd.length || provider.startCmd.some(arg => typeof arg !== 'string'))) {
      throw new Error(`Некорректная команда запуска провайдера ${name}.`);
    }
  }
}

function createProviderManager(config) {
  validateConfig(config);
  const processes = new Map();
  const starting = new Map();

  function getProvider(name) {
    if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(config.providers, name)) {
      throw new Error(`Неизвестный провайдер: ${String(name)}.`);
    }
    return config.providers[name];
  }

  async function start(name) {
    const provider = getProvider(name);
    const activeProcess = processes.get(name);
    if (activeProcess && activeProcess.exitCode === null && !activeProcess.killed) {
      return { started: false, status: `Уже запущен этим лаунчером, PID ${activeProcess.pid}.` };
    }
    if (starting.has(name)) return starting.get(name);
    if (!provider.startCmd) {
      return { started: false, status: provider.note || 'Запускается вручную.' };
    }
    if (!(await isPortFree(provider.port))) {
      return { started: false, status: `Порт ${provider.port} уже занят.` };
    }

    const cwd = provider.cwd ? path.resolve(provider.cwd) : PROJECT_ROOT;
    let stats;
    try { stats = fs.statSync(cwd); }
    catch { throw new Error(`Папка провайдера ${name} не найдена: ${cwd}`); }
    if (!stats.isDirectory()) throw new Error(`Рабочий путь провайдера ${name} не является папкой: ${cwd}`);

    const launch = new Promise((resolve, reject) => {
      const child = spawn(provider.startCmd[0], provider.startCmd.slice(1), {
        cwd,
        windowsHide: true,
        stdio: 'ignore'
      });
      let spawned = false;
      processes.set(name, child);
      child.once('spawn', () => {
        spawned = true;
        child.unref();
        resolve({ started: true, pid: child.pid, status: `Запущен, PID ${child.pid}, порт ${provider.port}.` });
      });
      child.on('error', error => {
        if (processes.get(name) === child) processes.delete(name);
        if (!spawned) reject(new Error(`Не удалось запустить ${name}: ${error.message}`));
      });
      child.once('exit', () => {
        if (processes.get(name) === child) processes.delete(name);
      });
    });

    starting.set(name, launch);
    try { return await launch; }
    finally { starting.delete(name); }
  }

  async function stop(name) {
    getProvider(name);
    const child = processes.get(name);
    if (!child || !Number.isInteger(child.pid)) {
      return { stopped: false, status: 'Не запускался этим лаунчером.' };
    }

    if (os.platform() === 'win32') {
      await execFileAsync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      child.kill('SIGTERM');
    }
    if (processes.get(name) === child) processes.delete(name);
    return { stopped: true, pid: child.pid, status: `Остановлен PID ${child.pid}.` };
  }

  async function status() {
    const entries = await Promise.all(Object.entries(config.providers).map(async ([name, provider]) => {
      const child = processes.get(name);
      const managed = Boolean(child && child.exitCode === null && !child.killed);
      const portFree = await isPortFree(provider.port);
      return [name, {
        running: !portFree,
        managed,
        pid: managed ? child.pid : null,
        enabled: provider.enabled !== false,
        port: provider.port,
        canStart: Boolean(provider.startCmd),
        note: provider.note || null
      }];
    }));
    return { providers: Object.fromEntries(entries) };
  }

  return { start, stop, status };
}

module.exports = { createProviderManager, validateConfig };
