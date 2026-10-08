'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  function filterAndSortSessions(sessions, query = '', sort = 'id-desc') {
    if (!Array.isArray(sessions)) return [];
    const q = String(query || '').trim().toLocaleLowerCase();
    const filtered = sessions.filter(s => {
      if (!s) return false;
      const title = String(s.title || '');
      const id = String(s.id || '');
      return `${title} ${id}`.toLocaleLowerCase().includes(q);
    });

    return filtered.sort((a, b) => {
      const aTitle = String(a.title || '');
      const bTitle = String(b.title || '');
      const aId = String(a.id || '');
      const bId = String(b.id || '');

      if (sort === 'title') {
        return aTitle.localeCompare(bTitle, 'ru');
      }
      if (sort === 'id') {
        return aId.localeCompare(bId);
      }
      return bId.localeCompare(aId);
    });
  }

  function collectConfigFromForm(formValues = {}, baseCfg = {}) {
    const next = { ...(baseCfg || {}) };
    const stringKeys = ['provider', 'systemPrompt', 'hermesPath', 'lmstudioProvider', 'localProvider', 'localBaseUrl', 'apiBaseUrl'];
    for (const key of stringKeys) {
      next[key] = String(formValues[key] || '').trim();
    }
    next.projectFolder = String(formValues.projectFolder || '').trim();
    next.model = String(formValues.model || '').trim();
    next.maxTokens = Number(formValues.maxTokens) || 0;
    next.contextLength = Number(formValues.contextLength) || 0;
    next.autoApprove = Boolean(formValues.autoApprove);
    next.disableUpdateCheck = Boolean(formValues.disableUpdateCheck);
    if (formValues.theme) {
      next.theme = String(formValues.theme);
    }
    const currentProvider = next.provider || 'ollama';
    next.providerModels = { ...(baseCfg.providerModels || {}), [currentProvider]: next.model };
    return next;
  }

  function applyProjectProfile(cfg = {}, folder = '') {
    const base = { ...(cfg || {}) };
    const targetFolder = String(folder || '').trim();
    if (!targetFolder) return base;

    const profile = base.projectProfiles?.[targetFolder] || {};
    return {
      ...base,
      ...profile,
      projectFolder: targetFolder
    };
  }

  function formatLaunchStatus(processState, model = '', provider = '') {
    const m = model || 'не выбрана';
    const p = provider || '';

    if (processState === 'running') {
      return { text: `Hermes работает: ${m} · ${p}`, state: 'ok' };
    }
    if (processState === 'starting') {
      return { text: 'Hermes запускается и инициализирует сессию…', state: 'warning' };
    }
    if (processState === 'error') {
      return { text: 'Hermes завершился с ошибкой. Проверьте диагностику и последние строки терминала.', state: 'error' };
    }
    if (processState === 'stopping') {
      return { text: 'Hermes останавливается…', state: 'warning' };
    }
    return { text: 'Готово к запуску. Проверка окружения поможет быстро найти проблемы.', state: 'idle' };
  }

  const logic = {
    filterAndSortSessions,
    collectConfigFromForm,
    applyProjectProfile,
    formatLaunchStatus
  };

  root.HermesUI.logic = logic;
  if (typeof module !== 'undefined' && module.exports) module.exports = logic;
})(typeof window !== 'undefined' ? window : globalThis);
