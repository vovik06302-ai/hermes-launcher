'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  async function call(name, ...args) {
    let fn = root.api?.[name];
    if (!fn && name.startsWith('providers:')) {
      const providerMethod = name.slice('providers:'.length);
      fn = root.providersAPI?.[providerMethod];
    } else if (!fn && root.providersAPI?.[name]) {
      fn = root.providersAPI[name];
    }

    if (typeof fn !== 'function') {
      throw new Error(`Метод API не найден: ${name}`);
    }

    const result = await fn(...args);
    if (result && typeof result === 'object' && 'ok' in result) {
      if (!result.ok) {
        const error = new Error(result.error || 'Не получен успешный ответ от сервера.');
        if (result.suggestion) error.suggestion = result.suggestion;
        throw error;
      }
    }
    return result;
  }

  root.HermesUI.call = call;
  if (typeof module !== 'undefined' && module.exports) module.exports = { call };
})(typeof window !== 'undefined' ? window : globalThis);
