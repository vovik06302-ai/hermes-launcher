'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const requiredFiles = [
  'main.js',
  'preload.js',
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'scripts/quality-check.js',
  'lib/config.js',
  'lib/commands.js',
  'lib/terminal.js',
  'renderer/index.html',
  'renderer/renderer.js',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml'
];

const missing = requiredFiles.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  throw new Error(`Отсутствуют обязательные файлы релиза: ${missing.join(', ')}`);
}

const semver = /^\d+\.\d+\.\d+$/;
if (!semver.test(pkg.version)) {
  throw new Error(`Версия package.json должна быть в формате x.y.z, сейчас: ${pkg.version}`);
}

const tagName = process.env.GITHUB_REF_NAME || process.env.RELEASE_TAG;
if (tagName) {
  const expected = tagName.startsWith('v') ? tagName.slice(1) : tagName;
  if (expected !== pkg.version) {
    throw new Error(`Тег версии ${tagName} не совпадает с package.json: ${pkg.version}`);
  }
}

const build = pkg.build || {};
const win = build.win || {};
if (win.target !== 'nsis') {
  throw new Error('Для релиза должен быть использован nsis target в electron-builder');
}
if (!build.publish || build.publish.provider !== 'github' || build.publish.owner !== 'vovik06302-ai' || build.publish.repo !== 'hermes-launcher') {
  throw new Error('Не настроена конфигурация build.publish для GitHub');
}
if (!build.nsis || build.nsis.oneClick !== false || build.nsis.perMachine !== false) {
  throw new Error('Некорректная конфигурация build.nsis (требуется oneClick: false, perMachine: false)');
}
if (!Array.isArray(build.files) || build.files.length === 0) {
  throw new Error('Не настроен список файлов для сборки Electron');
}

const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
if (!/##\s*(?:\[Unreleased\]|Unreleased)/i.test(changelog)) {
  throw new Error('CHANGELOG.md должен содержать раздел Unreleased');
}
if (!new RegExp(`##\\s*\\[${pkg.version}\\]`).test(changelog)) {
  throw new Error(`CHANGELOG.md должен содержать раздел для версии ${pkg.version}`);
}

const expectedScripts = ['dist', 'dist:dir', 'test:electron', 'quality'];
for (const name of expectedScripts) {
  if (!pkg.scripts || !pkg.scripts[name]) {
    throw new Error(`Отсутствует обязательный npm-скрипт: ${name}`);
  }
}

console.log(`Release preflight OK: version=${pkg.version}, tag=${tagName || 'local-build'}`);
