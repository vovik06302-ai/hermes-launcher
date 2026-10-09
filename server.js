'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const { createConfigStore, normalize } = require('./lib/config');
const { run, resolveHermes, summarizeVersion } = require('./lib/commands');
const { createLogger } = require('./lib/logger');
const { ProviderRegistry } = require('./lib/provider-registry');
const { TaskQueue } = require('./lib/task-queue');
const { createApiKeyStore } = require('./lib/api-keys');
const { createProcessManager } = require('./lib/process-manager');
const { registerIpcHandlers } = require('./lib/app-ipc');
const { createHermesRuntime } = require('./lib/hermes-runtime');
const { createAppServices } = require('./lib/services');
const { createSessionServices } = require('./lib/session-services');
const { createUpdater } = require('./lib/updater');
const github = require('./lib/github');

const userDataDir = path.join(process.cwd(), '.data');
fs.mkdirSync(userDataDir, { recursive: true });

function getOrCreateWebToken() {
  if (process.env.HERMES_WEB_TOKEN) return process.env.HERMES_WEB_TOKEN;
  const tokenFile = path.join(userDataDir, '.web-token');
  try {
    if (fs.existsSync(tokenFile)) {
      const existing = fs.readFileSync(tokenFile, 'utf8').trim();
      if (existing) return existing;
    }
    const generated = crypto.randomBytes(16).toString('hex');
    fs.writeFileSync(tokenFile, generated, 'utf8');
    return generated;
  } catch (_) {
    return crypto.randomBytes(16).toString('hex');
  }
}

const WEB_TOKEN = getOrCreateWebToken();
const HOST = process.env.HERMES_WEB_HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });

const mockApp = {
  getVersion: () => '1.0.2',
  getPath: (name) => userDataDir,
  getLoginItemSettings: () => ({ openAtLogin: false }),
  setLoginItemSettings: () => {}
};

const mockClipboard = {
  content: '',
  readText() { return this.content; },
  writeText(text) { this.content = text; }
};

const mockDialog = {
  async showOpenDialog() {
    return { canceled: false, filePaths: [process.cwd()] };
  },
  async showMessageBox(win, options) {
    if (options && (options.confirm || options.confirmed)) {
      return { response: 1 };
    }
    return { response: options?.cancelId !== undefined ? options.cancelId : 0 };
  }
};

function isValidOrigin(originHeader, hostHeader) {
  if (!originHeader) return true;
  try {
    const originUrl = new URL(originHeader);
    if (hostHeader && (originUrl.host === hostHeader || originUrl.host === hostHeader.split(',')[0].trim())) return true;
    const hostname = originUrl.hostname;
    if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0' || hostname === HOST) return true;
    return true;
  } catch (e) {
    return false;
  }
}

const ipcHandlers = new Map();
const ipcListeners = new Map();

const ipcMain = {
  handle(channel, fn) {
    ipcHandlers.set(channel, fn);
  },
  on(channel, fn) {
    if (!ipcListeners.has(channel)) ipcListeners.set(channel, new Set());
    ipcListeners.get(channel).add(fn);
  },
  emit(channel, event, ...args) {
    const listeners = ipcListeners.get(channel);
    if (listeners) {
      for (const fn of listeners) {
        try { fn(event, ...args); } catch (e) { console.error(`Listener error on ${channel}:`, e); }
      }
    }
  }
};

const connectedWs = new Set();

function broadcast(msg) {
  const json = JSON.stringify(msg);
  for (const client of connectedWs) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(json);
    }
  }
}

const mockWin = {
  webContents: {
    send(channel, data) {
      broadcast({ channel, data });
    },
    getURL() {
      return 'web';
    }
  },
  isDestroyed() {
    return false;
  }
};

const store = createConfigStore(userDataDir);
const apiKeys = createApiKeyStore(userDataDir);
const logger = createLogger(userDataDir);
const processStateFile = path.join(userDataDir, '.hermes-state.json');
const processManager = createProcessManager(processStateFile);

let providerConfig = {};
try {
  providerConfig = require('./providers-config.json');
} catch (_) {
  providerConfig = {};
}

const services = createAppServices({ app: mockApp, providerConfig, processStateFile, logger });
const providerManager = services.providerManager;
const providerRegistry = new ProviderRegistry(path.join(userDataDir, 'plugins', 'providers'));
const comparisonQueue = new TaskQueue(4);

let lastCpuUsage = process.cpuUsage();
let lastCpuTime = process.hrtime.bigint();
let updating = false;

const hermesRuntime = createHermesRuntime({ apiKeys, logger, winRef: () => mockWin });
const { terminal, terminalPool, terminalFor } = hermesRuntime;

const sessionServices = createSessionServices({
  startHermes: (input, id, terminalId) => start(input, id, terminalId),
  runHermesCommand: (file, args, timeout) => run(file, args, timeout),
  resolveHermes,
  normalize,
  logger
});

const modelCache = new Map();

const publishConfig = {
  provider: 'github',
  owner: 'vovik06302-ai',
  repo: 'hermes-launcher'
};
const updater = createUpdater({ app: mockApp, processManager, logger, winRef: () => mockWin, publishConfig });

const { handle } = registerIpcHandlers({
  ipcMain,
  app: mockApp,
  dialog: mockDialog,
  clipboard: mockClipboard,
  logger,
  store,
  apiKeys,
  providerRegistry,
  processManager,
  providerManager,
  terminalPool,
  terminal,
  modelCache,
  comparisonQueue,
  updateManager: { check: (version, url) => services.updateLauncher(url, version) },
  github,
  winRef: () => mockWin,
  providerConfig,
  sessionServices,
  updater
});

handle('metrics:get', () => {
  const now = process.hrtime.bigint();
  const elapsed = Number(now - lastCpuTime) / 1000;
  const usage = process.cpuUsage(lastCpuUsage);
  lastCpuUsage = process.cpuUsage();
  lastCpuTime = now;
  const cpu = elapsed > 0 ? Math.min(100, ((usage.user + usage.system) / elapsed) * 100) : 0;
  return { cpu, memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024) };
});

async function start(input, sessionId, terminalId = 'default') {
  return hermesRuntime.start(input, sessionId, terminalId, () => updating);
}

handle('hermes:launch', (input, terminalId) => start(input, null, terminalId));
handle('hermes:resume', (input, id, terminalId) => start(input, id, terminalId));
handle('models:compareRun', async plan => sessionServices.runComparisonPlan(plan, comparisonQueue));
handle('models:compareQueue', () => comparisonQueue.snapshot());
handle('models:compareCancel', id => ({ canceled: comparisonQueue.cancel(id) }));
handle('hermes:version', async input => {
  const result = await run(await resolveHermes(normalize(input)), ['--version']);
  return summarizeVersion(result);
});
handle('hermes:update', async input => {
  if (updating || ['starting', 'running', 'stopping'].includes(terminal.state)) throw new Error('Сначала завершите текущую операцию.');
  updating = true;
  try {
    const result = await run(await resolveHermes(normalize(input)), ['update', '--force-venv'], 300000);
    if (!result.ok) throw new Error(result.error);
    return { output: result.output };
  } finally { updating = false; }
});
handle('terminal:state', () => ({ state: terminal.state }));
handle('terminal:sessions', () => ({ sessions: [...terminalPool.terminals].map(([id, item]) => ({ id, state: item.state, pid: item.process?.pid || null })) }));
handle('terminal:create', (_input, id) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,32}$/.test(id)) throw new Error('Некорректный идентификатор терминала.');
  terminalFor(id);
  return { id };
});
handle('terminal:close', id => {
  if (id === 'default') throw new Error('Основной терминал закрыть нельзя.');
  return { removed: terminalPool.remove(id) };
});
handle('terminal:kill', () => terminal.stop());

const mockEvent = { sender: mockWin.webContents, senderFrame: { url: 'web' } };

ipcMain.on('terminal:input', (event, data) => terminal.write(data));
ipcMain.on('terminal:resize', (event, cols, rows) => { try { terminal.resize(cols, rows); } catch (e) { console.error(e.message); } });
ipcMain.on('terminal:input-for', (event, id, data) => terminalFor(id).write(data));
ipcMain.on('terminal:resize-for', (event, id, cols, rows) => { try { terminalFor(id).resize(cols, rows); } catch (e) { logger.error(`Resize ${id}`, e); } });

app.use(express.json({ limit: '10mb' }));

app.get(['/', '/index.html'], (req, res) => {
  const filePath = path.join(__dirname, 'renderer', 'index.html');
  try {
    let html = fs.readFileSync(filePath, 'utf8');
    const tokenScript = `<script>window.__HERMES_TOKEN__ = ${JSON.stringify(WEB_TOKEN)};</script>`;
    html = html.replace('</head>', `${tokenScript}\n</head>`);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(html);
  } catch (e) {
    res.status(500).send('Ошибка загрузки страницы');
  }
});

app.use(express.static(path.join(__dirname, 'renderer')));

app.post('/api/invoke', async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !isValidOrigin(origin, req.headers.host)) {
    return res.status(403).json({ ok: false, error: 'Запрещено: недопустимый Origin' });
  }

  const token = req.headers['x-hermes-token'] || req.query?.token || req.body?.token || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  if (!token || token !== WEB_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Неавторизован: неверный или отсутствует токен' });
  }

  const { channel, args = [] } = req.body || {};
  if (!channel) return res.status(400).json({ ok: false, error: 'Канал не указан' });

  const fn = ipcHandlers.get(channel);
  if (!fn) return res.status(404).json({ ok: false, error: `Неизвестный канал: ${channel}` });

  try {
    const result = await fn(mockEvent, ...args);
    res.json(result);
  } catch (err) {
    logger.error(`API invoke error for ${channel}`, err);
    res.status(500).json({ ok: false, error: err.message || 'Внутренняя ошибка сервера' });
  }
});

server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin;
  if (origin && !isValidOrigin(origin, request.headers.host)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  const hostHeader = request.headers.host || 'localhost';
  const url = new URL(request.url, `http://${hostHeader}`);
  const token = url.searchParams.get('token') || request.headers['x-hermes-token'];
  if (!token || token !== WEB_TOKEN) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }

  if (url.pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, ws => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', ws => {
  connectedWs.add(ws);

  ws.on('message', message => {
    try {
      const payload = JSON.parse(message.toString('utf8'));
      if (payload.type === 'terminal:input') {
        ipcMain.emit('terminal:input', mockEvent, payload.data);
      } else if (payload.type === 'terminal:resize') {
        ipcMain.emit('terminal:resize', mockEvent, payload.cols, payload.rows);
      } else if (payload.type === 'terminal:input-for') {
        ipcMain.emit('terminal:input-for', mockEvent, payload.id, payload.data);
      } else if (payload.type === 'terminal:resize-for') {
        ipcMain.emit('terminal:resize-for', mockEvent, payload.id, payload.cols, payload.rows);
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    connectedWs.delete(ws);
  });
});

const PORT = 3000;

server.listen(PORT, HOST, () => {
  console.log(`Hermes Web Token: ${WEB_TOKEN}`);
  console.log(`Hermes Launcher Web App running at http://${HOST}:${PORT}`);
});
