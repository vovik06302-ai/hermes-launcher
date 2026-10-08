'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const files = [
  'main.js',
  'preload.js',
  'state-manager.js',
  'lib/process-manager.js',
  'lib/config.js',
  'lib/commands.js',
  'lib/providers.js',
  'lib/api-keys.js',
  'lib/github.js',
  'lib/provider-registry.js',
  'lib/launcher-update.js',
  'lib/terminal.js',
  'lib/terminal-pool.js',
  'lib/task-queue.js',
  'lib/model-compare.js',
  'lib/constants.js',
  'lib/logger.js',
  'lib/ipc-utils.js',
  'lib/app-shell.js',
  'lib/app-bootstrap.js',
  'lib/app-lifecycle.js',
  'lib/app-ipc.js',
  'lib/hermes-runtime.js',
  'lib/data-migration.js',
  'lib/updater.js',
  'lib/services.js',
  'lib/session-services.js',
  'renderer/bg-sphere.js',
  'renderer/modules/state.js',
  'renderer/modules/api.js',
  'renderer/modules/notify.js',
  'renderer/modules/logic.js',
  'renderer/modules/themes.js',
  'renderer/modules/dialogs.js',
  'renderer/modules/config-form.js',
  'renderer/modules/sessions.js',
  'renderer/modules/providers-panel.js',
  'renderer/modules/github-panel.js',
  'renderer/modules/terminal.js',
  'renderer/renderer.js',
  'scripts/contrast-check.js',
  'test-launcher.spec.js'
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr); process.exit(result.status || 1); }
}
const contrastCheck = spawnSync(process.execPath, [path.join(root, 'scripts/contrast-check.js')], { encoding: 'utf8' });
if (contrastCheck.status !== 0) { process.stderr.write(contrastCheck.stderr); process.exit(contrastCheck.status || 1); }
console.log(contrastCheck.stdout.trim());
for (const required of ['renderer/index.html', 'renderer/style.css', 'preload.js', 'lib/app-shell.js', 'lib/app-bootstrap.js', 'lib/app-lifecycle.js', 'lib/app-ipc.js', 'lib/hermes-runtime.js', 'lib/session-services.js']) {
  if (!fs.existsSync(path.join(root, required))) throw new Error(`Отсутствует обязательный файл: ${required}`);
}
console.log(`Проверено файлов: ${files.length}`);
