'use strict';
const https = require('https');

// Резервный адрес манифеста: используется, когда URL не передан явно
// (например, вызов из main.js при автопроверке обновлений при старте).
const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/vovik06302-ai/hermes-launcher/main/metadata.json';

function compareVersions(left, right) {
  const parse = value => String(value).replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const a = parse(left); const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1;
  return 0;
}
function fetchManifest(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch { reject(new Error('Некорректный URL манифеста.')); return; }
    if (parsed.protocol !== 'https:') { reject(new Error('Манифест обновления должен загружаться по HTTPS.')); return; }
    const request = https.get(parsed, { headers: { Accept: 'application/json' } }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`Сервер обновлений вернул HTTP ${response.statusCode}.`)); return; }
      let body = ''; response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; if (body.length > 1024 * 1024) request.destroy(new Error('Манифест слишком большой.')); });
      response.on('end', () => { try { const data = JSON.parse(body); if (!data.version || !data.url) throw new Error('В манифесте нет version или url.'); resolve(data); } catch (error) { reject(error); } });
    });
    request.setTimeout(5000, () => request.destroy(new Error('Сервер обновлений не ответил.')));
    request.on('error', reject);
  });
}
async function checkLauncherUpdate(currentVersion, manifestUrl) {
  // Динамический поиск в exports: тесты могут подменять fetchManifest на объекте модуля (require cache),
  // а прямое обращение к локальной функции такой подмены не увидело бы.
  const manifest = await module.exports.fetchManifest(manifestUrl || DEFAULT_MANIFEST_URL);
  return { available: compareVersions(manifest.version, currentVersion) > 0, version: manifest.version, url: manifest.url, notes: String(manifest.notes || '') };
}

module.exports = { compareVersions, fetchManifest, checkLauncherUpdate };
