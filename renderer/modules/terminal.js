'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  function el(id) {
    return document.getElementById(id);
  }

  let term = null;
  const terminalInstances = new Map();
  const tabUnsubscribers = new Map();

  function activeTerm() {
    const state = root.HermesUI.state || {};
    return terminalInstances.get(state.activeTerminalId) || term;
  }

  function activeProcess() {
    const state = root.HermesUI.state || {};
    return ['starting', 'running', 'stopping'].includes(state.processState);
  }

  function initTerminal() {
    if (term) return;
    const termContainer = el('terminal');
    if (!termContainer) return;

    term = new Terminal({
      fontFamily: 'Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: '#0e0e13', foreground: '#e8e6e1' }
    });
    term.open(termContainer);
    terminalInstances.set('default', term);

    bindTerminal('default', term, termContainer);

    new ResizeObserver(fitTerminal).observe(termContainer);

    setupGlobalTerminalSubscriptions();
  }

  function bindTerminal(id, instance, container) {
    instance.attachCustomKeyEventHandler(event => {
      if (event.type !== 'keydown' || !event.ctrlKey || event.altKey) return true;
      if (event.code === 'KeyC' && instance.hasSelection()) {
        root.HermesUI.call('writeClipboard', instance.getSelection())
          .catch(error => { if (root.HermesUI.notify) root.HermesUI.notify.log(error.message, true); });
        return false;
      }
      if (event.code === 'KeyV') {
        root.HermesUI.call('readClipboard')
          .then(result => instance.paste(result.text))
          .catch(error => { if (root.HermesUI.notify) root.HermesUI.notify.log(error.message, true); });
        return false;
      }
      return true;
    });

    instance.onData(data => {
      if (/(rm\s+-rf|del\s+\/s|Remove-Item\s+.*-Recurse|format\s+[a-z]:|diskpart|git\s+reset\s+--hard|git\s+clean\s+-fd|git\s+push\s+--force)/i.test(String(data)) && !window.confirm('Обнаружена потенциально опасная команда. Отправить её в Hermes?')) return;
      if (id === 'default') {
        root.api?.sendTerminalData?.(data);
      } else {
        root.api?.sendTerminalDataFor?.(id, data);
      }
    });

    container.addEventListener('contextmenu', event => {
      event.preventDefault();
      if (instance.hasSelection()) {
        root.HermesUI.call('writeClipboard', instance.getSelection())
          .catch(error => { if (root.HermesUI.notify) root.HermesUI.notify.log(error.message, true); });
      } else if (id === 'default') {
        root.HermesUI.call('readClipboard')
          .then(result => instance.paste(result.text))
          .catch(error => { if (root.HermesUI.notify) root.HermesUI.notify.log(error.message, true); });
      }
    });

    if (id !== 'default' && root.api?.onTerminalDataFor) {
      const unsub = root.api.onTerminalDataFor(id, data => instance.write(String(data)));
      if (typeof unsub === 'function') {
        tabUnsubscribers.set(id, unsub);
      }
    }
  }

  function setupGlobalTerminalSubscriptions() {
    const state = root.HermesUI.state || {};
    if (!root.api) return;

    root.api.onTerminalData(data => {
      const text = String(data);
      state.terminalWriteQueue += text;
      if (state.terminalWriteQueue.length > 500000) state.terminalWriteQueue = state.terminalWriteQueue.slice(-500000);

      if (!state.terminalFlushTimer) {
        state.terminalFlushTimer = setTimeout(() => {
          if (term) term.write(state.terminalWriteQueue);
          state.terminalWriteQueue = '';
          state.terminalFlushTimer = null;
        }, 16);
      }

      if (/(rm\s+-rf|del\s+\/s|Remove-Item\s+.*-Recurse|format\s+[a-z]:|diskpart|git\s+reset\s+--hard|git\s+clean\s+-fd|push\s+--force)/i.test(text)) {
        if (root.HermesUI.notify) root.HermesUI.notify.log('ВНИМАНИЕ: в выводе обнаружена потенциально опасная команда. Проверьте действие перед подтверждением.', true);
      }
      if (/context.{0,30}(limit|length|window)|maximum context|too many tokens|контекст.{0,30}(заполн|лимит)/i.test(text)) {
        if (root.HermesUI.notify) root.HermesUI.notify.log('Достигнут лимит контекста. Hermes должен выполнить сжатие; если этого не произошло, остановите процесс и продолжите сессию.', true);
      }
    });

    root.api.onTerminalState(event => {
      state.processState = event.state;
      if (root.HermesUI.configForm) root.HermesUI.configForm.updateControls();

      if (event.state === 'running') {
        state.sessionStartedAt = Date.now();
        startMetrics();
      }
      if (event.state === 'idle' || event.state === 'error') {
        stopMetrics();
      }
      if (event.error && root.HermesUI.notify) {
        root.HermesUI.notify.log(event.error, true);
      }
    });

    root.api.onTerminalExit(({ exitCode }) => {
      const failed = exitCode !== 0;
      state.processState = failed ? 'error' : 'idle';
      if (root.HermesUI.configForm) root.HermesUI.configForm.updateControls();

      if (root.HermesUI.notify) {
        root.HermesUI.notify.log(
          failed ? `Hermes завершился с ошибкой, код ${exitCode}. Проверьте последние строки терминала.` : `Процесс завершён, код ${exitCode}.`,
          failed
        );
      }

      if (failed && state.lastLaunchConfig && !state.recoveryAttempted) {
        state.recoveryAttempted = true;
        if (root.HermesUI.notify) root.HermesUI.notify.log('Автовосстановление: повторный запуск через 3 секунды.');
        state.recoveryTimer = setTimeout(() => {
          state.recoveryTimer = null;
          launch().catch(() => {});
        }, 3000);
      }

      if (root.HermesUI.sessions) root.HermesUI.sessions.refreshSessions();
    });
  }

  function fitTerminal() {
    const state = root.HermesUI.state || {};
    const instance = activeTerm();
    const termContainer = el('terminal');
    if (!instance || !termContainer) return;

    const screen = termContainer.querySelector('.xterm-screen');
    if (!screen) return;

    const box = screen.getBoundingClientRect();
    const cellWidth = box.width / instance.cols;
    const cellHeight = box.height / instance.rows;
    if (!cellWidth || !cellHeight) return;

    const cols = Math.max(2, Math.floor((termContainer.clientWidth - 34) / cellWidth));
    const rows = Math.max(1, Math.floor((termContainer.clientHeight - 18) / cellHeight));
    instance.resize(cols, rows);

    if (state.activeTerminalId === 'default') {
      root.api?.resizeTerminal?.(cols, rows);
    } else {
      root.api?.resizeTerminalFor?.(state.activeTerminalId, cols, rows);
    }
  }

  function createTerminalView(id) {
    const state = root.HermesUI.state || {};
    const termContainer = el('terminal');
    if (!termContainer) return null;

    const container = document.createElement('div');
    container.className = 'terminal-view';
    container.hidden = id !== state.activeTerminalId;
    termContainer.appendChild(container);

    const instance = new Terminal({
      fontFamily: 'Consolas, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: term ? term.options.theme : { background: '#0e0e13', foreground: '#e8e6e1' }
    });
    instance.open(container);
    terminalInstances.set(id, instance);
    bindTerminal(id, instance, container);
    return instance;
  }

  function showTerminalView(id) {
    const state = root.HermesUI.state || {};
    state.activeTerminalId = id;

    for (const [key] of terminalInstances) {
      const view = key === 'default' ? el('terminal')?.firstElementChild : terminalInstances.get(key)?.element?.parentElement;
      if (view) view.hidden = key !== id;
    }
    renderTerminalTabs();
    fitTerminal();
    activeTerm()?.focus();
  }

  function renderTerminalTabs() {
    const state = root.HermesUI.state || {};
    const container = el('terminalTabs');
    if (!container) return;

    container.replaceChildren();
    for (const tab of state.terminalTabs || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'terminal-tab';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(tab.id === state.activeTerminalId));
      button.textContent = `${tab.id}${tab.state === 'running' ? ' ●' : ''}`;
      button.addEventListener('click', () => showTerminalView(tab.id));
      container.appendChild(button);
    }
  }

  function closeTerminalTab(id) {
    if (id === 'default') return;
    const state = root.HermesUI.state || {};

    const unsub = tabUnsubscribers.get(id);
    if (typeof unsub === 'function') {
      unsub();
      tabUnsubscribers.delete(id);
    }

    const instance = terminalInstances.get(id);
    if (instance) {
      const parent = instance.element?.parentElement;
      if (parent) parent.remove();
      instance.dispose();
      terminalInstances.delete(id);
    }

    state.terminalTabs = (state.terminalTabs || []).filter(tab => tab.id !== id);
    if (state.activeTerminalId === id) {
      showTerminalView('default');
    } else {
      renderTerminalTabs();
    }
    root.HermesUI.call('closeTerminal', id).catch(() => {});
  }

  function stopMetrics() {
    const state = root.HermesUI.state || {};
    if (state.metricsTimer) {
      clearInterval(state.metricsTimer);
      state.metricsTimer = null;
    }
    const metricsLine = el('metricsLine');
    if (metricsLine) metricsLine.textContent = 'Ресурсы: ожидание запуска';
  }

  async function updateMetrics() {
    const state = root.HermesUI.state || {};
    try {
      const metrics = await root.HermesUI.call('getMetrics');
      const elapsed = state.sessionStartedAt ? Math.floor((Date.now() - state.sessionStartedAt) / 1000) : 0;
      const metricsLine = el('metricsLine');
      if (metricsLine) {
        metricsLine.textContent = `Ресурсы: CPU ${metrics.cpu.toFixed(1)}% · память ${metrics.memoryMb} МБ · сессия ${elapsed} с`;
      }
    } catch (error) {
      if (root.HermesUI.notify) root.HermesUI.notify.log(`Мониторинг: ${error.message}`, true);
      stopMetrics();
    }
  }

  function startMetrics() {
    const state = root.HermesUI.state || {};
    stopMetrics();
    updateMetrics();
    state.metricsTimer = setInterval(updateMetrics, 2000);
  }

  async function launch(id) {
    const state = root.HermesUI.state || {};
    if (activeProcess()) throw new Error('Сначала завершите текущую сессию.');

    if (root.HermesUI.configForm) await root.HermesUI.configForm.save();
    const launchConfig = { ...state.cfg };

    if (!id) {
      state.lastLaunchConfig = { ...launchConfig };
      state.recoveryAttempted = false;
    }

    if (term) term.clear();
    fitTerminal();

    if (id) {
      await root.HermesUI.call('resumeSession', launchConfig, id, state.activeTerminalId);
    } else {
      await root.HermesUI.call('launchHermes', launchConfig, state.activeTerminalId);
    }
    if (term) term.focus();
  }

  const terminalModule = {
    get term() { return term; },
    activeTerm,
    initTerminal,
    bindTerminal,
    fitTerminal,
    createTerminalView,
    showTerminalView,
    renderTerminalTabs,
    closeTerminalTab,
    startMetrics,
    stopMetrics,
    launch
  };

  root.HermesUI.terminal = terminalModule;
  if (typeof module !== 'undefined' && module.exports) module.exports = terminalModule;
})(typeof window !== 'undefined' ? window : globalThis);
