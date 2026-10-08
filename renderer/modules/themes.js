'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  function el(id) {
    return document.getElementById(id);
  }

  function applyTheme(id) {
    const uiThemes = root.HermesUI.state?.uiThemes || {};
    const key = uiThemes[id] ? id : 'aurora';
    const theme = uiThemes[key];
    document.documentElement.dataset.theme = key;

    if (root.HermesUI.terminal && root.HermesUI.terminal.term) {
      root.HermesUI.terminal.term.options.theme = {
        background: theme.background,
        foreground: theme.foreground,
        cursor: theme.cursor,
        selectionBackground: theme.selectionBackground
      };
    }

    const themeBtn = el('themeBtn');
    if (themeBtn) themeBtn.textContent = `Тема: ${theme.name}`;

    const themePicker = el('themePicker');
    if (themePicker) {
      for (const button of themePicker.querySelectorAll('.theme-swatch')) {
        button.setAttribute('aria-selected', String(button.dataset.theme === key));
      }
    }
  }

  function closeThemePicker() {
    const themePicker = el('themePicker');
    const themeBtn = el('themeBtn');
    if (themePicker) themePicker.hidden = true;
    if (themeBtn) themeBtn.setAttribute('aria-expanded', 'false');
  }

  function init() {
    const themeBtn = el('themeBtn');
    const themePicker = el('themePicker');

    if (themeBtn) {
      themeBtn.addEventListener('click', event => {
        event.stopPropagation();
        if (!themePicker) return;
        const open = themePicker.hidden;
        themePicker.hidden = !open;
        themeBtn.setAttribute('aria-expanded', String(open));
      });
    }

    if (themePicker) {
      themePicker.addEventListener('click', event => event.stopPropagation());

      for (const button of themePicker.querySelectorAll('.theme-swatch')) {
        button.addEventListener('click', async () => {
          const theme = button.dataset.theme;
          applyTheme(theme);
          closeThemePicker();
          const state = root.HermesUI.state || {};
          if (!state.cfg) return;
          try {
            const result = await root.HermesUI.call('saveConfig', { ...state.cfg, theme });
            state.cfg = result.config;
          } catch (error) {
            if (root.HermesUI.notify) root.HermesUI.notify.log(error.message, true);
          }
        });
      }
    }

    document.addEventListener('click', closeThemePicker);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeThemePicker();
    });
  }

  const themesModule = {
    applyTheme,
    closeThemePicker,
    init
  };

  root.HermesUI.themes = themesModule;
  if (typeof module !== 'undefined' && module.exports) module.exports = themesModule;
})(typeof window !== 'undefined' ? window : globalThis);
