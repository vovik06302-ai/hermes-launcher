'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const root = process.env.HERMES_TEST_ROOT || (process.argv.includes('--packaged') ? path.join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar') : path.join(__dirname, '..'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const { normalize } = require(path.join(root, 'lib', 'config'));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-electron-test-'));
app.setPath('userData', temporary);
app.disableHardwareAcceleration();
let window;
let saved = normalize({ provider: 'lmstudio', model: 'local-model:35b', disableUpdateCheck: false });
let listedProvider;
let forceResumeFailure = true;
const terminalIds = new Set(['default']);
const errors = [];
const handlers = {
  'hermes:version': () => ({ output: 'Hermes Agent v0.2.1', diagnostic: 'Exception in thread\nUnicodeDecodeError: utf-8', warning: true }),
  'config:get': () => ({ config: saved, version: pkg.version }),
  'config:save': cfg => { saved = normalize(cfg); return { config: saved }; },
  'providers:list': () => ({ providers: [] }),
  'get-providers-status': () => ({ providers: {} }),
  'models:list': cfg => { listedProvider = cfg.provider; return { models: ['local-model:35b'] }; },
  'sessions:list': () => ({ sessions: [{ id: '20260904_120000_abc', title: 'Тестовая сессия' }] }),
  'hermes:resume': async () => { if (forceResumeFailure) throw new Error('Проверочная ошибка продолжения'); return { pid: 42 }; },
  'hermes:launch': cfg => { assert.equal(cfg.initialPrompt, undefined); return { pid: 42 }; },
  'terminal:state': () => ({ state: 'idle' }),
  'terminal:sessions': () => ({ sessions: [...terminalIds].map(id => ({ id, state: 'idle', pid: null })) }),
  'terminal:create': (_input, id) => { terminalIds.add(id); return { id }; },
  'terminal:kill': () => ({}),
  'processes:status': () => ({ services: { server: { alive: false, healthy: false }, piper: { alive: false, healthy: false }, watchdog: { alive: false, healthy: null } } }),
  'autostart:get': () => ({ enabled: false }),
  'gpu:stats': () => ({ used: '0', total: '1', util: '0', ram: { used: 1, total: 2 } }),
};
for (const [channel, action] of Object.entries(handlers)) ipcMain.handle(channel, async (_event, ...args) => {
  try { return { ok: true, ...(await action(...args)) }; } catch (e) { return { ok: false, error: e.message }; }
});
function evaluate(code) { return window.webContents.executeJavaScript(code); }
async function until(code) {
  for (let i = 0; i < 120; i++) { if (await evaluate(code)) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Таймаут: ' + code + ' LOG: ' + await evaluate("document.getElementById('logBox').textContent"));
}
app.whenReady().then(async () => {
  try {
    window = new BrowserWindow({ show: false, width: 1000, height: 920, webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    window.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message); });
    await window.loadFile(path.join(root, 'renderer', 'index.html'));
    await until("document.querySelector('.session-item') && !document.getElementById('launchBtn').disabled");
    assert.equal(await evaluate("document.getElementById('version').textContent"), 'v' + pkg.version);
    assert.equal(listedProvider, 'lmstudio');
    assert.equal(await evaluate("document.getElementById('model').value"), 'local-model:35b');
    assert.equal(await evaluate("document.getElementById('statusText').textContent"), 'Готов');
    await evaluate("document.getElementById('settingsBtn').click()");
    assert.equal(await evaluate("document.getElementById('settings').hidden"), false);
    await evaluate("document.querySelector('.session-item').click(); document.getElementById('resumeBtn').click()");
    await until("document.getElementById('logBox').textContent.includes('Проверочная ошибка') && !document.getElementById('launchBtn').disabled");
    await evaluate("document.getElementById('sessionSearch').value = 'нет совпадения'; document.getElementById('sessionSearch').dispatchEvent(new Event('input'))");
    await until("document.getElementById('resumeBtn').disabled");
    assert.equal(await evaluate("document.getElementById('resumeBtn').disabled"), true);
    await until("document.getElementById('versionDiagnostic').textContent.includes('UnicodeDecodeError')");
    assert.equal(await evaluate("document.getElementById('versionDetails').open"), false);
    assert.ok(!(await evaluate("document.getElementById('updateStatus').textContent")).includes('UnicodeDecodeError'));
    await evaluate("document.getElementById('launchBtn').click()");
    await until("document.getElementById('terminal') && !document.getElementById('launchBtn').disabled");
    assert.ok(await evaluate("document.getElementById('terminal') !== null"));
    assert.ok(await evaluate("document.getElementById('killTermBtn') !== null"));
    await evaluate("document.getElementById('newTerminalBtn').click()");
    await until("document.querySelectorAll('.terminal-tab').length >= 2");
    assert.ok(await evaluate("document.querySelectorAll('.terminal-view').length >= 1"));
    assert.deepEqual(errors, []);
    console.log('PASS: Electron UI, LM Studio restoration, resume error, session search and interactive terminal launch.');
    await evaluate("document.getElementById('settings').hidden = true; document.getElementById('settingsBtn').setAttribute('aria-expanded', 'false'); window.scrollTo(0, 0)");
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
    const screenshot = await window.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, '..', 'smoke-preview.png'), screenshot.toPNG());
    app.exit(0);
  } catch (error) {
    console.error(error.stack);
    console.error(errors);
    app.exit(1);
  }
});
