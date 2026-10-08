'use strict';
const { contextBridge, ipcRenderer } = require('electron');
function subscribe(channel, callback) {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
    saveConfig: cfg => ipcRenderer.invoke('config:save', cfg),
    readClipboard: () => ipcRenderer.invoke('clipboard:read'),
    writeClipboard: text => ipcRenderer.invoke('clipboard:write', text),
  chooseFolder: () => ipcRenderer.invoke('dialog:chooseFolder'),
  listModels: cfg => ipcRenderer.invoke('models:list', cfg),
  clearModelCache: () => ipcRenderer.invoke('models:cacheClear'),
  apiKeyStatus: provider => ipcRenderer.invoke('apiKey:status', provider),
  saveApiKey: (provider, key) => ipcRenderer.invoke('apiKey:set', provider, key),
  clearApiKey: provider => ipcRenderer.invoke('apiKey:clear', provider),
  listProviders: () => ipcRenderer.invoke('providers:list'),
  createComparisonPlan: (cfg, models) => ipcRenderer.invoke('models:comparePlan', cfg, models),
  checkLauncherUpdate: url => ipcRenderer.invoke('launcher:updateCheck', url),
  githubStatus: folder => ipcRenderer.invoke('github:status', folder),
  githubList: () => ipcRenderer.invoke('github:list'),
  githubClone: (repo, parentFolder) => ipcRenderer.invoke('github:clone', repo, parentFolder),
  githubPull: folder => ipcRenderer.invoke('github:pull', folder),
  githubPush: (folder, message) => ipcRenderer.invoke('github:push', folder, message),
  startAll: () => ipcRenderer.invoke('processes:startAll'),
  stopAll: () => ipcRenderer.invoke('processes:stopAll'),
  processesStatus: () => ipcRenderer.invoke('processes:status'),
  getAutostart: () => ipcRenderer.invoke('autostart:get'),
  setAutostart: enabled => ipcRenderer.invoke('autostart:set', enabled),
  updateLauncher: () => ipcRenderer.invoke('launcher:update'),
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  onUpdaterProgress: callback => subscribe('updater:progress', callback),
  getGpuStats: () => ipcRenderer.invoke('gpu:stats'),
  runModelComparison: plan => ipcRenderer.invoke('models:compareRun', plan),
  comparisonQueue: () => ipcRenderer.invoke('models:compareQueue'),
  cancelComparison: id => ipcRenderer.invoke('models:compareCancel', id),
  runDiagnostics: cfg => ipcRenderer.invoke('diagnostics:run', cfg),
  getMetrics: () => ipcRenderer.invoke('metrics:get'),
  unloadProvider: provider => ipcRenderer.invoke('provider:unload', provider),
  listSessions: cfg => ipcRenderer.invoke('sessions:list', cfg),
  deleteSession: (cfg, session) => ipcRenderer.invoke('sessions:delete', cfg, session),
  launchHermes: (cfg, terminalId = 'default') => ipcRenderer.invoke('hermes:launch', cfg, terminalId),
  resumeSession: (cfg, id, terminalId = 'default') => ipcRenderer.invoke('hermes:resume', cfg, id, terminalId),
  getHermesVersion: cfg => ipcRenderer.invoke('hermes:version', cfg),
  updateHermes: cfg => ipcRenderer.invoke('hermes:update', cfg),
  terminalState: () => ipcRenderer.invoke('terminal:state'),
  terminalSessions: () => ipcRenderer.invoke('terminal:sessions'),
  createTerminal: id => ipcRenderer.invoke('terminal:create', null, id),
  closeTerminal: id => ipcRenderer.invoke('terminal:close', id),
  killTerminal: () => ipcRenderer.invoke('terminal:kill'),
  sendTerminalData: data => ipcRenderer.send('terminal:input', data),
  resizeTerminal: (cols, rows) => ipcRenderer.send('terminal:resize', cols, rows),
  sendTerminalDataFor: (id, data) => ipcRenderer.send('terminal:input-for', id, data),
  resizeTerminalFor: (id, cols, rows) => ipcRenderer.send('terminal:resize-for', id, cols, rows),
  onTerminalData: callback => subscribe('terminal:data', callback),
  onTerminalState: callback => subscribe('terminal:state', callback),
  onTerminalExit: callback => subscribe('terminal:exit', callback)
  ,onUpdateProgress: callback => subscribe('update-progress', callback)
  ,onUpdateDone: callback => subscribe('update-done', callback)
  ,onTerminalDataFor: (id, callback) => subscribe(`terminal:${id}:data`, callback)
  ,onTerminalStateFor: (id, callback) => subscribe(`terminal:${id}:state`, callback)
  ,onTerminalExitFor: (id, callback) => subscribe(`terminal:${id}:exit`, callback)
});

contextBridge.exposeInMainWorld('providersAPI', {
  start: name => ipcRenderer.invoke('start-provider', name),
  stop: name => ipcRenderer.invoke('stop-provider', name),
  status: () => ipcRenderer.invoke('get-providers-status')
});
