'use strict';
(function (root) {
  root.HermesUI = root.HermesUI || {};

  function log(message, error = false) {
    const logBox = document.getElementById('logBox');
    if (!logBox) return;
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString('ru-RU')}] ${message}`;
    line.className = error ? 'error' : '';
    logBox.appendChild(line);
    while (logBox.children.length > 300) logBox.firstChild.remove();
    logBox.scrollTop = logBox.scrollHeight;
  }

  function setRuntimeStatus(text, state = 'idle') {
    const banner = document.getElementById('runtimeStatusBanner');
    const label = document.getElementById('runtimeStatusText');
    if (!banner || !label) return;
    label.textContent = text;
    banner.dataset.state = state;
  }

  function showVersion(version) {
    const updateStatus = document.getElementById('updateStatus');
    const versionDiagnostic = document.getElementById('versionDiagnostic');
    const versionDetails = document.getElementById('versionDetails');
    if (!version) return;

    const message = version.output + (version.warning ? ' · предупреждение, см. диагностику' : '');
    if (updateStatus) updateStatus.textContent = message;

    setRuntimeStatus(
      version.warning ? `Hermes найден, но есть предупреждения: ${version.output}` : `Hermes готов: ${version.output}`,
      version.warning ? 'warning' : 'ok'
    );

    if (versionDiagnostic) versionDiagnostic.textContent = version.diagnostic || '';
    if (versionDetails) versionDetails.hidden = !version.diagnostic;
  }

  const notify = {
    log,
    setRuntimeStatus,
    showVersion
  };

  root.HermesUI.notify = notify;
  if (typeof module !== 'undefined' && module.exports) module.exports = notify;
})(typeof window !== 'undefined' ? window : globalThis);
