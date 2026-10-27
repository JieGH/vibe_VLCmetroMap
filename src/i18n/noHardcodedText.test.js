import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Guard: user-visible text must go through t() so it is translated in English, Spanish and Valencian.
// This is a source scan (no parser is installed): it looks for literal words in JSX text and in the
// aria-label / title / placeholder / alt props of non-test components.

const SRC = path.resolve(__dirname, '..');

// Words that are the same in every language (brand and product names, units, symbols). A literal is
// accepted only if every word in it is one of these.
const ALLOWED_WORDS = new Set([
  'Xarxa', 'EMT', 'FGV', 'Metrovalencia', 'Metrovalència', 'GitHub', 'GPS', 'AVL', 'SAE', 'VAL', 'EN', 'ES',
  'xarxa', 'net', 'min', 'km', 'm', 's', 'TRAM', 'M', 'L', 'A', 'B', 'ID', 'OK',
]);

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'translations' ? [] : walk(p);
  return /\.jsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});

const stripComments = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, p1) => p1);

const hasWords = (s) => {
  const words = s.match(/[A-Za-zÀ-ÿ]{2,}/g) || [];
  return words.some((w) => !ALLOWED_WORDS.has(w));
};

const findProblems = (code) => {
  const src = stripComments(code);
  const problems = [];
  // JSX text between > ... < or } ... <, or > ... {
  const textRe = /(?<![=-])([>}])([^<>{}=;[\]\n]*(?:\n[^<>{}=;[\]\n]*)*)(?=[<{])/g;
  let m;
  while ((m = textRe.exec(src))) {
    const text = m[2].replace(/\s+/g, ' ').trim();
    if (!text || /^[&|?:,.\-–—•·+*/%!]*$/.test(text)) continue;
    if (/&&|\|\||\?\?|['"`$]|\w\(/.test(text)) continue; // code, not prose
    if (/^(if|for|while)\s*\(|^[,)]|\) : | : curve|^[A-Z_]+\)$/.test(text)) continue; // code between tags
    if (/^(else|catch|finally|from|import|return|default)\b/.test(text)) continue;
    if (hasWords(text)) problems.push(`text: "${text}"`);
  }
  // literal-valued props
  const propRe = /\b(aria-label|title|placeholder|alt|aria-description|aria-roledescription)=/g;
  while ((m = propRe.exec(src))) {
    let i = m.index + m[0].length;
    let expr;
    if (src[i] === '"' || src[i] === "'") {
      const end = src.indexOf(src[i], i + 1);
      expr = src.slice(i, end + 1);
    } else if (src[i] === '{') {
      let depth = 0;
      let j = i;
      for (; j < src.length; j += 1) {
        if (src[j] === '{') depth += 1;
        else if (src[j] === '}') { depth -= 1; if (depth === 0) break; }
      }
      expr = src.slice(i, j + 1);
    } else continue;
    // drop template substitutions, then take every remaining string literal
    const flat = expr.replace(/\$\{[^}]*\}/g, ' ');
    const lits = flat.match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) || [];
    lits.forEach((l) => {
      const body = l.slice(1, -1);
      if (/^[a-z][A-Za-z0-9_]*([.:-][A-Za-z0-9_]*)*\s*$/.test(body)) return; // identifiers / dictionary keys
      if (hasWords(body)) problems.push(`${m[1]}: ${l}`);
    });
  }
  return problems;
};

describe('no hard-coded user-visible text in components', () => {
  walk(SRC).forEach((file) => {
    const rel = path.relative(SRC, file);
    it(`${rel} has no untranslated literal`, () => {
      expect(findProblems(fs.readFileSync(file, 'utf8'))).toEqual([]);
    });
  });
});

// Text that used to be typed straight into components and services and now comes from the dictionaries
// (JS strings in services, utils and component logic are beyond the JSX scan above, so they are pinned here).
const MOVED_LITERALS = [
  'Toggle expand station panel', 'Accessible bus', 'Parada EMT', 'Open this street bus stop',
  'Live GPS AVL Telemetry', 'Live FGV Telemetry', 'Dismiss bus line ribbon', 'Transit Mode Selector',
  'No EMT bus stops found within walking distance.', 'Live rate limit active', 'Train service refused this network',
  'Refreshed recently. Showing countdown', 'Live update failed. Showing countdown', 'Live predictions are currently unavailable',
  'this station has no live prediction endpoint', 'Multimodal arrivals navigation', 'Ha ocorregut un error imprevist',
  'València Bus Lines', 'Stops Chain on Route', 'Prototype Variant Switcher', 'Collapse station panel',
];

const walkAllSource = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(dir, e.name);
  if (e.isDirectory()) return e.name === 'translations' ? [] : walkAllSource(p);
  return /\.jsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});

describe('moved literals stay in the dictionaries', () => {
  const files = walkAllSource(SRC).map((f) => [path.relative(SRC, f), fs.readFileSync(f, 'utf8')]);
  it.each(MOVED_LITERALS)('"%s" is not typed into any source file', (literal) => {
    const hits = files.filter(([, code]) => code.includes(literal)).map(([f]) => f);
    expect(hits).toEqual([]);
  });
});
