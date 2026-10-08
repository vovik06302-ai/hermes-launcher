'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  function el(id) {
    return document.getElementById(id);
  }

  async function refreshProcessStatus() {
    try {
      const result = await root.HermesUI.call('processesStatus');
      const items = Object.entries(result.services || {}).map(([name, item]) => `${name}: ${item.healthy === true ? 'готов' : item.alive ? 'запущен' : 'остановлен'}`);
      if (el('processStatus')) el('processStatus').textContent = items.join(' · ');
    } catch (error) {
      if (el('processStatus')) el('processStatus').textContent = `Ошибка статуса сервисов: ${error.message}`;
    }
  }

  async function refreshProvidersStatus() {
    try {
      const result = await root.HermesUI.call('providers:status');
      for (const row of document.querySelectorAll('.provider-row')) {
        const provider = result.providers?.[row.dataset.name];
        const status = row.querySelector('.provider-status');
        if (!status) continue;
        if (!provider) {
          status.textContent = 'Нет конфигурации';
          continue;
        }
        status.textContent = provider.running
          ? `${provider.managed ? 'Запущен лаунчером' : 'Порт занят'} · ${provider.port}`
          : `Остановлен · ${provider.port}${provider.enabled ? '' : ' · выключен в конфиге'}`;
        row.dataset.running = String(provider.running);
      }
      if (el('providers-panel-status')) el('providers-panel-status').textContent = 'Статус портов обновлён';
    } catch (error) {
      if (el('providers-panel-status')) el('providers-panel-status').textContent = `Ошибка статуса: ${error.message}`;
    }
  }

  async function controlProvider(row, action) {
    const buttons = row.querySelectorAll('button');
    const feedback = row.querySelector('.provider-feedback');
    buttons.forEach(button => { button.disabled = true; });
    try {
      const result = await root.HermesUI.call(`providers:${action}`, row.dataset.name);
      if (feedback) feedback.textContent = result.status || 'Команда выполнена.';
    } catch (error) {
      if (feedback) feedback.textContent = error.message;
    } finally {
      buttons.forEach(button => { button.disabled = false; });
      await refreshProvidersStatus();
    }
  }

  function init() {
    for (const row of document.querySelectorAll('.provider-row')) {
      row.querySelector('.start-btn')?.addEventListener('click', () => controlProvider(row, 'start'));
      row.querySelector('.stop-btn')?.addEventListener('click', () => controlProvider(row, 'stop'));
    }

    setInterval(refreshProvidersStatus, 5000);

    el('start-all-btn')?.addEventListener('click', async () => {
      try {
        const result = await root.HermesUI.call('startAll');
        if (el('processStatus')) el('processStatus').textContent = result.text;
        if (root.HermesUI.notify) root.HermesUI.notify.log(`Сервисы: ${result.text}`);
        await refreshProcessStatus();
      } catch (e) {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      }
    });

    el('stop-all-btn')?.addEventListener('click', async () => {
      try {
        const result = await root.HermesUI.call('stopAll');
        if (el('processStatus')) el('processStatus').textContent = result.text;
        if (root.HermesUI.notify) root.HermesUI.notify.log(`Сервисы: ${result.text}`);
        await refreshProcessStatus();
      } catch (e) {
        if (root.HermesUI.notify) root.HermesUI.notify.log(e.message, true);
      }
    });
  }

  const providersPanelModule = {
    refreshProcessStatus,
    refreshProvidersStatus,
    controlProvider,
    init
  };

  root.HermesUI.providersPanel = providersPanelModule;
  if (typeof module !== 'undefined' && module.exports) module.exports = providersPanelModule;
})(typeof window !== 'undefined' ? window : globalThis);
