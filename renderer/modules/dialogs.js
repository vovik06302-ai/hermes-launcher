'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  function el(id) {
    return document.getElementById(id);
  }

  function closeCommandPalette() {
    const palette = el('commandPalette');
    if (palette) palette.hidden = true;
  }

  function askText(options = {}) {
    const { title = 'Введите значение', value = '', placeholder = '' } = typeof options === 'string' ? { title: options } : options;
    return new Promise(resolve => {
      const dialog = el('promptDialog');
      const form = el('promptForm');
      const input = el('promptInput');
      const titleEl = el('promptTitle');
      const cancelBtn = el('promptCancelBtn');

      if (titleEl) titleEl.textContent = title;
      if (input) {
        input.value = value;
        input.placeholder = placeholder;
      }
      if (dialog) dialog.hidden = false;
      if (input) {
        input.focus();
        input.select();
      }

      const finish = result => {
        if (dialog) dialog.hidden = true;
        if (form) form.removeEventListener('submit', onSubmit);
        if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
        if (dialog) {
          dialog.removeEventListener('click', onBackdrop);
          dialog.removeEventListener('keydown', onKey);
        }
        resolve(result);
      };

      const onSubmit = event => { event.preventDefault(); finish(input ? input.value : ''); };
      const onCancel = () => finish(null);
      const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); finish(null); } };
      const onBackdrop = event => { if (event.target === dialog) finish(null); };

      if (form) form.addEventListener('submit', onSubmit);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
      if (dialog) {
        dialog.addEventListener('click', onBackdrop);
        dialog.addEventListener('keydown', onKey);
      }
    });
  }

  function openCommandPalette() {
    const palette = el('commandPalette');
    const search = el('commandSearch');
    if (palette) palette.hidden = false;
    if (search) {
      search.value = '';
      search.focus();
    }
    renderCommands();
  }

  function renderCommands() {
    const search = el('commandSearch');
    const list = el('commandList');
    if (!search || !list) return;

    const query = search.value.trim().toLocaleLowerCase();
    list.replaceChildren();

    const commands = root.HermesUI.state?.commands || [];
    for (const [label, action] of commands.filter(([name]) => name.toLocaleLowerCase().includes(query))) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'command-item';
      button.textContent = label;
      button.addEventListener('click', () => {
        closeCommandPalette();
        action();
      });
      list.appendChild(button);
    }
  }

  function confirm(message) {
    return new Promise(resolve => {
      const dialog = el('promptDialog');
      const form = el('promptForm');
      const input = el('promptInput');
      const titleEl = el('promptTitle');
      const cancelBtn = el('promptCancelBtn');

      if (titleEl) titleEl.textContent = message;
      if (input) input.hidden = true;
      if (dialog) dialog.hidden = false;

      const finish = result => {
        if (dialog) dialog.hidden = true;
        if (input) input.hidden = false;
        if (form) form.removeEventListener('submit', onSubmit);
        if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
        if (dialog) {
          dialog.removeEventListener('click', onBackdrop);
          dialog.removeEventListener('keydown', onKey);
        }
        resolve(Boolean(result));
      };

      const onSubmit = event => { event.preventDefault(); finish(true); };
      const onCancel = () => finish(false);
      const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); finish(false); } };
      const onBackdrop = event => { if (event.target === dialog) finish(false); };

      if (form) form.addEventListener('submit', onSubmit);
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
      if (dialog) {
        dialog.addEventListener('click', onBackdrop);
        dialog.addEventListener('keydown', onKey);
      }
    });
  }

  function init() {
    const search = el('commandSearch');
    const palette = el('commandPalette');

    if (search) search.addEventListener('input', renderCommands);
    if (palette) {
      palette.addEventListener('click', event => {
        if (event.target === palette) closeCommandPalette();
      });
    }
  }

  const dialogsModule = {
    closeCommandPalette,
    askText,
    confirm,
    openCommandPalette,
    renderCommands,
    init
  };

  root.HermesUI.dialogs = dialogsModule;
  if (typeof module !== 'undefined' && module.exports) module.exports = dialogsModule;
})(typeof window !== 'undefined' ? window : globalThis);
