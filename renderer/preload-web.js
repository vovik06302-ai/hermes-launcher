'use strict';

(function () {
  if (window.api) return;
  const listeners = new Map();
  const webToken = window.__HERMES_TOKEN__ || new URLSearchParams(location.search).get('token') || '';

  function subscribe(channel, callback) {
    if (!listeners.has(channel)) {
      listeners.set(channel, new Set());
    }
    listeners.get(channel).add(callback);
    return () => {
      const set = listeners.get(channel);
      if (set) set.delete(callback);
    };
  }

  function emit(channel, data) {
    const set = listeners.get(channel);
    if (set) {
      for (const cb of set) {
        try { cb(data); } catch (e) { console.error('Listener error', e); }
      }
    }
  }

  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  let ws = null;
  let wsQueue = [];

  function connectWs() {
    const tokenQuery = webToken ? `?token=${encodeURIComponent(webToken)}` : '';
    ws = new WebSocket(`${wsProtocol}//${location.host}/ws${tokenQuery}`);
    ws.onopen = () => {
      while (wsQueue.length > 0) {
        const item = wsQueue.shift();
        ws.send(JSON.stringify(item));
      }
    };
    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.channel) {
          emit(msg.channel, msg.data);
        }
      } catch (err) {
        console.error('WS parse error', err);
      }
    };
    ws.onclose = () => {
      setTimeout(connectWs, 2000);
    };
    ws.onerror = () => {
      try { ws.close(); } catch (_) {}
    };
  }

  connectWs();

  function sendWs(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      wsQueue.push(payload);
    }
  }

  async function invoke(channel, ...args) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (webToken) headers['X-Hermes-Token'] = webToken;
      const res = await fetch('/api/invoke', {
        method: 'POST',
        headers,
        body: JSON.stringify({ channel, args })
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: text || `HTTP ${res.status}` };
      }
      return await res.json();
    } catch (err) {
      return { ok: false, error: err.message || 'Сетевая ошибка' };
    }
  }

  window.api = {
    getConfig: () => invoke('config:get'),
    saveConfig: cfg => invoke('config:save', cfg),
    readClipboard: () => invoke('clipboard:read'),
    writeClipboard: text => invoke('clipboard:write', text),
    chooseFolder: () => invoke('dialog:chooseFolder'),
    listModels: cfg => invoke('models:list', cfg),
    clearModelCache: () => invoke('models:cacheClear'),
    apiKeyStatus: provider => invoke('apiKey:status', provider),
    saveApiKey: (provider, key) => invoke('apiKey:set', provider, key),
    clearApiKey: provider => invoke('apiKey:clear', provider),
    listProviders: () => invoke('providers:list'),
    createComparisonPlan: (cfg, models) => invoke('models:comparePlan', cfg, models),
    checkLauncherUpdate: url => invoke('launcher:updateCheck', url),
    githubStatus: folder => invoke('github:status', folder),
    githubList: () => invoke('github:list'),
    githubClone: (repo, parentFolder) => invoke('github:clone', repo, parentFolder),
    githubPull: folder => invoke('github:pull', folder),
    githubPush: (folder, message) => invoke('github:push', folder, message),
    startAll: () => invoke('processes:startAll'),
    stopAll: () => invoke('processes:stopAll'),
    processesStatus: () => invoke('processes:status'),
    getAutostart: () => invoke('autostart:get'),
    setAutostart: enabled => invoke('autostart:set', enabled),
    updateLauncher: () => invoke('launcher:update'),
    updaterCheck: () => invoke('updater:check'),
    updaterDownload: () => invoke('updater:download'),
    updaterInstall: () => invoke('updater:install'),
    onUpdaterProgress: callback => subscribe('updater:progress', callback),
    getGpuStats: () => invoke('gpu:stats'),
    runModelComparison: plan => invoke('models:compareRun', plan),
    comparisonQueue: () => invoke('models:compareQueue'),
    cancelComparison: id => invoke('models:compareCancel', id),
    runDiagnostics: cfg => invoke('diagnostics:run', cfg),
    getMetrics: () => invoke('metrics:get'),
    unloadProvider: provider => invoke('provider:unload', provider),
    listSessions: cfg => invoke('sessions:list', cfg),
    deleteSession: (cfg, session) => invoke('sessions:delete', cfg, session),
    launchHermes: (cfg, terminalId = 'default') => invoke('hermes:launch', cfg, terminalId),
    resumeSession: (cfg, id, terminalId = 'default') => invoke('hermes:resume', cfg, id, terminalId),
    getHermesVersion: cfg => invoke('hermes:version', cfg),
    updateHermes: cfg => invoke('hermes:update', cfg),
    terminalState: () => invoke('terminal:state'),
    terminalSessions: () => invoke('terminal:sessions'),
    createTerminal: id => invoke('terminal:create', null, id),
    closeTerminal: id => invoke('terminal:close', id),
    killTerminal: () => invoke('terminal:kill'),
    sendTerminalData: data => sendWs({ type: 'terminal:input', data }),
    resizeTerminal: (cols, rows) => sendWs({ type: 'terminal:resize', cols, rows }),
    sendTerminalDataFor: (id, data) => sendWs({ type: 'terminal:input-for', id, data }),
    resizeTerminalFor: (id, cols, rows) => sendWs({ type: 'terminal:resize-for', id, cols, rows }),
    onTerminalData: callback => subscribe('terminal:data', callback),
    onTerminalState: callback => subscribe('terminal:state', callback),
    onTerminalExit: callback => subscribe('terminal:exit', callback),
    onUpdateProgress: callback => subscribe('update-progress', callback),
    onUpdateDone: callback => subscribe('update-done', callback),
    onTerminalDataFor: (id, callback) => subscribe(`terminal:${id}:data`, callback),
    onTerminalStateFor: (id, callback) => subscribe(`terminal:${id}:state`, callback),
    onTerminalExitFor: (id, callback) => subscribe(`terminal:${id}:exit`, callback)
  };

  window.providersAPI = {
    start: name => invoke('start-provider', name),
    stop: name => invoke('stop-provider', name),
    status: () => invoke('get-providers-status')
  };
})();
