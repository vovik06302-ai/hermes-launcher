'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};
  const state = {
    cfg: null,
    displayedProvider: '',
    sessions: [],
    sessionsVisibleCount: 100,
    selectedId: null,
    processState: 'idle',
    busy: false,
    modelsRequest: 0,
    sessionsRequest: 0,
    terminalWriteQueue: '',
    terminalFlushTimer: null,
    lastLaunchConfig: null,
    recoveryTimer: null,
    recoveryAttempted: false,
    metricsTimer: null,
    sessionStartedAt: 0,
    gpuTimer: null,
    terminalTabs: [{ id: 'default', state: 'idle', pid: null }],
    activeTerminalId: 'default',
    searchTimer: null,
    saveTimer: null,
    commands: [
      ['Запустить Hermes', () => { const btn = document.getElementById('launchBtn'); if (btn) btn.click(); }],
      ['Остановить процесс', () => { const btn = document.getElementById('killTermBtn'); if (btn) btn.click(); }],
      ['Повторить последний запуск', () => { const btn = document.getElementById('retryBtn'); if (btn) btn.click(); }],
      ['Обновить модели', () => { const btn = document.getElementById('refreshModelsBtn'); if (btn) btn.click(); }],
      ['Проверить окружение', () => { const btn = document.getElementById('diagnosticsBtn'); if (btn) btn.click(); }],
      ['Сохранить настройки', () => { const btn = document.getElementById('saveBtn'); if (btn) btn.click(); }],
      ['Экспортировать лог', () => { const btn = document.getElementById('exportLogsBtn'); if (btn) btn.click(); }],
      ['GitHub: получить изменения', () => { const btn = document.getElementById('githubPullBtn'); if (btn) btn.click(); }],
      ['GitHub: отправить изменения', () => { const btn = document.getElementById('githubPushBtn'); if (btn) btn.click(); }],
      ['Показать очередь сравнения', async () => {
        if (root.HermesUI && root.HermesUI.call) {
          const result = await root.HermesUI.call('comparisonQueue');
          if (root.HermesUI.notify) root.HermesUI.notify.log(`Очередь: выполняется ${result.running}, ожидает ${result.pending.length}.`);
        }
      }]
    ],
    UI_TIMINGS: Object.freeze({ autoSaveMs: 900, searchDebounceMs: 180 }),
    uiThemes: {
      aurora: { name: 'Сияние', background: '#0e0e13', foreground: '#e8e6e1', cursor: '#f5a623', selectionBackground: '#39301e' },
      neon: { name: 'Неон', background: '#050814', foreground: '#e8fbff', cursor: '#00f0ff', selectionBackground: '#2a1040' },
      sunset: { name: 'Закат', background: '#140a0e', foreground: '#ffe9df', cursor: '#ff7a45', selectionBackground: '#4a2018' },
      ocean: { name: 'Океан', background: '#041018', foreground: '#def7ff', cursor: '#2ee6c5', selectionBackground: '#0e3a48' },
      forest: { name: 'Хвоя', background: '#08140c', foreground: '#e8f6dc', cursor: '#8cff6b', selectionBackground: '#1a3a18' },
      candy: { name: 'Конфета', background: '#120c18', foreground: '#ffedfb', cursor: '#ff7ad9', selectionBackground: '#3a2048' },
      ember: { name: 'Лава', background: '#100806', foreground: '#ffe8d8', cursor: '#ff5a3d', selectionBackground: '#4a1810' },
      amethyst: { name: 'Аметист', background: '#0c0818', foreground: '#f0e8ff', cursor: '#b57bff', selectionBackground: '#2e1a58' }
    },
    states: { idle: 'Готов', starting: 'Запускается…', running: 'Работает', stopping: 'Останавливается…', error: 'Ошибка' }
  };
  root.HermesUI.state = state;
  if (typeof module !== 'undefined' && module.exports) module.exports = state;
})(typeof window !== 'undefined' ? window : globalThis);
