'use strict';
(function (root) {
  const UI = root.HermesUI;
  const el = id => document.getElementById(id);

  async function perform(action) {
    if (UI.state.busy) return;
    UI.state.busy = true;
    UI.configForm.updateControls();
    try {
      await action();
    } catch (e) {
      UI.notify.log(e.message, true);
    } finally {
      UI.state.busy = false;
      UI.configForm.updateControls();
    }
  }

  async function refreshGpuStats() {
    const result = await UI.call('getGpuStats');
    const ram = result.ram ? `RAM: ${result.ram.used}/${result.ram.total} MB` : '';
    if (el('gpu-status')) {
      el('gpu-status').textContent = result.error
        ? `${result.error} · ${ram}`
        : `VRAM: ${result.used}/${result.total} MB · GPU: ${result.util}% · ${ram}`;
    }
  }

  function setupGlobalShortcuts() {
    el('settingsBtn')?.addEventListener('click', () => {
      const settings = el('settings');
      if (!settings) return;
      settings.hidden = !settings.hidden;
      el('settingsBtn').setAttribute('aria-expanded', String(!settings.hidden));
      UI.themes.closeThemePicker();
    });

    document.addEventListener('keydown', event => {
      if (el('promptDialog') && !el('promptDialog').hidden) return;
      if (event.key === 'Escape') {
        UI.dialogs.closeCommandPalette();
        UI.themes.closeThemePicker();
        return;
      }
      if (!event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.code === 'Enter' && !['starting', 'running', 'stopping'].includes(UI.state.processState) && !UI.state.busy) {
        event.preventDefault();
        el('launchBtn')?.click();
        return;
      }
      if (event.code === 'KeyK') {
        event.preventDefault();
        UI.dialogs.openCommandPalette();
        return;
      }
      if (event.code === 'KeyR' && UI.state.lastLaunchConfig && !['starting', 'running', 'stopping'].includes(UI.state.processState) && !UI.state.busy) {
        event.preventDefault();
        el('retryBtn')?.click();
        return;
      }
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
      if (event.code === 'KeyS' && !typing) {
        event.preventDefault();
        perform(async () => {
          await UI.configForm.save();
          UI.notify.log('Настройки сохранены.');
        });
      }
    });

    el('provider')?.addEventListener('change', () => {
      if (UI.state.cfg) {
        UI.state.cfg.providerModels = UI.state.cfg.providerModels || {};
        UI.state.cfg.providerModels[UI.state.displayedProvider] = el('model')?.value.trim() || '';
      }
      UI.state.displayedProvider = el('provider')?.value || '';
      if (el('model') && UI.state.cfg) {
        el('model').value = UI.state.cfg.providerModels[UI.state.displayedProvider] || '';
      }
      UI.configForm.updateControls();
      UI.configForm.refreshApiKeyStatus();
      UI.configForm.refreshModels();
    });

    el('model')?.addEventListener('input', () => {
      UI.configForm.updateControls();
      UI.configForm.scheduleSave();
    });

    el('modelPicker')?.addEventListener('change', () => {
      if (el('modelPicker')?.value && el('model')) {
        el('model').value = el('modelPicker').value;
      }
      UI.configForm.updateControls();
    });

    el('projectSelect')?.addEventListener('change', () => {
      const folder = el('projectSelect')?.value;
      if (!folder || !UI.state.cfg) return;
      UI.state.cfg = UI.logic.applyProjectProfile(UI.configForm.readForm(), folder);
      UI.configForm.fillForm();
      UI.configForm.refreshModels();
    });

    el('browseBtn')?.addEventListener('click', () => perform(async () => {
      const result = await UI.call('chooseFolder');
      if (result.path && el('projectPath')) el('projectPath').value = result.path;
    }));

    el('addProjectBtn')?.addEventListener('click', () => perform(async () => {
      const folder = el('projectPath')?.value.trim();
      if (!folder) throw new Error('Укажите папку проекта.');
      UI.state.cfg.savedProjects = [...new Set([...(UI.state.cfg.savedProjects || []), folder])];
      await UI.configForm.save();
      UI.notify.log('Профиль проекта сохранён.');
    }));

    el('removeProjectBtn')?.addEventListener('click', () => perform(async () => {
      const folder = el('projectPath')?.value.trim();
      UI.state.cfg.savedProjects = (UI.state.cfg.savedProjects || []).filter(p => p !== folder);
      UI.state.cfg.projectProfiles = { ...(UI.state.cfg.projectProfiles || {}) };
      delete UI.state.cfg.projectProfiles[folder];
      await UI.configForm.save();
      UI.notify.log('Проект убран из списка.');
    }));

    el('saveBtn')?.addEventListener('click', () => perform(async () => {
      await UI.configForm.save();
      UI.notify.log('Настройки сохранены.');
    }));

    el('autostart-checkbox')?.addEventListener('change', () => perform(async () => {
      const result = await UI.call('setAutostart', el('autostart-checkbox').checked);
      if (el('updateStatus')) {
        el('updateStatus').textContent = result.enabled ? 'Автозапуск Windows включён.' : 'Автозапуск Windows выключен.';
      }
    }));

    el('refreshModelsBtn')?.addEventListener('click', () => perform(async () => {
      await UI.call('clearModelCache');
      await UI.configForm.refreshModels();
    }));

    el('saveModelProfileBtn')?.addEventListener('click', () => perform(async () => {
      const name = await UI.dialogs.askText({ title: 'Название профиля модели', placeholder: 'Например: Быстрый локальный' });
      if (!name?.trim()) return;
      UI.state.cfg.modelProfiles = {
        ...(UI.state.cfg.modelProfiles || {}),
        [name.trim()]: {
          provider: el('provider')?.value,
          model: el('model')?.value.trim(),
          maxTokens: Number(el('maxTokens')?.value),
          contextLength: Number(el('contextLength')?.value),
          systemPrompt: el('systemPrompt')?.value
        }
      };
      await UI.configForm.save();
      UI.configForm.modelProfileOptions();
      if (el('modelProfilePicker')) el('modelProfilePicker').value = name.trim();
      UI.notify.log(`Профиль модели сохранён: ${name.trim()}.`);
    }));

    el('compareModelsBtn')?.addEventListener('click', () => perform(async () => {
      const value = await UI.dialogs.askText({ title: 'Модели через запятую', placeholder: 'qwen:35b, llama3:8b' });
      const models = value?.split(',').map(item => item.trim()).filter(Boolean) || [];
      const result = await UI.call('createComparisonPlan', UI.configForm.readForm(), models);
      const started = [];
      for (const item of result.plan) {
        await UI.call('createTerminal', item.id);
        UI.state.terminalTabs.push({ id: item.id, state: 'starting', pid: null });
        UI.terminal.createTerminalView(item.id);
        started.push(item.id);
      }
      const queueResult = await UI.call('runModelComparison', result.plan);
      for (const item of queueResult.results || []) {
        const tab = UI.state.terminalTabs.find(current => current.id === item.id);
        if (tab) {
          tab.state = 'running';
          tab.pid = item.pid || null;
        }
      }
      UI.state.activeTerminalId = started[0] || UI.state.activeTerminalId;
      UI.terminal.renderTerminalTabs();
      UI.terminal.showTerminalView(UI.state.activeTerminalId);
      UI.notify.log(`Сравнение запущено параллельно: ${result.plan.map(item => item.model).join(', ')}. Подтверждения отключены.`);
    }));

    el('modelProfilePicker')?.addEventListener('change', () => {
      const name = el('modelProfilePicker')?.value;
      const profile = UI.state.cfg?.modelProfiles?.[name];
      if (!profile) return;
      const autoApprove = UI.state.cfg.autoApprove;
      Object.assign(UI.state.cfg, profile);
      UI.state.cfg.autoApprove = autoApprove;
      UI.configForm.fillForm();
      UI.configForm.refreshModels();
      UI.notify.log(`Профиль модели загружен: ${name}.`);
    });

    el('unloadBtn')?.addEventListener('click', () => perform(async () => {
      await UI.call('unloadProvider', el('provider')?.value);
      UI.notify.log('Модели выгружены.');
    }));

    for (const id of ['provider', 'systemPrompt', 'hermesPath', 'lmstudioProvider', 'localProvider', 'localBaseUrl', 'apiBaseUrl', 'projectPath', 'maxTokens', 'contextLength', 'autoApprove', 'disableUpdateCheck']) {
      el(id)?.addEventListener('input', () => {
        UI.configForm.scheduleSave();
        UI.configForm.refreshLaunchReadiness().catch(() => {});
      });
      el(id)?.addEventListener('change', () => {
        UI.configForm.scheduleSave();
        UI.configForm.refreshLaunchReadiness().catch(() => {});
      });
    }

    el('saveApiKeyBtn')?.addEventListener('click', () => perform(async () => {
      const key = el('apiKey')?.value.trim();
      if (!key) throw new Error('Введите API-ключ.');
      await UI.call('saveApiKey', el('provider')?.value, key);
      if (el('apiKey')) el('apiKey').value = '';
      await UI.configForm.refreshApiKeyStatus();
      await UI.configForm.refreshModels();
      UI.notify.log('API-ключ сохранён в защищённом хранилище.');
    }));

    el('pasteApiKeyBtn')?.addEventListener('click', () => perform(async () => {
      const result = await UI.call('readClipboard');
      const key = String(result.text || '').trim();
      if (!key) throw new Error('Буфер обмена пуст.');
      if (el('apiKey')) {
        el('apiKey').value = key;
        el('apiKey').focus();
      }
      UI.configForm.refreshApiKeyStatus();
      if (el('apiKeyStatus')) el('apiKeyStatus').textContent = 'Ключ вставлен из буфера. Нажмите «Сохранить ключ».';
    }));

    el('clearApiKeyBtn')?.addEventListener('click', () => perform(async () => {
      await UI.call('clearApiKey', el('provider')?.value);
      if (el('apiKey')) el('apiKey').value = '';
      await UI.configForm.refreshApiKeyStatus();
      el('modelPicker')?.replaceChildren(new Option('Выбрать из списка…', ''));
      UI.notify.log('API-ключ удалён.');
    }));

    el('launchBtn')?.addEventListener('click', () => perform(() => UI.terminal.launch()));

    el('retryBtn')?.addEventListener('click', () => perform(async () => {
      if (!UI.state.lastLaunchConfig) throw new Error('Нет завершённого запуска для повтора.');
      if (UI.terminal.term) UI.terminal.term.clear();
      UI.terminal.fitTerminal();
      if (UI.state.recoveryTimer) {
        clearTimeout(UI.state.recoveryTimer);
        UI.state.recoveryTimer = null;
      }
      await UI.call('launchHermes', { ...UI.state.lastLaunchConfig });
      if (UI.terminal.term) UI.terminal.term.focus();
    }));

    el('clearTermBtn')?.addEventListener('click', () => {
      const instance = UI.terminal.activeTerm();
      if (instance) {
        instance.clear();
        UI.notify.log('Терминал очищен.');
      }
    });

    el('interruptTermBtn')?.addEventListener('click', () => {
      const id = UI.state.activeTerminalId || 'default';
      if (id === 'default') {
        root.api?.sendTerminalData?.('\x03');
      } else {
        root.api?.sendTerminalDataFor?.(id, '\x03');
      }
      UI.notify.log('Отправлен сигнал прерывания (Ctrl+C).');
    });

    el('copyOutputBtn')?.addEventListener('click', async () => {
      const instance = UI.terminal.activeTerm();
      if (!instance) return;
      let text = instance.hasSelection() ? instance.getSelection() : '';
      if (!text && instance.buffer?.active) {
        const buf = instance.buffer.active;
        const lines = [];
        for (let i = 0; i < buf.length; i++) {
          const line = buf.getLine(i);
          if (line) lines.push(line.translateToString(true));
        }
        while (lines.length > 0 && !lines[lines.length - 1].trim()) {
          lines.pop();
        }
        text = lines.join('\n');
      }
      if (!text) {
        UI.notify.log('В терминале нет текста для копирования.');
        return;
      }
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          await UI.call('writeClipboard', text);
        }
        UI.notify.log('Вывод терминала скопирован в буфер обмена.');
      } catch (_) {
        await UI.call('writeClipboard', text);
        UI.notify.log('Вывод терминала скопирован в буфер обмена.');
      }
    });

    el('exportLogsBtn')?.addEventListener('click', () => {
      const logBox = el('logBox');
      const text = logBox ? Array.from(logBox.children, item => item.textContent).join('\n') : '';
      const blob = new Blob([text || 'Лог пуст.'], { type: 'plain/text;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `hermes-log-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
      link.click();
      URL.revokeObjectURL(link.href);
    });

    el('newTerminalBtn')?.addEventListener('click', () => perform(async () => {
      const id = `session-${Date.now().toString(36)}`;
      await UI.call('createTerminal', id);
      UI.state.terminalTabs.push({ id, state: 'idle', pid: null });
      UI.terminal.createTerminalView(id);
      UI.terminal.showTerminalView(id);
      UI.notify.log(`Вкладка терминала создана: ${id}.`);
    }));

    el('killTermBtn')?.addEventListener('click', () => perform(async () => {
      await UI.call('killTerminal');
    }));

    el('update-agent-btn')?.addEventListener('click', () => perform(async () => {
      const startedAt = Date.now();
      const timer = setInterval(() => {
        if (el('updateStatus')) {
          el('updateStatus').textContent = `Обновление Hermes… ${Math.floor((Date.now() - startedAt) / 1000)} с`;
        }
      }, 1000);
      if (el('agent-update-log')) el('agent-update-log').textContent = 'Обновление Hermes Agent… 0 с';
      try {
        const result = await UI.call('updateHermes', UI.configForm.readForm());
        if (el('agent-update-log')) el('agent-update-log').textContent = result.output || 'Обновление завершено.';
        UI.notify.log(result.output || 'Обновление завершено.');
        const version = await UI.call('getHermesVersion', UI.configForm.readForm());
        UI.notify.showVersion(version);
      } catch (e) {
        if (el('agent-update-log')) el('agent-update-log').textContent = `Обновление не завершено: ${e.message}`;
        throw e;
      } finally {
        clearInterval(timer);
      }
    }));

    el('diagnosticsBtn')?.addEventListener('click', () => perform(async () => {
      if (el('updateStatus')) el('updateStatus').textContent = 'Проверка окружения…';
      const result = await UI.call('runDiagnostics', UI.configForm.readForm());
      const failed = (result.checks || []).filter(check => !check.ok);
      const text = (result.checks || []).map(check => `${check.ok ? '✓' : '✗'} ${check.name}: ${check.detail}`).join(' · ');
      if (el('updateStatus')) el('updateStatus').textContent = text;
      UI.notify.setRuntimeStatus(
        failed.length ? `Диагностика: ${failed.length} проблем требует внимания.` : 'Диагностика: окружение в порядке.',
        failed.length ? 'warning' : 'ok'
      );
      UI.notify.log(failed.length ? `Диагностика: проблем найдено ${failed.length}.` : 'Диагностика: всё готово.');
    }));

    let updaterState = 'idle';

    el('update-launcher-btn')?.addEventListener('click', () => perform(async () => {
      const btn = el('update-launcher-btn');
      const log = el('launcher-update-log');
      const progressContainer = el('update-progress-container');
      const progressStage = el('update-progress-stage');
      const progressBar = el('update-progress-bar');
      const progressPercent = el('update-progress-percent');

      if (updaterState === 'idle') {
        if (btn) btn.disabled = true;
        if (log) log.textContent = 'Проверка обновлений…';
        try {
          const result = await UI.call('updaterCheck');
          if (result.disabled) {
            if (btn) {
              btn.disabled = true;
              btn.title = result.message || 'Обновление работает только в установленной версии';
            }
            if (log) log.textContent = result.message || 'Обновление работает только в установленной версии';
            return;
          }

          if (!result.ok) {
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Проверить обновление';
            }
            const msg = result.error || result.message || 'Ошибка проверки обновления';
            if (log) log.textContent = msg;
            UI.notify.log(msg, true);
            return;
          }

          if (result.available) {
            updaterState = 'ready_to_download';
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Обновить';
            }
            if (log) log.textContent = `Есть обновление ${result.version}`;
            UI.notify.log(`Доступно обновление: ${result.version}`);
          } else {
            updaterState = 'idle';
            if (btn) {
              btn.disabled = false;
              btn.textContent = 'Проверить обновление';
            }
            if (log) log.textContent = 'Установлена последняя версия';
            UI.notify.log('Установлена последняя версия');
          }
        } catch (e) {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Проверить обновление';
          }
          if (log) log.textContent = e.message;
          UI.notify.log(e.message, true);
        }
      } else if (updaterState === 'ready_to_download') {
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Загрузка…';
        }
        if (log) log.textContent = 'Загрузка обновления…';
        if (progressContainer) progressContainer.hidden = false;
        if (progressStage) progressStage.textContent = 'Загрузка обновления…';
        if (progressBar) progressBar.value = 0;
        if (progressPercent) progressPercent.textContent = '0%';

        try {
          await UI.call('updaterDownload');
        } catch (e) {
          updaterState = 'ready_to_download';
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Обновить';
          }
          if (log) log.textContent = e.message;
          UI.notify.log(e.message, true);
        }
      } else if (updaterState === 'ready_to_install') {
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Установка…';
        }
        if (log) log.textContent = 'Остановка сервисов и установка обновления…';
        try {
          await UI.call('updaterInstall');
        } catch (e) {
          updaterState = 'ready_to_install';
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Перезапустить и установить';
          }
          if (log) log.textContent = e.message;
          UI.notify.log(e.message, true);
        }
      }
    }));

    if (root.api?.onUpdaterProgress) {
      root.api.onUpdaterProgress(async data => {
        const btn = el('update-launcher-btn');
        const log = el('launcher-update-log');
        const progressContainer = el('update-progress-container');
        const progressStage = el('update-progress-stage');
        const progressBar = el('update-progress-bar');
        const progressPercent = el('update-progress-percent');

        if (progressContainer) progressContainer.hidden = false;
        if (progressBar && data.percent !== undefined) progressBar.value = data.percent;
        if (progressPercent && data.percent !== undefined) progressPercent.textContent = `${data.percent}%`;

        if (data.downloaded || data.stage === 'downloaded' || data.percent === 100) {
          updaterState = 'ready_to_install';
          if (progressStage) progressStage.textContent = 'Обновление загружено';
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Перезапустить и установить';
          }
          if (log) log.textContent = 'Обновление загружено. Готово к установке.';

          let confirmed = false;
          if (UI.dialogs && typeof UI.dialogs.confirm === 'function') {
            confirmed = await UI.dialogs.confirm('Обновление загружено. Перезапустить и установить?');
          }
          if (confirmed) {
            btn?.click();
          }
        }
      });
    }

    if (root.api?.onUpdateProgress) {
      root.api.onUpdateProgress(({ stage, percent }) => {
        if (el('update-progress-container')) el('update-progress-container').hidden = false;
        if (el('update-progress-stage')) el('update-progress-stage').textContent = stage;
        if (el('update-progress-bar')) el('update-progress-bar').value = percent;
        if (el('update-progress-percent')) el('update-progress-percent').textContent = `${percent}%`;
      });
    }

    if (root.api?.onUpdateDone) {
      root.api.onUpdateDone(() => setTimeout(() => {
        if (el('update-progress-container')) el('update-progress-container').hidden = true;
      }, 2000));
    }
  }

  async function init() {
    try {
      if (UI.themes) UI.themes.init();
      if (UI.dialogs) UI.dialogs.init();
      if (UI.sessions) UI.sessions.init();
      if (UI.providersPanel) UI.providersPanel.init();
      if (UI.githubPanel) UI.githubPanel.init();
      if (UI.terminal) UI.terminal.initTerminal();

      await UI.configForm.refreshProviders();

      const result = await UI.call('getConfig');
      UI.state.cfg = result.config;
      UI.state.cfg.providerModels = { ...(UI.state.cfg.providerModels || {}), [UI.state.cfg.provider]: UI.state.cfg.model };

      if (el('version')) {
        const formatted = (UI.logic && typeof UI.logic.formatAppVersion === 'function')
          ? UI.logic.formatAppVersion(result.version)
          : (result.version ? `v${String(result.version).trim().replace(/^v/i, '')}` : '');
        el('version').textContent = formatted;
      }

      const isWeb = location.protocol === 'http:' || location.protocol === 'https:';
      if (!result.isPackaged || isWeb) {
        const updateBtn = el('update-launcher-btn');
        if (updateBtn) {
          updateBtn.disabled = true;
          updateBtn.title = 'Обновление работает только в установленной версии';
          const updateLog = el('launcher-update-log');
          if (updateLog) updateLog.textContent = 'Обновление работает только в установленной версии';
        }
      }
      UI.configForm.fillForm();

      const termStateResult = await UI.call('terminalState');
      UI.state.processState = termStateResult.state;

      const termSessionsResult = await UI.call('terminalSessions');
      UI.state.terminalTabs = termSessionsResult.sessions;

      UI.terminal.renderTerminalTabs();
      UI.configForm.updateControls();

      if (UI.providersPanel) {
        await UI.providersPanel.refreshProcessStatus();
        await UI.providersPanel.refreshProvidersStatus();
      }

      const autostart = await UI.call('getAutostart');
      if (el('autostart-checkbox')) el('autostart-checkbox').checked = autostart.enabled;

      await refreshGpuStats();
      if (UI.state.gpuTimer) clearInterval(UI.state.gpuTimer);
      UI.state.gpuTimer = setInterval(() => refreshGpuStats().catch(error => UI.notify.log(`GPU: ${error.message}`, true)), 3000);

      await Promise.all([
        UI.configForm.refreshModels(),
        UI.sessions ? UI.sessions.refreshSessions() : Promise.resolve()
      ]);

      if (!UI.state.cfg.disableUpdateCheck) {
        const version = await UI.call('getHermesVersion', UI.state.cfg);
        UI.notify.showVersion(version);
      }
    } catch (e) {
      UI.notify.log(e.message, true);
      if (!UI.state.cfg) {
        UI.state.processState = 'error';
        UI.configForm.updateControls();
      }
    }
  }

  setupGlobalShortcuts();
  init();
})(typeof window !== 'undefined' ? window : globalThis);
