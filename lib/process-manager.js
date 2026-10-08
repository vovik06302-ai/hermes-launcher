'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const http = require('http');
const { spawn, execFile, execFileSync } = require('child_process');
const { promisify } = require('util');
const { readState, writeState, isPidAlive, setStateFile } = require('../state-manager');

const execFileAsync = promisify(execFile);
function getLocalRoot() {
  const root = (process.env.HERMES_LOCAL_AI_ROOT || '').trim();
  if (!root) throw new Error('Не задана переменная окружения HERMES_LOCAL_AI_ROOT. Укажите путь к директории сервисов.');
  return root;
}
const LOCAL_ROOT = process.env.HERMES_LOCAL_AI_ROOT || '';
const SERVICES = {
  server: { script: 'access_server.py', port: 8080, health: 'http://127.0.0.1:8080/health' },
  piper: { script: 'tts_server.py', port: 5002, health: 'http://127.0.0.1:5002/health' },
  stt: { script: 'stt_server.py', port: 5004, health: 'http://127.0.0.1:5004/health' },
  watchdog: { script: 'watchdog.py', port: null, health: null }
};

let cachedPython = null;
function pythonPath() {
  if (cachedPython) return cachedPython;
  const root = getLocalRoot();
  const candidates = [
    process.env.HERMES_PYTHON,
    path.join(root, 'venv_xtts', 'Scripts', 'python.exe'),
    'python'
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['-c', 'import flask, flask_cors, waitress, torch'], { windowsHide: true, stdio: 'ignore' });
      cachedPython = candidate;
      return candidate;
    } catch { /* проверяем следующее окружение */ }
  }
  cachedPython = 'python';
  return cachedPython;
}

function stateFor(status) {
  return Object.fromEntries(Object.entries(status).map(([name, item]) => [name, item.pid]).filter(([, pid]) => Number.isInteger(pid)));
}

function isPortFree(port) {
  return new Promise(resolve => {
    const tester = net.createServer();
    tester.once('error', () => resolve(false));
    tester.once('listening', () => tester.close(() => resolve(true)));
    tester.listen(port, '127.0.0.1');
  });
}

function requestHealth(url, timeout = 1500) {
  return new Promise(resolve => {
    const request = http.get(url, response => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.setTimeout(timeout, () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

function isServiceProcess(pid, name) {
  if (!isPidAlive(pid)) return false;
  const service = SERVICES[name];
  if (!service) return isPidAlive(pid);
  if (os.platform() === 'win32') {
    try {
      const output = execFileSync('cmd.exe', ['/c', `wmic process where "ProcessId=${pid}" get CommandLine`], { windowsHide: true, encoding: 'utf8' });
      if (output && service.script && output.toLowerCase().includes(service.script.toLowerCase())) {
        return true;
      }
      return Boolean(output && output.toLowerCase().includes('python'));
    } catch {
      return isPidAlive(pid);
    }
  }
  return isPidAlive(pid);
}

async function killTree(pid, name) {
  if (!isServiceProcess(pid, name)) return false;
  if (os.platform() === 'win32') {
    try { await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }); } catch { /* процесс мог завершиться между проверками */ }
  } else {
    try { process.kill(pid, 'SIGTERM'); } catch { return false; }
  }
  return true;
}

function spawnService(name, stateFile) {
  const root = getLocalRoot();
  const service = SERVICES[name];
  const py = pythonPath();
  const args = [path.join(root, service.script)];
  if (name === 'watchdog') args.push('--state-file', stateFile, '--python', py);
  const logDirectory = path.join(root, 'logs');
  fs.mkdirSync(logDirectory, { recursive: true });
  const output = fs.openSync(path.join(logDirectory, `${name}.out.log`), 'a');
  const errors = fs.openSync(path.join(logDirectory, `${name}.err.log`), 'a');
  try {
    const child = spawn(py, args, {
      cwd: root,
      windowsHide: true,
      stdio: ['ignore', output, errors],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
    });
    child.unref();
    return child.pid;
  } finally {
    try { fs.closeSync(output); } catch (_) {}
    try { fs.closeSync(errors); } catch (_) {}
  }
}

function createProcessManager(stateFile) {
  setStateFile(stateFile);

  async function startAll() {
    const root = getLocalRoot();
    if (!fs.existsSync(root)) throw new Error(`Папка сервисов не найдена: ${root}`);
    const state = readState();
    const status = {};
    for (const name of ['server', 'piper', 'stt']) {
      const service = SERVICES[name];
      const oldPid = state[name];
      if (isPidAlive(oldPid)) {
        status[name] = { pid: oldPid, message: `уже запущен, PID ${oldPid}` };
        continue;
      }
      if (!(await isPortFree(service.port))) {
        status[name] = { pid: null, message: `порт ${service.port} занят — пропущен` };
        continue;
      }
      const scriptPath = path.join(root, service.script);
      if (!fs.existsSync(scriptPath)) throw new Error(`Файл сервиса не найден: ${scriptPath}`);
      const pid = spawnService(name, stateFile);
      state[name] = pid;
      writeState(state);
      status[name] = { pid, message: `запущен, PID ${pid}` };
    }
    if (isPidAlive(state.watchdog)) {
      status.watchdog = { pid: state.watchdog, message: `уже запущен, PID ${state.watchdog}` };
    } else {
      state.watchdog = spawnService('watchdog', stateFile);
      writeState(state);
      status.watchdog = { pid: state.watchdog, message: `запущен, PID ${state.watchdog}` };
    }
    return { status, state, text: Object.values(status).map(item => item.message).join('; ') };
  }

  async function stopAll() {
    const state = readState();
    const status = {};
    for (const [name, pid] of Object.entries(state)) {
      if (await killTree(pid, name)) status[name] = `остановлен PID ${pid}`;
      else status[name] = `PID ${pid} уже не жив`;
    }
    writeState({});
    return { status, state: {}, text: Object.values(status).join('; ') || 'Процессы не запущены.' };
  }

  async function getStatus() {
    const state = readState();
    const services = {};
    for (const [name, service] of Object.entries(SERVICES)) {
      const pid = state[name] || null;
      services[name] = { pid, alive: isPidAlive(pid), healthy: service.health ? await requestHealth(service.health) : null, port: service.port };
    }
    return { state, services };
  }

  return { startAll, stopAll, getStatus };
}

module.exports = { createProcessManager, SERVICES, LOCAL_ROOT, isPortFree };
