'use strict';
const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
function run(file, args = [], timeout = 20000, cwd) {
  return new Promise(resolve => execFile(file, args, { cwd, windowsHide: true, timeout, maxBuffer: 10 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8', NO_COLOR: '1' } }, (error, stdout, stderr) => {
    resolve({ ok: !error, output: stdout.trim(), error: error ? (stderr.trim() || error.message) : '', diagnostic: stderr.trim() });
  }));
}
function runStreaming(file, args = [], timeout = 20000, cwd, onChunk = () => {}) {
  return new Promise(resolve => {
    const child = spawn(file, args, { cwd, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8', NO_COLOR: '1' } });
    let output = '';
    let errorOutput = '';
    let settled = false;
    const finish = (result) => { if (!settled) { settled = true; clearTimeout(timer); resolve(result); } };
    const timer = setTimeout(() => { child.kill(); finish({ ok: false, output: output.trim(), error: `Превышено время ожидания: ${file}` }); }, timeout);
    child.stdout.on('data', data => { const text = data.toString(); output += text; onChunk(text, 'stdout'); });
    child.stderr.on('data', data => { const text = data.toString(); errorOutput += text; onChunk(text, 'stderr'); });
    child.on('error', error => finish({ ok: false, output: output.trim(), error: error.message }));
    child.on('close', code => finish({ ok: code === 0, output: output.trim(), error: code === 0 ? '' : (errorOutput.trim() || `Код завершения: ${code}`), diagnostic: errorOutput.trim() }));
  });
}
async function resolveHermes(config) {
  if (config.hermesPath.trim()) {
    const file = config.hermesPath.trim();
    if (!path.isAbsolute(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error('Укажите существующий абсолютный путь к Hermes.');
    return file;
  }
  const found = await run(process.platform === 'win32' ? 'where.exe' : 'which', ['hermes']);
  if (found.ok) {
    const file = found.output.split(/\r?\n/).find(p => !/\.(bat|cmd)$/i.test(p));
    if (file) return file;
  }
  const fallback = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'hermes', 'bin', 'hermes.exe');
  if (process.platform === 'win32' && fs.existsSync(fallback)) return fallback;
  throw new Error('Hermes не найден. Укажите путь к исполняемому файлу в настройках.');
}
function providerName(cfg) {
  const names = { ollama: 'ollama', openai: 'openai', llamacpp: 'openai', vllm: 'openai', gemini: 'gemini', claude: 'anthropic', kilocode: 'kilo', lmstudio: cfg.lmstudioProvider, llm: cfg.localProvider };
  let name = names[cfg.provider];
  if (!name && typeof cfg.provider === 'string' && /^plugin-[a-z0-9-]+$/.test(cfg.provider)) {
    name = cfg.provider.slice('plugin-'.length);
  }
  if (!name || !/^[a-zA-Z0-9_.:-]+$/.test(name)) throw new Error('Укажите имя провайдера, настроенного в Hermes.');
  return name;
}
function launchArgs(cfg, sessionId) {
  if (!cfg.model.trim()) throw new Error('Выберите или введите модель.');
  const args = ['chat', '--cli', '-m', cfg.model.trim(), '--provider', providerName(cfg)];
  if (cfg.projectFolder) args.push('--in', cfg.projectFolder);
  if (sessionId) {
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('Некорректный идентификатор сессии.');
    args.push('--resume', sessionId);
  }
  if (cfg.autoApprove) args.push('--yolo');
  return args;
}
async function syncContext(file, cfg) {
  // Compression must use the full configured window; reducing it below 64K
  // makes Hermes reject the auxiliary model before it can compact the session.
  const compressionContext = cfg.contextLength;
  const compressionModel = cfg.model || 'qwen35b-limited-64k:latest';
  const settings = [['model.context_length', cfg.contextLength], ['model.ollama_num_ctx', cfg.contextLength], ['auxiliary.compression.model', compressionModel], ['auxiliary.compression.context_length', compressionContext]];
  if (cfg.provider === 'gemini') {
    settings.push(['model.provider', 'gemini'], ['model.base_url', cfg.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta']);
  }
  for (const [key, value] of settings) {
    const result = await run(file, ['config', 'set', key, String(value)], 30000);
    if (!result.ok) throw new Error(`Не удалось настроить ${key}: ${result.error}`);
  }
}
function parseSessions(output) {
  const sessions = [];
  for (const raw of output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').split(/\r?\n/)) {
    const line = raw.trim();
    const match = line.match(/(\d{8}_\d{6}_[0-9a-z]+)\s*$/i);
    if (!match) continue;
    const prefix = line.slice(0, match.index).trim();
    const title = prefix.split(/\s{2,}/)[0] || match[1];
    sessions.push({ id: match[1], title });
  }
  return sessions;
}
function summarizeVersion(result) {
  const diagnostic = [result.output, result.diagnostic, result.error].filter(Boolean).join('\n');
  const version = diagnostic.match(/Hermes(?: Agent)?\s+v?\d+(?:\.\d+){2,3}(?:[-+][\w.]+)?/i);
  const warning = !result.ok || /Traceback|Exception|UnicodeDecodeError/i.test(diagnostic);
  return { output: version ? version[0] : 'Версия Hermes не определена', diagnostic: diagnostic.slice(0, 20000), warning };
}
module.exports = { run, runStreaming, resolveHermes, launchArgs, syncContext, parseSessions, summarizeVersion };
