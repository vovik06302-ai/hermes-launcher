'use strict';
const http = require('http');
const https = require('https');
const { run } = require('./commands');
function getJson(address, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(address);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return reject(new Error('Требуется HTTP(S)-адрес без пароля.'));
    const req = (url.protocol === 'https:' ? https : http).get(url, { headers }, res => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`Сервер вернул HTTP ${res.statusCode}`)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', data => { body += data; if (body.length > 2 * 1024 * 1024) req.destroy(new Error('Слишком большой ответ сервера.')); });
      res.on('error', reject);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Сервер вернул некорректный JSON.')); } });
    });
    req.setTimeout(5000, () => req.destroy(new Error('Сервер не ответил за 5 секунд.')));
    req.on('error', reject);
  });
}
async function listModels(cfg) {
  if (cfg.provider === 'ollama') {
    const data = await getJson('http://127.0.0.1:11434/api/tags');
    if (!Array.isArray(data.models)) throw new Error('Некорректный список моделей Ollama.');
    return data.models.map(m => m.name).filter(n => typeof n === 'string');
  }
  if (['lmstudio', 'llm', 'llamacpp', 'vllm'].includes(cfg.provider)) {
    const defaults = { lmstudio: 'http://127.0.0.1:1234/v1', llamacpp: 'http://127.0.0.1:8081/v1', vllm: 'http://127.0.0.1:8001/v1' };
    const base = cfg.provider === 'llm' ? cfg.localBaseUrl : (cfg.apiBaseUrl || defaults[cfg.provider]);
    const headers = cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {};
    const data = await getJson(base.replace(/\/$/, '') + '/models', headers);
    if (!Array.isArray(data.data)) throw new Error('Ожидается OpenAI-совместимый список моделей (data).');
    return data.data.map(m => m.id).filter(n => typeof n === 'string');
  }
  if (cfg.provider === 'gemini') {
    if (!cfg.apiKey) throw new Error('Сначала сохраните API-ключ Gemini.');
    const base = cfg.apiBaseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const data = await getJson(base.replace(/\/$/, '') + '/models', { 'x-goog-api-key': cfg.apiKey });
    if (!Array.isArray(data.models)) throw new Error('Google Gemini вернул некорректный список моделей.');
    return data.models.filter(model => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent')).map(model => model.baseModelId || String(model.name || '').replace(/^models\//, '')).filter(id => /^(gemini|gemma)-[a-z0-9.-]+$/i.test(id)).sort((a, b) => Number(/^gemini-/i.test(b)) - Number(/^gemini-/i.test(a)) || a.localeCompare(b));
  }
  if (['openai', 'claude', 'kilocode'].includes(cfg.provider)) {
    const base = cfg.apiBaseUrl || (cfg.provider === 'openai' ? 'https://api.openai.com/v1' : cfg.provider === 'claude' ? 'https://api.anthropic.com/v1' : '');
    if (!base) throw new Error('Укажите базовый URL API провайдера.');
    if (!cfg.apiKey) throw new Error('Сначала сохраните API-ключ.');
    const headers = cfg.provider === 'claude' ? { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' } : { Authorization: `Bearer ${cfg.apiKey}` };
    const data = await getJson(base.replace(/\/$/, '') + '/models', headers);
    if (!Array.isArray(data.data)) throw new Error('Ожидается API-совместимый список моделей (data).');
    return data.data.map(model => model.id).filter(id => typeof id === 'string');
  }
  return [];
}
async function unload(provider) {
  if (provider === 'lmstudio') {
    const result = await run('lms', ['unload', '--all']);
    if (!result.ok) throw new Error(result.error);
    return;
  }
  if (provider !== 'ollama') throw new Error('Выгрузка доступна для Ollama и LM Studio.');
  const data = await getJson('http://127.0.0.1:11434/api/ps');
  if (!Array.isArray(data.models)) throw new Error('Некорректный ответ Ollama.');
  for (const model of data.models) {
    const result = await run('ollama', ['stop', model.name]);
    if (!result.ok) throw new Error(result.error);
  }
}
module.exports = { getJson, listModels, unload };
