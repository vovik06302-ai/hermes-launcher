'use strict';

function compareVersions(left, right) {
  const parse = value => String(value).replace(/^v/i, '').split('.').map(part => Number.parseInt(part, 10) || 0);
  const a = parse(left); const b = parse(right);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? 1 : -1;
  return 0;
}

module.exports = { compareVersions };
