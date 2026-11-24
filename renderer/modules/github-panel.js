'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  function el(id) {
    return document.getElementById(id);
  }

  async function refreshAuthStatus() {
    const result = await root.HermesUI.call('githubAuthStatus');
    const status = el('githubAccountStatus');
    const login = el('githubLoginBtn');
    const logout = el('githubLogoutBtn');
    if (status) status.textContent = result.message || (result.authenticated ? 'GitHub подключён.' : 'GitHub не подключён.');
    if (login) login.hidden = Boolean(result.authenticated);
    if (logout) logout.hidden = !result.authenticated;
    for (const id of ['githubListBtn', 'githubCloneBtn', 'githubPullBtn', 'githubPushBtn']) {
      const button = el(id);
      if (button) button.disabled = !result.authenticated;
    }
    return result;
  }

  async function login() {
    const result = await root.HermesUI.call('githubLogin');
    if (el('githubAccountStatus')) el('githubAccountStatus').textContent = result.message;
    if (root.HermesUI.notify) root.HermesUI.notify.log(result.message);
  }

  async function logout() {
    const result = await root.HermesUI.call('githubLogout');
    await refreshAuthStatus();
    if (el('githubStatus')) el('githubStatus').textContent = result.message;
    if (root.HermesUI.notify) root.HermesUI.notify.log(result.message);
  }

  async function refreshGitHubRepos() {
    const auth = await refreshAuthStatus();
    if (!auth.authenticated) throw new Error('Сначала войдите в GitHub.');
    const result = await root.HermesUI.call('githubList');
    const picker = el('githubRepoPicker');
    if (picker) {
      picker.replaceChildren(new Option('Выберите репозиторий…', ''));
      for (const repo of result.repositories || []) {
        picker.appendChild(new Option(`${repo.nameWithOwner}${repo.isPrivate ? ' · private' : ''}`, repo.nameWithOwner));
      }
    }
    if (el('githubStatus')) el('githubStatus').textContent = `Репозиториев доступно: ${(result.repositories || []).length}`;
  }

  async function refreshGitHubStatus() {
    const projectPath = el('projectPath')?.value.trim() || '';
    const result = await root.HermesUI.call('githubStatus', projectPath);
    if (el('githubStatus')) {
      el('githubStatus').textContent = `${result.remote || 'origin не настроен'} · ${result.changes && result.changes.length ? `изменений: ${result.changes.length}` : 'изменений нет'}`;
    }
  }

  async function clone() {
    let repo = el('githubRepoPicker')?.value;
    if (!repo && root.HermesUI.dialogs) {
      repo = await root.HermesUI.dialogs.askText({ title: 'Репозиторий GitHub', placeholder: 'владелец/название' });
    }
    if (!repo?.trim()) return;
    const chooseResult = await root.HermesUI.call('chooseFolder');
    const parent = chooseResult.path;
    if (!parent) return;

    const result = await root.HermesUI.call('githubClone', repo.trim(), parent);
    if (el('projectPath')) el('projectPath').value = result.path;
    const state = root.HermesUI.state || {};
    if (state.cfg) state.cfg.projectFolder = result.path;
    if (root.HermesUI.configForm) await root.HermesUI.configForm.save();

    if (el('githubStatus')) el('githubStatus').textContent = `Репозиторий загружен: ${result.path}`;
    if (root.HermesUI.notify) root.HermesUI.notify.log(`GitHub: репозиторий загружен в ${result.path}.`);
  }

  async function pull() {
    const projectPath = el('projectPath')?.value.trim() || '';
    const result = await root.HermesUI.call('githubPull', projectPath);
    if (el('githubStatus')) el('githubStatus').textContent = result.output;
    if (root.HermesUI.notify) root.HermesUI.notify.log(`GitHub pull: ${result.output}`);
    await refreshGitHubStatus();
  }

  async function push() {
    let message = 'Изменения из Hermes Launcher';
    if (root.HermesUI.dialogs) {
      message = await root.HermesUI.dialogs.askText({ title: 'Сообщение коммита', value: 'Изменения из Hermes Launcher' });
    }
    if (message === null) return;

    const projectPath = el('projectPath')?.value.trim() || '';
    const result = await root.HermesUI.call('githubPush', projectPath, message);
    if (el('githubStatus')) el('githubStatus').textContent = 'Изменения отправлены на GitHub.';
    if (root.HermesUI.notify) root.HermesUI.notify.log(`GitHub push: ${result.output}`);
    await refreshGitHubStatus();
  }

  function init() {
    el('githubLoginBtn')?.addEventListener('click', () => {
      login().catch(e => {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
        if (el('githubAccountStatus')) el('githubAccountStatus').textContent = e.message;
      });
    });
    el('githubAuthCheckBtn')?.addEventListener('click', () => {
      refreshAuthStatus().catch(e => {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      });
    });
    el('githubLogoutBtn')?.addEventListener('click', () => {
      logout().catch(e => {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      });
    });
    refreshAuthStatus().catch(e => {
      if (el('githubAccountStatus')) el('githubAccountStatus').textContent = e.message;
    });

    el('githubListBtn')?.addEventListener('click', () => {
      refreshGitHubRepos().catch(e => {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      });
    });

    el('githubCloneBtn')?.addEventListener('click', () => {
      clone().catch(e => {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      });
    });

    el('githubPullBtn')?.addEventListener('click', () => {
      pull().catch(e => {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      });
    });

    el('githubPushBtn')?.addEventListener('click', () => {
      push().catch(e => {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      });
    });
  }

  const githubPanelModule = {
    refreshGitHubRepos,
    refreshGitHubStatus,
    refreshAuthStatus,
    login,
    logout,
    clone,
    pull,
    push,
    init
  };

  root.HermesUI.githubPanel = githubPanelModule;
  if (typeof module !== 'undefined' && module.exports) module.exports = githubPanelModule;
})(typeof window !== 'undefined' ? window : globalThis);
