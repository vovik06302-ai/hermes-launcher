'use strict';
const fs = require('fs');
const path = require('path');
if (process.platform === 'win32') {
  const root = path.dirname(require.resolve('node-pty/package.json'));
  const source = path.join(root, 'prebuilds', `win32-${process.arch}`, 'conpty');
  const target = path.join(root, 'build', 'Release', 'conpty');
  // Локально пересобранный модуль загружается раньше prebuild и ищет DLL рядом с собой.
  if (fs.existsSync(path.join(root, 'build', 'Release', 'conpty.node'))) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of ['conpty.dll', 'OpenConsole.exe']) {
      if (!fs.existsSync(path.join(target, name))) fs.copyFileSync(path.join(source, name), path.join(target, name));
    }
  }
}
