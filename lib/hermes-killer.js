'use strict';

const { execFile, execFileSync } = require('child_process');

// Фоновые процессы Hermes Agent (gateway: python.exe -m hermes_cli …, node.exe … openclaw)
// запускаются самим агентом внутри PTY, поэтому лаунчер их не отслеживает и они
// переживают закрытие окна, держат файлы и мешают установщику обновления.
// Фильтр строго по признакам Hermes — чужие python.exe/node.exe пользователя
// (Kimi Desktop, другие проекты) не затрагиваются:
//   - путь к exe внутри каталога hermes (%LOCALAPPDATA%\hermes\…);
//   - либо в командной строке встречается hermes_cli или openclaw.
const POWERSHELL_KILL_COMMAND = 'Get-CimInstance Win32_Process ' +
  "| Where-Object { ($_.ExecutablePath -and ($_.ExecutablePath -like '*\\hermes\\*')) -or ($_.CommandLine -and ($_.CommandLine -match 'hermes_cli|openclaw')) } " +
  '| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }';

const POWERSHELL_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', POWERSHELL_KILL_COMMAND];

function powershellExe() {
  const systemRoot = process.env.SystemRoot || 'C:\\Windows';
  return `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
}

async function killHermesBackground(logger) {
  if (process.platform !== 'win32') return;
  try {
    await new Promise(resolve => {
      execFile(powershellExe(), POWERSHELL_ARGS, { windowsHide: true, timeout: 20000 }, () => resolve());
    });
    if (logger && typeof logger.info === 'function') {
      logger.info('Фоновые процессы Hermes Agent завершены');
    }
  } catch (error) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn('Не удалось завершить фоновые процессы Hermes Agent', error);
    }
  }
}

// Синхронный вариант для before-quit, где асинхронность недоступна.
function killHermesBackgroundSync() {
  if (process.platform !== 'win32') return;
  try {
    execFileSync(powershellExe(), POWERSHELL_ARGS, { windowsHide: true, timeout: 15000, stdio: 'ignore' });
  } catch { /* процессы могли уже завершиться сами */ }
}

module.exports = { killHermesBackground, killHermesBackgroundSync, POWERSHELL_KILL_COMMAND };
