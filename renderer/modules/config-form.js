'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  function el(id) {
    return document.getElementById(id);
  }

  function readForm() {
    const state = root.HermesUI.state || {};
    const formValues = {
      provider: el('provider')?.value || '',
      systemPrompt: el('systemPrompt')?.value || '',
      hermesPath: el('hermesPath')?.value || '',
      lmstudioProvider: el('lmstudioProvider')?.value || '',
      localProvider: el('localProvider')?.value || '',
      localBaseUrl: el('localBaseUrl')?.value || '',
      apiBaseUrl: el('apiBaseUrl')?.value || '',
      projectFolder: el('projectPath')?.value || '',
      model: el('model')?.value || '',
      maxTokens: el('maxTokens')?.value || '',
      contextLength: el('contextLength')?.value || '',
      autoApprove: el('autoApprove')?.checked || false,
      disableUpdateCheck: el('disableUpdateCheck')?.checked || false,
      theme: document.documentElement.dataset.theme
    };
    return root.HermesUI.logic.collectConfigFromForm(formValues, state.cfg);
  }

  function projectOptions() {
    const state = root.HermesUI.state || {};
    const select = el('projectSelect');
    if (!select || !state.cfg) return;

    select.replaceChildren(new Option('Выберите проект', ''));
    const savedProjects = state.cfg.savedProjects || [];
    for (const folder of savedProjects) {
      select.appendChild(new Option(folder, folder));
    }
    select.value = savedProjects.includes(state.cfg.projectFolder) ? state.cfg.projectFolder : '';
  }

  function modelProfileOptions() {
    const state = root.HermesUI.state || {};
    const picker = el('modelProfilePicker');
    if (!picker || !state.cfg) return;

    picker.replaceChildren(new Option('Профиль модели…', ''));
    const profiles = Object.keys(state.cfg.modelProfiles || {}).sort();
    for (const name of profiles) {
      picker.appendChild(new Option(name, name));
    }
  }

  function fillForm() {
    const state = root.HermesUI.state || {};
    if (!state.cfg) return;

    for (const key of ['provider', 'model', 'maxTokens', 'contextLength', 'systemPrompt', 'hermesPath', 'lmstudioProvider', 'localProvider', 'localBaseUrl', 'apiBaseUrl']) {
      const elem = el(key);
      if (elem) elem.value = state.cfg[key] !== undefined ? state.cfg[key] : '';
    }
    if (el('projectPath')) el('projectPath').value = state.cfg.projectFolder || '';
    if (el('autoApprove')) el('autoApprove').checked = Boolean(state.cfg.autoApprove);
    if (el('disableUpdateCheck')) el('disableUpdateCheck').checked = Boolean(state.cfg.disableUpdateCheck);

    if (root.HermesUI.themes) root.HermesUI.themes.applyTheme(state.cfg.theme);
    state.displayedProvider = state.cfg.provider;

    projectOptions();
    modelProfileOptions();
    refreshApiKeyStatus();
    updateControls();
  }

  async function refreshProviders() {
    try {
      const result = await root.HermesUI.call('listProviders');
      const select = el('provider');
      if (!select) return;
      for (const provider of result.providers || []) {
        if (!select.querySelector(`option[value="${CSS.escape(provider.id)}"]`)) {
          select.appendChild(new Option(provider.name || provider.id, provider.id));
        }
      }
    } catch (error) {
      if (root.HermesUI.notify) root.HermesUI.notify.log(`Провайдеры: ${error.message}`, true);
    }
  }

  async function save() {
    const state = root.HermesUI.state || {};
    const next = readForm();
    if (next.savedProjects && next.savedProjects.includes(next.projectFolder)) {
      next.projectProfiles = {
        ...next.projectProfiles,
        [next.projectFolder]: {
          provider: next.provider,
          model: next.model,
          maxTokens: next.maxTokens,
          contextLength: next.contextLength,
          systemPrompt: next.systemPrompt,
          autoApprove: next.autoApprove
        }
      };
    }
    const result = await root.HermesUI.call('saveConfig', next);
    state.cfg = result.config;
    projectOptions();
    return state.cfg;
  }

  function scheduleSave() {
    const state = root.HermesUI.state || {};
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(() => {
      if (!state.busy && state.cfg) {
        save().catch(error => {
          if (root.HermesUI.notify) root.HermesUI.notify.log(`Автосохранение: ${error.message}`, true);
        });
      }
    }, state.UI_TIMINGS.autoSaveMs);
  }

  async function refreshModels() {
    const state = root.HermesUI.state || {};
    const request = ++state.modelsRequest;
    const snapshot = readForm();
    const picker = el('modelPicker');
    const hint = el('modelHint');
    const modelInput = el('model');
    if (!picker || !hint || !modelInput) return;

    picker.replaceChildren(new Option('Выбрать из списка…', ''));
    if (!['ollama', 'lmstudio', 'llamacpp', 'vllm', 'llm', 'openai', 'gemini', 'claude', 'kilocode'].includes(snapshot.provider)) {
      picker.hidden = true;
      hint.textContent = 'Введите имя модели. Авторизация используется из настроек Hermes.';
      return;
    }

    picker.hidden = false;
    hint.textContent = 'Получение моделей…';
    try {
      const result = await root.HermesUI.call('listModels', snapshot);
      if (request !== state.modelsRequest) return;

      for (const model of result.models || []) {
        picker.appendChild(new Option(model, model));
      }

      if (result.models && result.models.length && (!modelInput.value || (snapshot.provider === 'gemini' && !result.models.includes(modelInput.value)))) {
        const previous = modelInput.value;
        modelInput.value = result.models[0];
        if (state.cfg) {
          state.cfg.providerModels = state.cfg.providerModels || {};
          state.cfg.providerModels[snapshot.provider] = result.models[0];
        }
        if (previous && root.HermesUI.notify) {
          root.HermesUI.notify.log(`Недоступная модель ${previous} заменена на ${result.models[0]}.`);
        }
        scheduleSave();
      }

      if (result.models && result.models.includes(modelInput.value)) {
        picker.value = modelInput.value;
      }
      hint.textContent = result.models && result.models.length
        ? `Доступно моделей: ${result.models.length}${result.cached ? ' · кэш' : ''}`
        : 'Список пуст. Можно ввести имя вручную.';
    } catch (e) {
      if (request !== state.modelsRequest) return;
      hint.textContent = 'Список недоступен. Можно ввести имя вручную.';
      if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
    }
    updateControls();
  }

  async function refreshApiKeyStatus() {
    const providerSelect = el('provider');
    const provider = providerSelect ? providerSelect.value : '';
    const needsKey = ['openai', 'gemini', 'claude', 'kilocode', 'llm'].includes(provider);
    const customBaseUrl = ['llamacpp', 'vllm'].includes(provider);

    if (el('apiKey')) el('apiKey').disabled = false;
    if (el('pasteApiKeyBtn')) el('pasteApiKeyBtn').disabled = false;
    if (el('saveApiKeyBtn')) el('saveApiKeyBtn').disabled = false;
    if (el('clearApiKeyBtn')) el('clearApiKeyBtn').disabled = false;
    if (el('apiBaseUrl')) el('apiBaseUrl').disabled = !needsKey && !customBaseUrl;

    if (!needsKey) {
      if (el('apiKeyStatus')) el('apiKeyStatus').textContent = 'Для локального провайдера API-ключ не требуется.';
      return;
    }

    try {
      const result = await root.HermesUI.call('apiKeyStatus', provider);
      if (el('apiKeyStatus')) el('apiKeyStatus').textContent = result.saved ? 'Ключ сохранён защищённо.' : 'Ключ не сохранён.';
    } catch (error) {
      if (el('apiKeyStatus')) el('apiKeyStatus').textContent = error.message;
    }
  }

  async function refreshLaunchReadiness() {
    const state = root.HermesUI.state || {};
    if (!state.cfg) return;
    try {
      const readiness = await root.HermesUI.call('runDiagnostics', readForm());
      const failed = (readiness.checks || []).filter(check => !check.ok);
      if (failed.length && root.HermesUI.notify) {
        root.HermesUI.notify.setRuntimeStatus(`Проблема запуска: ${failed[0].detail}`, 'warning');
      }
    } catch (err) {
      // Игнорируем ошибки при фоновом обновлении готовности
    }
  }

  function updateControls() {
    const state = root.HermesUI.state || {};
    const active = ['starting', 'running', 'stopping'].includes(state.processState);

    if (el('configuration')) el('configuration').disabled = state.busy || active || !state.cfg;
    if (el('launchBtn')) el('launchBtn').disabled = state.busy || active || !state.cfg;
    if (el('retryBtn')) el('retryBtn').disabled = state.busy || active || !state.lastLaunchConfig;
    if (el('killTermBtn')) el('killTermBtn').disabled = state.processState !== 'running';
    if (el('resumeBtn')) el('resumeBtn').disabled = state.busy || active || !state.selectedId;
    if (el('deleteSessionBtn')) el('deleteSessionBtn').disabled = state.busy || active || !state.selectedId;

    const statusText = el('statusText');
    if (statusText) {
      statusText.textContent = state.states[state.processState] || state.processState;
      statusText.dataset.state = state.processState;
    }

    const modelInput = el('model');
    const providerSelect = el('provider');
    const currentModel = el('currentModel');
    const currentProvider = el('currentProvider');

    if (currentModel) currentModel.textContent = (modelInput && modelInput.value) || 'Модель не выбрана';
    if (currentProvider && providerSelect) currentProvider.textContent = providerSelect.selectedOptions[0]?.textContent || '';

    const providerValue = providerSelect ? providerSelect.value : '';
    if (el('unloadBtn')) el('unloadBtn').disabled = !['ollama', 'lmstudio'].includes(providerValue);
    if (el('refreshModelsBtn')) {
      el('refreshModelsBtn').disabled = !['ollama', 'lmstudio', 'llamacpp', 'vllm', 'llm', 'openai', 'gemini', 'claude', 'kilocode'].includes(providerValue);
    }

    if (el('progressPanel')) el('progressPanel').dataset.state = state.processState;
    if (el('progressTitle')) el('progressTitle').textContent = state.states[state.processState] || state.processState;

    const model = (modelInput && modelInput.value) || 'не выбрана';
    const provider = (providerSelect && providerSelect.selectedOptions[0]?.textContent) || '';

    if (root.HermesUI.notify && root.HermesUI.logic) {
      const statusInfo = root.HermesUI.logic.formatLaunchStatus(state.processState, model, provider);
      root.HermesUI.notify.setRuntimeStatus(statusInfo.text, statusInfo.state);
    }

    if (el('progressDetail')) {
      el('progressDetail').textContent = active
        ? `Модель: ${model} · Провайдер: ${provider}`
        : (state.processState === 'error' ? 'Последняя операция завершилась с ошибкой.' : 'Готово к запуску новой задачи.');
    }
  }

  const configForm = {
    readForm,
    projectOptions,
    modelProfileOptions,
    fillForm,
    refreshProviders,
    save,
    scheduleSave,
    refreshModels,
    refreshApiKeyStatus,
    refreshLaunchReadiness,
    updateControls
  };

  root.HermesUI.configForm = configForm;
  if (typeof module !== 'undefined' && module.exports) module.exports = configForm;
})(typeof window !== 'undefined' ? window : globalThis);
