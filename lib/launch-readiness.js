'use strict';
const fs = require('fs');
const path = require('path');

function buildLaunchReadiness(cfg = {}) {
  const checks = [];
  const normalized = cfg || {};
  const projectFolder = String(normalized.projectFolder || '').trim();
  const model = String(normalized.model || '').trim();
  const hermesPath = String(normalized.hermesPath || '').trim();

  if (!projectFolder) {
    checks.push({ text: 'Папка проекта не выбрана. Укажите каталог, в котором запускается Hermes.', ok: false });
  } else if (!fs.existsSync(projectFolder)) {
    checks.push({ text: 'Папка проекта не существует или недоступна. Проверьте путь перед запуском.', ok: false });
  } else {
    checks.push({ text: 'Папка проекта готова.', ok: true });
  }

  if (!model) {
    checks.push({ text: 'Модель не выбрана. Укажите модель или загрузите список доступных моделей.', ok: false });
  } else {
    checks.push({ text: `Модель ${model} выбрана.`, ok: true });
  }

  if (!hermesPath) {
    checks.push({ text: 'Путь к Hermes не задан. Будет выполнен автоматический поиск в PATH или стандартной папке Windows.', ok: true });
  } else if (!path.isAbsolute(hermesPath) || !fs.existsSync(hermesPath) || !fs.statSync(hermesPath).isFile()) {
    checks.push({ text: 'Путь к Hermes должен быть абсолютным и вести к существующему исполняемому файлу.', ok: false });
  } else {
    checks.push({ text: 'Исполняемый файл Hermes найден.', ok: true });
  }

  const ok = checks.every(item => item.ok);
  const summary = ok ? 'Запуск Hermes готов к выполнению.' : 'Запуск Hermes заблокирован по одной или нескольким причинам.';

  return { ok, summary, details: checks };
}

module.exports = { buildLaunchReadiness };
