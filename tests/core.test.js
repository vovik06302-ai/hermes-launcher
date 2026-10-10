'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { normalize, createConfigStore, CONFIG_VERSION } = require('../lib/config');
const { launchArgs, parseSessions } = require('../lib/commands');
const { TerminalManager } = require('../lib/terminal');
const { TerminalPool, MAX_TERMINALS } = require('../lib/terminal-pool');
const { TaskQueue } = require('../lib/task-queue');
const { createComparisonPlan } = require('../lib/model-compare');
const { ProviderRegistry } = require('../lib/provider-registry');
const { compareVersions } = require('../lib/launcher-update');
const { buildErrorResult, buildSuccessResult, toErrorMessage } = require('../lib/ipc-utils');
const { buildLaunchReadiness } = require('../lib/launch-readiness');

test('IPC-ошибки и успешные результаты приводятся к стандартному формату', () => {
  const error = buildErrorResult(new Error('Нет доступа'), 'INVALID_STATE', 'Проверьте состояние приложения.');
  assert.deepEqual(error, { ok: false, code: 'INVALID_STATE', error: 'Нет доступа', suggestion: 'Проверьте состояние приложения.' });
  assert.equal(toErrorMessage({ error: 'Текст ошибки' }), 'Текст ошибки');
  assert.deepEqual(buildSuccessResult({ value: 42 }), { ok: true, value: 42 });
});

test('аргументы сохраняют пути, теги и спецсимволы без shell', () => {
  const cfg = normalize({ projectFolder: 'C:\\Проекты\\A & B %PATH%', model: 'qwen:35b', autoApprove: false });
  const args = launchArgs(cfg, '20260904_120000_abc');
  assert.equal(args[args.indexOf('--in') + 1], cfg.projectFolder);
  assert.equal(args[args.indexOf('-m') + 1], 'qwen:35b');
  assert.ok(!args.includes('--yolo'));
  assert.ok(launchArgs({ ...cfg, autoApprove: true }).includes('--yolo'));
  assert.equal(launchArgs({ ...cfg, provider: 'claude' })[5], 'anthropic');
  assert.throws(() => launchArgs(cfg, 'bad & command'));
  assert.throws(() => launchArgs({ ...cfg, model: '' }));
});
test('настройки сохраняют кириллицу и восстанавливают профиль', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-config-test-'));
  try {
    const store = createConfigStore(directory);
    const input = normalize({ model: 'модель:35b', savedProjects: ['C:\\Тест'], projectProfiles: { 'C:\\Тест': { provider: 'lmstudio', model: 'test' } } });
    store.save(input); store.save({ ...input, maxTokens: 8192 });
    assert.equal(store.load().maxTokens, 8192);
    assert.equal(store.load().model, input.model);
    assert.equal(store.load().projectProfiles['C:\\Тест'].provider, 'lmstudio');
    assert.ok(!fs.existsSync(path.join(directory, 'config.json.tmp')));
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'config.json.bak'), 'utf8')).maxTokens, input.maxTokens);
    fs.writeFileSync(path.join(directory, 'config.json'), '{broken', 'utf8');
    const recovered = store.load();
    assert.equal(recovered.maxTokens, 4096);
    assert.equal(recovered.model, input.model);
    assert.equal(fs.readFileSync(path.join(directory, 'config.json'), 'utf8'), '{broken');
    fs.writeFileSync(path.join(directory, 'config.json.bak'), '{also-broken', 'utf8');
    const defaultsReturned = store.load();
    assert.equal(defaultsReturned.maxTokens, 4096);
    assert.equal(defaultsReturned.model, '');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('валидация отклоняет неверные числа и сохраняет явный режим подтверждений', () => {
  assert.equal(normalize().autoApprove, false);
  assert.equal(normalize({ autoApprove: true }).autoApprove, true);
  assert.throws(() => normalize({ contextLength: 0 }));
  assert.throws(() => normalize({ maxTokens: 'abc' }));
  assert.throws(() => normalize({ provider: 'unknown' }));
  assert.equal(normalize().theme, 'aurora');
  assert.equal(normalize({ theme: 'neon' }).theme, 'neon');
  assert.equal(normalize({ theme: 'light' }).theme, 'light');
  assert.equal(normalize({ theme: 'high-contrast' }).theme, 'high-contrast');
  assert.equal(normalize({ theme: 'нет-такой' }).theme, 'aurora');
  assert.equal(normalize().animatedBackground, true);
  assert.equal(normalize({ animatedBackground: false }).animatedBackground, false);
  assert.equal(normalize().configVersion, CONFIG_VERSION);
  assert.equal(normalize({ configVersion: 1 }).configVersion, CONFIG_VERSION);
  assert.equal(normalize({ modelProfiles: { fast: { model: 'qwen' } } }).modelProfiles.fast.model, 'qwen');
});
test('Hermes запускается во встроенном PTY-терминале', async () => {
  let options;
  let exit;
  const child = { pid: 42, onData() {}, onExit(fn) { exit = fn; }, write() {}, resize() {}, kill() {} };
  const launcher = new TerminalManager(() => {}, (_file, _args, received) => { options = received; return child; });
  const result = await launcher.start(async () => ({ file: 'C:\\Hermes Agent\\hermes.exe', args: ['chat'], cwd: '.', env: {} }));
  assert.equal(result.pid, 42);
  assert.equal(options.name, 'xterm-256color');
  assert.equal(options.useConpty, process.platform === 'win32');
  assert.equal(launcher.state, 'running');
  exit({ exitCode: 0 });
  assert.equal(launcher.state, 'idle');
});
test('пул ограничивает количество параллельных терминалов', () => {
  const pool = new TerminalPool(() => ({ process: null }));
  for (let i = 0; i < MAX_TERMINALS; i++) pool.create(`session-${i}`, () => {});
  assert.throws(() => pool.create('overflow', () => {}), /не более/);
  assert.equal(pool.terminals.size, MAX_TERMINALS);
});
test('очередь выполняет задачи с ограничением параллельности и отменой', async () => {
  const queue = new TaskQueue(1);
  const order = [];
  const first = queue.add('first', async () => { order.push('first'); });
  const canceled = queue.add('cancel', async () => { order.push('cancel'); });
  assert.equal(queue.cancel('cancel'), true);
  await first;
  await assert.rejects(canceled, /отменена/);
  assert.deepEqual(order, ['first']);
});
test('план сравнения создаёт независимые безопасные задания', () => {
  const plan = createComparisonPlan({ provider: 'ollama', model: 'old', autoApprove: true }, ['a', 'b', 'a']);
  assert.deepEqual(plan.map(item => item.model), ['a', 'b']);
  assert.equal(plan[0].config.autoApprove, false);
  assert.throws(() => createComparisonPlan({}, ['only']), /минимум две/);
});
test('реестр провайдеров регистрирует и перечисляет плагины', () => {
  const registry = new ProviderRegistry(fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-providers-')));
  registry.register({ id: 'plugin-custom', name: 'Custom', listModels: async () => ['demo'] });
  assert.deepEqual(registry.list(), [{ id: 'plugin-custom', name: 'Custom' }]);
  assert.equal(registry.get('plugin-custom').id, 'plugin-custom');
});
test('сравнение версий обновления корректно обрабатывает v-префикс', () => {
  assert.equal(compareVersions('v1.2.0', '1.1.9'), 1);
  assert.equal(compareVersions('1.0.0', 'v1.0.0'), 0);
  assert.equal(compareVersions('1.0.0', '1.0.1'), -1);
});
test('ошибка подготовки или запуска очищает временные данные', async () => {
  const manager = new TerminalManager(() => {}, () => { throw new Error('Не запущен'); });
  await assert.rejects(manager.start(async () => { throw new Error('Ошибка настроек'); }), /настроек/);
  await assert.rejects(manager.start(async () => ({ file: 'hermes', args: [] })), /Не запущен/);
});
test('парсер сессий извлекает названия с пробелами и ANSI', () => {
  const sessions = parseSessions('Title  Source  Updated  ID\n\x1b[32mТест проекта  cli  2 hours ago  20260904_120000_abc\x1b[0m');
  assert.deepEqual(sessions, [{ id: '20260904_120000_abc', title: 'Тест проекта' }]);
});
test('главный процесс загружается без исключений и без дублей IPC-каналов', () => {
  const root = path.join(__dirname, '..');
  const handlers = bootMainProcess(root);
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  for (const match of preload.matchAll(/ipcRenderer\.(invoke|send)\('([^']+)'/g)) {
    assert.ok(handlers.has(match[2]), `Нет обработчика ${match[2]}`);
  }
});

test('рендерер не вызывает window.prompt, который не поддержан в Electron', () => {
  const rendererDir = path.join(__dirname, '..', 'renderer');
  const modulesDir = path.join(rendererDir, 'modules');
  const moduleFiles = fs.existsSync(modulesDir) ? fs.readdirSync(modulesDir).map(f => path.join(modulesDir, f)) : [];
  const allFiles = [path.join(rendererDir, 'renderer.js'), ...moduleFiles];

  for (const file of allFiles) {
    const source = fs.readFileSync(file, 'utf8');
    assert.ok(!/window\.prompt\s*\(/.test(source), `window.prompt найден в ${path.basename(file)} — используйте askText`);
  }
});

// Загружает main.js вне Electron: заглушки повторяют поведение ipcMain
// (повторная регистрация канала — ошибка) и не создают окно, поэтому тест ловит
// падение главного процесса при старте.
function bootMainProcess(root) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-boot-'));
  const handlers = new Set();
  const win = {
    isDestroyed: () => false,
    isMinimized: () => false,
    setMenuBarVisibility() {}, show() {}, hide() {}, focus() {}, restore() {}, loadURL() {}, on() {},
    webContents: { send() {}, on() {}, getURL: () => 'about:blank', setWindowOpenHandler() {} }
  };
  const app = {
    isQuitting: false,
    isPackaged: false,
    getPath: () => userData,
    getVersion: () => '0.0.0-test',
    getName: () => 'Hermes Launcher',
    getAppPath: () => root,
    on() {}, once() {}, quit() {}, setAppUserModelId() {},
    whenReady: () => new Promise(() => {}),
    requestSingleInstanceLock: () => true,
    setLoginItemSettings() {},
    getLoginItemSettings: () => ({ openAtLogin: false })
  };
  const electron = {
    app,
    ipcMain: {
      handle(channel) {
        if (handlers.has(channel)) throw new Error(`Повторная регистрация IPC-канала: ${channel}`);
        handlers.add(channel);
      },
      on(channel) { handlers.add(channel); },
      removeHandler() {}
    },
    BrowserWindow: function BrowserWindow() { return win; },
    Tray: function Tray() { this.setToolTip = () => {}; this.setContextMenu = () => {}; },
    Menu: { buildFromTemplate: () => ({}) },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }), showMessageBox: async () => ({ response: 0 }) },
    clipboard: { readText: () => '', writeText() {} },
    safeStorage: { isEncryptionAvailable: () => false, encryptString: () => Buffer.from(''), decryptString: () => '' },
    shell: { openExternal: async () => {} },
    Notification: function Notification() {}
  };
  const entry = require.resolve(path.join(root, 'main.js'));
  const originalLoad = Module._load;
  Module._load = function (request) {
    if (request === 'electron') return electron;
    if (request === 'node-pty') return { spawn: () => ({ pid: 1, onData() {}, onExit() {}, write() {}, resize() {}, kill() {} }) };
    if (request === 'electron-updater') return { autoUpdater: { on: () => {}, checkForUpdates: async () => null, setFeedURL: () => {} } };
    return originalLoad.apply(this, arguments);
  };
  try {
    require(entry);
  } finally {
    Module._load = originalLoad;
    delete require.cache[entry];
  }
  return handlers;
}


test('проверка версии отделяет traceback от короткой подписи', () => {
  const { summarizeVersion } = require('../lib/commands');
  const result = summarizeVersion({ ok: true, output: 'Hermes Agent v0.2.1.0 (2026.8.31)\nInstall directory: C:\\test', diagnostic: 'Exception in thread\nUnicodeDecodeError: utf-8' });
  assert.equal(result.output, 'Hermes Agent v0.2.1.0');
  assert.equal(result.warning, true);
  assert.ok(result.diagnostic.includes('UnicodeDecodeError'));
  assert.ok(!result.output.includes('Exception'));
});

test('CHANGELOG содержит текущую версию и раздел Unreleased', () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
  assert.match(changelog, /#\s*Changelog/i);
  assert.match(changelog, /##\s*\[Unreleased\]|##\s*Unreleased/i);
  assert.match(changelog, new RegExp(`##\\s*\\[${pkg.version}\\]`));
});

test('проверка готовности запуска описывает причину блокировки', () => {
  const projectFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-readiness-'));
  try {
    assert.equal(buildLaunchReadiness({ projectFolder, model: '', provider: 'ollama' }).ok, false);
    assert.match(buildLaunchReadiness({ projectFolder, model: 'qwen', provider: 'ollama' }).summary, /готов/i);
    assert.ok(buildLaunchReadiness({ projectFolder: '', model: 'qwen', provider: 'ollama' }).details.some(item => /папке/i.test(item.text)));
    assert.ok(buildLaunchReadiness({ projectFolder, model: 'qwen', provider: 'ollama', hermesPath: path.join(projectFolder, 'missing-hermes.exe') }).details.some(item => /абсолютный|существующему исполняемому/i.test(item.text)));
  } finally {
    fs.rmSync(projectFolder, { recursive: true, force: true });
  }
});

test('сравнение версий по числам корректно определяет новейшие версии (1.10.0 > 1.9.0)', () => {
  const { compareVersions } = require('../lib/updater');
  assert.equal(compareVersions('1.10.0', '1.9.0'), 1);
  assert.equal(compareVersions('1.9.0', '1.10.0'), -1);
  assert.equal(compareVersions('v1.0.3', '1.0.2'), 1);
  assert.equal(compareVersions('1.0.3', 'v1.0.3'), 0);
  assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
});

test('конфигурация publish и nsis в package.json корректно настроена для GitHub Releases', () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.equal(pkg.build?.win?.target, 'nsis');
  assert.deepEqual(pkg.build?.publish, {
    provider: 'github',
    owner: 'vovik06302-ai',
    repo: 'hermes-launcher'
  });
  assert.equal(pkg.build?.artifactName, 'Hermes-Launcher-Setup-${version}.exe');
  assert.equal(pkg.build?.nsis?.oneClick, false);
  assert.equal(pkg.build?.nsis?.perMachine, false);
  assert.equal(pkg.build?.nsis?.allowToChangeInstallationDirectory, true);
  assert.equal(pkg.build?.nsis?.uninstallDisplayName, 'Hermes Launcher');
  assert.equal(pkg.build?.nsis?.artifactName, 'Hermes-Launcher-Setup-${version}.exe');
  assert.ok(pkg.dependencies?.['electron-updater']);
  assert.equal(pkg.repository?.type, 'git');
  assert.ok(pkg.repository?.url?.includes('hermes-launcher'));
});

test('миграция переносит пользовательские данные из portable-директории в userData', () => {
  const { migratePortableData } = require('../lib/data-migration');
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-migration-test-'));
  const portableDir = path.join(tempDir, 'portable');
  const userDataDir = path.join(tempDir, 'userData');

  try {
    fs.mkdirSync(portableDir, { recursive: true });
    fs.writeFileSync(path.join(portableDir, 'config.json'), JSON.stringify({ model: 'migrated-model' }), 'utf8');
    fs.writeFileSync(path.join(portableDir, 'api-keys.json'), JSON.stringify({ openai: 'secret' }), 'utf8');

    const previousEnv = process.env.PORTABLE_EXECUTABLE_DIR;
    process.env.PORTABLE_EXECUTABLE_DIR = portableDir;

    try {
      migratePortableData(userDataDir, { info() {}, warn() {}, error() {} });

      assert.ok(fs.existsSync(path.join(userDataDir, 'config.json')));
      assert.ok(fs.existsSync(path.join(userDataDir, 'api-keys.json')));
      assert.equal(JSON.parse(fs.readFileSync(path.join(userDataDir, 'config.json'), 'utf8')).model, 'migrated-model');
      assert.ok(fs.existsSync(path.join(userDataDir, '.portable-migrated')));
    } finally {
      process.env.PORTABLE_EXECUTABLE_DIR = previousEnv;
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('версия приложения читается из package.json и передается через IPC config:get (включая установленную сборку)', async () => {
  const root = path.join(__dirname, '..');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const { getAppVersion, registerIpcHandlers } = require('../lib/app-ipc');

  // Проверка прямого чтения из package.json
  const defaultVersion = getAppVersion();
  assert.equal(defaultVersion, pkg.version);

  // Проверка поведения при установленной сборке через app.getAppPath()
  const mockPackagedApp = {
    isPackaged: true,
    getAppPath: () => root,
    getVersion: () => 'fallback-should-not-be-used'
  };
  const packagedVersion = getAppVersion(mockPackagedApp);
  assert.equal(packagedVersion, pkg.version);

  // Проверка через вызов IPC-обработчика config:get
  const handlers = new Map();
  const mockIpcMain = {
    handle(channel, fn) { handlers.set(channel, fn); },
    on() {}
  };
  const mockWin = {
    webContents: { getURL: () => 'app://hermes' },
    isDestroyed: () => false
  };
  const mockStore = { load: () => ({ model: 'test' }) };

  registerIpcHandlers({
    ipcMain: mockIpcMain,
    app: mockPackagedApp,
    dialog: {},
    clipboard: {},
    logger: { error() {} },
    store: mockStore,
    apiKeys: { get: () => null },
    providerRegistry: { get: () => null },
    processManager: {},
    providerManager: {},
    terminalPool: { get: () => null },
    terminal: { state: 'idle' },
    modelCache: new Map(),
    comparisonQueue: {},
    updateManager: {},
    github: {},
    winRef: () => mockWin,
    providerConfig: {},
    sessionServices: {},
    updater: {}
  });

  const trustedEvent = {
    sender: mockWin.webContents,
    senderFrame: { url: 'app://hermes' }
  };

  const configHandler = handlers.get('config:get');
  assert.ok(typeof configHandler === 'function', 'Обработчик config:get должен быть зарегистрирован');
  const response = await configHandler(trustedEvent);
  assert.equal(response.ok, true);
  assert.equal(response.version, pkg.version);
});

