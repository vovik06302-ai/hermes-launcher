'use strict';
const fs = require('fs');
const path = require('path');

function createLogger(directory) {
  const file = path.join(directory, 'hermes-launcher.log');
  function write(level, message, error) {
    const detail = error?.stack || error?.message || '';
    const line = `${new Date().toISOString()} [${level}] ${String(message)}${detail ? `\n${detail}` : ''}\n`;
    try {
      fs.mkdirSync(directory, { recursive: true });
      fs.appendFileSync(file, line, 'utf8');
      const stat = fs.statSync(file);
      if (stat.size > 2 * 1024 * 1024) fs.renameSync(file, `${file}.old`);
    } catch { /* Логирование не должно ломать работу приложения. */ }
  }
  return { info: (message) => write('INFO', message), warn: (message) => write('WARN', message), error: (message, error) => write('ERROR', message, error) };
}

module.exports = { createLogger };
