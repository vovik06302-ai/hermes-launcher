'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterAndSortSessions,
  collectConfigFromForm,
  applyProjectProfile,
  formatLaunchStatus,
  formatAppVersion
} = require('../renderer/modules/logic');

test('filterAndSortSessions фильтрует по заголовку и ID и сортирует по дате/названию', () => {
  const sessions = [
    { id: '20260901_100000_aaa', title: 'Альфа проект' },
    { id: '20260902_100000_bbb', title: 'Бета задача' },
    { id: '20260903_100000_ccc', title: 'Гамма тесты' }
  ];

  const searchResult = filterAndSortSessions(sessions, 'Бета');
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].id, '20260902_100000_bbb');

  const titleSorted = filterAndSortSessions(sessions, '', 'title');
  assert.equal(titleSorted[0].title, 'Альфа проект');
  assert.equal(titleSorted[2].title, 'Гамма тесты');

  const descSorted = filterAndSortSessions(sessions, '', 'id-desc');
  assert.equal(descSorted[0].id, '20260903_100000_ccc');
});

test('collectConfigFromForm корректно собирает конфигурацию из значений формы', () => {
  const baseCfg = { provider: 'ollama', model: 'llama3:8b', providerModels: {} };
  const formValues = {
    provider: 'openai',
    model: 'gpt-4o',
    maxTokens: '4096',
    contextLength: '64000',
    autoApprove: true,
    disableUpdateCheck: false,
    projectFolder: 'C:\\Projects\\App'
  };

  const result = collectConfigFromForm(formValues, baseCfg);
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-4o');
  assert.equal(result.maxTokens, 4096);
  assert.equal(result.contextLength, 64000);
  assert.equal(result.autoApprove, true);
  assert.equal(result.projectFolder, 'C:\\Projects\\App');
  assert.equal(result.providerModels.openai, 'gpt-4o');
});

test('applyProjectProfile применяет сохранённый профиль для папки проекта', () => {
  const cfg = {
    projectFolder: '',
    projectProfiles: {
      'C:\\Projects\\Demo': { provider: 'gemini', model: 'gemini-1.5-pro', maxTokens: 8192 }
    }
  };

  const applied = applyProjectProfile(cfg, 'C:\\Projects\\Demo');
  assert.equal(applied.provider, 'gemini');
  assert.equal(applied.model, 'gemini-1.5-pro');
  assert.equal(applied.maxTokens, 8192);
  assert.equal(applied.projectFolder, 'C:\\Projects\\Demo');
});

test('formatLaunchStatus возвращает корректный текст и уровень статуса', () => {
  assert.deepEqual(formatLaunchStatus('running', 'qwen', 'Ollama'), {
    text: 'Hermes работает: qwen · Ollama',
    state: 'ok'
  });
  assert.deepEqual(formatLaunchStatus('starting'), {
    text: 'Hermes запускается и инициализирует сессию…',
    state: 'warning'
  });
  assert.deepEqual(formatLaunchStatus('error'), {
    text: 'Hermes завершился с ошибкой. Проверьте диагностику и последние строки терминала.',
    state: 'error'
  });
  assert.deepEqual(formatLaunchStatus('idle'), {
    text: 'Готово к запуску. Проверка окружения поможет быстро найти проблемы.',
    state: 'idle'
  });
});

test('formatAppVersion корректно форматирует версию в формат v1.0.3 для шапки', () => {
  assert.equal(formatAppVersion('1.0.3'), 'v1.0.3');
  assert.equal(formatAppVersion('v1.0.3'), 'v1.0.3');
  assert.equal(formatAppVersion(' 1.0.3 '), 'v1.0.3');
  assert.equal(formatAppVersion(''), '');
  assert.equal(formatAppVersion(null), '');
  assert.equal(formatAppVersion(undefined), '');
});

