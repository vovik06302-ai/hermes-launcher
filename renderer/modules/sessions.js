'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  function el(id) {
    return document.getElementById(id);
  }

  function renderSessions() {
    const state = root.HermesUI.state || {};
    const search = el('sessionSearch');
    const sortSelect = el('sessionSort');
    const list = el('sessionsList');
    const loadMoreBtn = el('loadMoreSessionsBtn');
    if (!list) return;

    const query = search ? search.value : '';
    const sort = sortSelect ? sortSelect.value : 'id-desc';

    const visible = root.HermesUI.logic.filterAndSortSessions(state.sessions, query, sort);
    const rendered = visible.slice(0, state.sessionsVisibleCount);

    if (!visible.some(s => s.id === state.selectedId)) {
      state.selectedId = null;
    }

    list.replaceChildren();
    for (const session of rendered) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'session-item';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(state.selectedId === session.id));

      const title = document.createElement('span');
      title.className = 'session-title';
      title.textContent = session.title;

      const id = document.createElement('span');
      id.className = 'session-id';
      id.textContent = session.id;

      row.append(title, id);

      row.addEventListener('click', () => {
        state.selectedId = session.id;
        for (const item of list.children) {
          item.setAttribute('aria-selected', String(item === row));
        }
        if (root.HermesUI.configForm) root.HermesUI.configForm.updateControls();
      });

      row.addEventListener('dblclick', () => {
        state.selectedId = session.id;
        if (root.HermesUI.terminal) {
          root.HermesUI.terminal.launch(session.id);
        }
      });

      list.appendChild(row);
    }

    if (!visible.length) {
      list.textContent = query ? 'Ничего не найдено.' : 'Сессий пока нет.';
    }

    if (loadMoreBtn) {
      loadMoreBtn.hidden = rendered.length >= visible.length;
      loadMoreBtn.textContent = `Показать ещё (${visible.length - rendered.length})`;
    }

    if (root.HermesUI.configForm) root.HermesUI.configForm.updateControls();
  }

  async function refreshSessions() {
    const state = root.HermesUI.state || {};
    const request = ++state.sessionsRequest;
    const refreshBtn = el('refreshSessionsBtn');
    const list = el('sessionsList');

    if (refreshBtn) refreshBtn.disabled = true;
    if (list) list.textContent = 'Загрузка…';
    state.selectedId = null;

    if (root.HermesUI.configForm) root.HermesUI.configForm.updateControls();

    try {
      const configSnapshot = root.HermesUI.configForm ? root.HermesUI.configForm.readForm() : {};
      const result = await root.HermesUI.call('listSessions', configSnapshot);
      if (request !== state.sessionsRequest) return;

      state.sessions = result.sessions || [];
      state.sessionsVisibleCount = 100;
      renderSessions();
    } catch (e) {
      if (request !== state.sessionsRequest) return;
      state.sessions = [];
      if (list) list.textContent = `Не удалось получить сессии: ${e.message}`;
      if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
    } finally {
      if (request === state.sessionsRequest && refreshBtn) {
        refreshBtn.disabled = false;
      }
    }
  }

  function exportSessions() {
    const state = root.HermesUI.state || {};
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessions: state.sessions }, null, 2)], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `hermes-sessions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
    if (root.HermesUI.notify) root.HermesUI.notify.log(`Экспортировано сессий: ${state.sessions.length}.`);
  }

  async function deleteSelectedSession() {
    const state = root.HermesUI.state || {};
    const session = state.sessions.find(s => s.id === state.selectedId);
    if (!session) throw new Error('Выберите сессию.');
    const configSnapshot = root.HermesUI.configForm ? root.HermesUI.configForm.readForm() : {};
    const result = await root.HermesUI.call('deleteSession', configSnapshot, session);
    if (!result.canceled) {
      if (root.HermesUI.notify) root.HermesUI.notify.log('Сессия удалена.');
      await refreshSessions();
    }
  }

  function init() {
    const state = root.HermesUI.state || {};

    el('refreshSessionsBtn')?.addEventListener('click', () => {
      refreshSessions().catch(e => {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      });
    });

    el('sessionSearch')?.addEventListener('input', () => {
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(renderSessions, state.UI_TIMINGS.searchDebounceMs);
    });

    el('sessionSort')?.addEventListener('change', () => {
      state.sessionsVisibleCount = 100;
      renderSessions();
    });

    el('loadMoreSessionsBtn')?.addEventListener('click', () => {
      state.sessionsVisibleCount += 100;
      renderSessions();
    });

    el('exportSessionsBtn')?.addEventListener('click', exportSessions);

    el('resumeBtn')?.addEventListener('click', () => {
      if (root.HermesUI.terminal && state.selectedId) {
        root.HermesUI.terminal.launch(state.selectedId).catch(e => {
          if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
        });
      }
    });

    el('deleteSessionBtn')?.addEventListener('click', () => {
      deleteSelectedSession().catch(e => {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      });
    });
  }

  const sessionsModule = {
    renderSessions,
    refreshSessions,
    exportSessions,
    deleteSelectedSession,
    init
  };

  root.HermesUI.sessions = sessionsModule;
  if (typeof module !== 'undefined' && module.exports) module.exports = sessionsModule;
})(typeof window !== 'undefined' ? window : globalThis);
