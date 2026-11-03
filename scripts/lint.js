'use strict';

// Проверка синтаксиса всех JS-файлов проекта через node --check.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', 'dist', 'dist-final', '.git', '.data']);
const files = [];

(function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
})(root);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failed += 1;
    console.error(`Синтаксическая ошибка: ${path.relative(root, file)}\n${error.stderr || error.message}`);
  }
}

if (failed) {
  console.error(`Проверка не пройдена: ошибок ${failed} из ${files.length} файлов.`);
  process.exit(1);
}
console.log(`Синтаксис в порядке: проверено файлов ${files.length}.`);
