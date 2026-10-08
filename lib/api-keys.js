'use strict';
const fs = require('fs');
const path = require('path');

let safeStorage = null;
try {
  safeStorage = require('electron').safeStorage;
} catch (e) {
  safeStorage = null;
}

function createApiKeyStore(directory) {
  const file = path.join(directory, 'api-keys.json');
  function read() {
    if (!fs.existsSync(file)) return {};
    try {
      const content = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error('Данные ключей не являются объектом');
    } catch (err) {
      const corruptFile = `${file}.corrupt`;
      try {
        fs.copyFileSync(file, corruptFile);
      } catch (_) {}
      throw new Error(`Повреждён файл хранилища API-ключей (${path.basename(file)}): ${err.message}. Повреждённый файл сохранён как ${path.basename(corruptFile)}.`);
    }
  }
  function write(data) {
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(temporary, file);
  }
  return {
    set(provider, key) {
      if (!/^[a-z0-9-]+$/.test(String(provider)) || typeof key !== 'string' || !key.trim() || key.length > 4096) throw new Error('Некорректный API-ключ.');
      const data = read();
      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        data[provider] = safeStorage.encryptString(key.trim()).toString('base64');
      } else {
        data[provider] = Buffer.from(key.trim(), 'utf8').toString('base64');
      }
      write(data);
    },
    get(provider) {
      const value = read()[provider];
      if (!value) return '';
      try {
        if (safeStorage && safeStorage.isEncryptionAvailable()) {
          return safeStorage.decryptString(Buffer.from(value, 'base64'));
        }
        return Buffer.from(value, 'base64').toString('utf8');
      } catch { return ''; }
    },
    has(provider) { return Boolean(read()[provider]); },
    clear(provider) { const data = read(); delete data[provider]; write(data); }
  };
}
module.exports = { createApiKeyStore };
