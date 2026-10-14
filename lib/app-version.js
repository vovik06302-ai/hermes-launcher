'use strict';

const fs = require('fs');
const path = require('path');

// Единый источник версии приложения: package.json (в т.ч. app.getAppPath() для упакованного режима),
// затем запасной вариант — app.getVersion().
function getAppVersion(app) {
  try {
    const pkg = require('../package.json');
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
      return pkg.version.trim();
    }
  } catch (_) {}

  try {
    if (app && typeof app.getAppPath === 'function') {
      const appPath = app.getAppPath();
      const pkgPath = path.join(appPath, 'package.json');
      if (fs.existsSync(pkgPath)) {
        const content = fs.readFileSync(pkgPath, 'utf8');
        const pkg = JSON.parse(content);
        if (pkg && typeof pkg.version === 'string' && pkg.version.trim()) {
          return pkg.version.trim();
        }
      }
    }
  } catch (_) {}

  if (app && typeof app.getVersion === 'function') {
    const ver = app.getVersion();
    if (ver && typeof ver === 'string' && ver.trim()) {
      return ver.trim();
    }
  }

  return '';
}

module.exports = { getAppVersion };
