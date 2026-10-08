'use strict';
const fs = require('fs');
const path = require('path');

function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  if (hex.length === 8) {
    hex = hex.slice(0, 6);
  }
  const num = parseInt(hex, 16);
  return [ (num >> 16) & 255, (num >> 8) & 255, num & 255 ];
}

function luminance([r, g, b]) {
  const [aR, aG, aB] = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * aR + 0.7152 * aG + 0.0722 * aB;
}

function contrastRatio(hex1, hex2) {
  const rgb1 = hexToRgb(hex1);
  const rgb2 = hexToRgb(hex2);
  const l1 = luminance(rgb1);
  const l2 = luminance(rgb2);
  const bright = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (bright + 0.05) / (dark + 0.05);
}

function checkContrast() {
  const cssPath = path.join(__dirname, '..', 'renderer', 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');

  const themeRegex = /html\[data-theme=([a-z0-9-]+)\]\s*\{([^}]+)\}/g;
  let match;
  const failures = [];
  let checkedCount = 0;

  while ((match = themeRegex.exec(css)) !== null) {
    const themeName = match[1];
    const varsBlock = match[2];
    const vars = {};
    const varRegex = /--([a-z0-9-]+):\s*(#[a-f0-9]+)/gi;
    let varMatch;
    while ((varMatch = varRegex.exec(varsBlock)) !== null) {
      vars[varMatch[1]] = varMatch[2];
    }

    const backgrounds = ['bg', 'panel', 'input-bg'];
    const textVars = ['fg', 'label', 'muted', 'hint', 'danger'];

    for (const bgVar of backgrounds) {
      const bgHex = vars[bgVar];
      if (!bgHex) continue;

      for (const textVar of textVars) {
        const textHex = vars[textVar];
        if (!textHex) continue;

        const ratio = contrastRatio(textHex, bgHex);
        checkedCount++;
        if (ratio < 4.5) {
          failures.push({
            theme: themeName,
            textVar: `--${textVar}`,
            bgVar: `--${bgVar}`,
            textHex,
            bgHex,
            ratio: ratio.toFixed(2)
          });
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error(`ОШИБКА: Найдено ${failures.length} пар с контрастностью менее 4.5:1 (WCAG AA):`);
    for (const f of failures) {
      console.error(`  Тема [${f.theme}]: ${f.textVar} (${f.textHex}) на ${f.bgVar} (${f.bgHex}) => контраст ${f.ratio}:1`);
    }
    process.exit(1);
  }

  console.log(`Проверка контраста пройдена: проверено ${checkedCount} пар цветов во всех темах (всё >= 4.5:1 WCAG AA).`);
}

checkContrast();
