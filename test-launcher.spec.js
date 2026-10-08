'use strict';

const { _electron: electron } = require('playwright');
const path = require('path');

(async () => {
  const results = {};
  let app;
  try {
    app = await electron.launch({ args: [path.join(__dirname, '.')] });
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.click('#settingsBtn');

    try {
      await window.click('#autostart-checkbox');
      await window.waitForTimeout(1000);
      results.autostart_checkbox = await window.isChecked('#autostart-checkbox');
    } catch (error) {
      results.autostart_checkbox = `ошибка: ${error.message}`;
    }

    try {
      await window.click('#start-all-btn');
      await window.waitForTimeout(2000);
      results.start_all_clicked = true;
    } catch (error) {
      results.start_all_clicked = `ошибка: ${error.message}`;
    }

    try {
      await window.click('#update-agent-btn');
      await window.waitForTimeout(3000);
      results.update_log_text = await window.textContent('#agent-update-log');
    } catch (error) {
      results.update_log_text = `ошибка: ${error.message}`;
    }

    try {
      await window.click('#stop-all-btn');
      await window.waitForTimeout(2000);
      results.stop_all_clicked = true;
    } catch (error) {
      results.stop_all_clicked = `ошибка: ${error.message}`;
    }

    // Обновление Agent может ещё выполняться и временно блокировать perform().
    // Гарантируем очистку запущенных сервисов перед завершением GUI-теста.
    try { await window.evaluate(() => window.api.stopAll()); } catch { /* приложение могло уже закрываться */ }

    try {
      await Promise.race([window.close(), new Promise(resolve => setTimeout(resolve, 1000))]);
      await new Promise(resolve => setTimeout(resolve, 2000));
      results.window_close_triggered = true;
    } catch (error) {
      results.window_close_triggered = `ошибка: ${error.message}`;
    }
  } catch (error) {
    results.launch = `ошибка: ${error.message}`;
  } finally {
    console.log(JSON.stringify(results, null, 2));
    await app?.close().catch(() => {});
  }
})();
