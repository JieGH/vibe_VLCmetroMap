import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { resolve, join, relative } from 'path';
import { brotliDecompressSync } from 'zlib';
import { describe, it, expect } from 'vitest';
import en from './i18n/translations/en';
import es from './i18n/translations/es';
import ca from './i18n/translations/ca';
import { APP_LEGAL_INFO, APP_LEGAL_INFO_ES, APP_LEGAL_INFO_CA } from './utils/legalInfo';

// #131: Overpass is the app typeface, self-hosted. These tests read the shipped woff2 itself, so the font file, the
// character set it carries and the CSS that points at it cannot drift apart.

const root = resolve(__dirname, '..');
const FONT = join(root, 'public/fonts/Overpass-subset.woff2');
const css = readFileSync(resolve(__dirname, 'index.css'), 'utf-8');
const androidCss = readFileSync(resolve(__dirname, 'android.css'), 'utf-8');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf-8');

// WOFF2's table directory names its common tables by index (spec section 5.1); only the order matters here.
const KNOWN_TAGS = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE',
  'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx',
  'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

// Returns { tableTag: Buffer } for the tables stored untransformed (cmap, GSUB, fvar...), straight from the woff2.
const readWoff2Tables = (buf) => {
  expect(buf.toString('latin1', 0, 4)).toBe('wOF2');
  const numTables = buf.readUInt16BE(12);
  const compressedSize = buf.readUInt32BE(20);
  let p = 48;
  const readBase128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i += 1) {
      const b = buf[p++];
      v = v * 128 + (b & 0x7f);
      if (!(b & 0x80)) return v;
    }
    throw new Error('bad UIntBase128');
  };
  const entries = [];
  for (let i = 0; i < numTables; i += 1) {
    const flags = buf[p++];
    const idx = flags & 0x3f;
    let tag;
    if (idx === 63) { tag = buf.toString('latin1', p, p + 4); p += 4; } else tag = KNOWN_TAGS[idx];
    const version = flags >> 6;
    const origLength = readBase128();
    // glyf and loca are transformed unless version 3; hmtx only when version 1; everything else never.
    const transformed = (tag === 'glyf' || tag === 'loca') ? version !== 3 : (tag === 'hmtx' ? version === 1 : false);
    entries.push({ tag, length: transformed ? readBase128() : origLength });
  }
  const data = brotliDecompressSync(buf.subarray(p, p + compressedSize));
  const tables = {};
  let off = 0;
  entries.forEach(({ tag, length }) => { tables[tag] = data.subarray(off, off + length); off += length; });
  return tables;
};

// The set of code points the font draws, from the cmap formats 4 and 12 (the only ones a Latin subset carries).
const readCmap = (cmap) => {
  const covered = new Set();
  const count = cmap.readUInt16BE(2);
  for (let i = 0; i < count; i += 1) {
    const off = cmap.readUInt32BE(4 + i * 8 + 4);
    const format = cmap.readUInt16BE(off);
    if (format === 4) {
      const segX2 = cmap.readUInt16BE(off + 6);
      const ends = off + 14;
      const starts = ends + segX2 + 2;
      for (let s = 0; s < segX2 / 2; s += 1) {
        const end = cmap.readUInt16BE(ends + s * 2);
        for (let c = cmap.readUInt16BE(starts + s * 2); c <= end && c < 0xffff; c += 1) covered.add(c);
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(off + 12);
      for (let g = 0; g < groups; g += 1) {
        const at = off + 16 + g * 12;
        for (let c = cmap.readUInt32BE(at); c <= cmap.readUInt32BE(at + 4); c += 1) covered.add(c);
      }
    }
  }
  return covered;
};

const gsubFeatureTags = (gsub) => {
  const list = gsub.readUInt16BE(6);
  const n = gsub.readUInt16BE(list);
  return Array.from({ length: n }, (_, i) => gsub.toString('latin1', list + 2 + i * 6, list + 6 + i * 6));
};

const collectStrings = (o, out = []) => {
  if (typeof o === 'string') out.push(o);
  else if (o && typeof o === 'object') Object.values(o).forEach((v) => collectStrings(v, out));
  return out;
};

describe('Overpass font file', () => {
  it('ships next to its SIL Open Font License text', () => {
    expect(existsSync(FONT)).toBe(true);
    const ofl = readFileSync(join(root, 'public/fonts/OFL.txt'), 'utf-8');
    expect(ofl).toContain('The Overpass Project Authors');
    expect(ofl).toContain('SIL OPEN FONT LICENSE Version 1.1');
  });

  it('stays well under 60 KB', () => {
    expect(statSync(FONT).size).toBeLessThan(60 * 1024);
  });

  const tables = existsSync(FONT) ? readWoff2Tables(readFileSync(FONT)) : {};
  const covered = tables.cmap ? readCmap(tables.cmap) : new Set();

  it('is a variable font and carries the tnum and pnum figure features', () => {
    expect(tables.fvar).toBeTruthy();
    const tags = gsubFeatureTags(tables.GSUB);
    expect(tags).toContain('tnum');
    expect(tags).toContain('pnum');
  });

  it('covers every character in the en/es/ca dictionaries and the legal text', () => {
    const missing = new Set();
    [en, es, ca, APP_LEGAL_INFO, APP_LEGAL_INFO_ES, APP_LEGAL_INFO_CA].forEach((src) => {
      collectStrings(src).forEach((text) => {
        for (const ch of text) {
          const cp = ch.codePointAt(0);
          // Emoji (the pin and walker in a few labels) have no place in a text face; the system emoji font draws them.
          if (cp >= 0x1f000) continue;
          if (cp >= 0x20 && !covered.has(cp)) missing.add(`U+${cp.toString(16).toUpperCase()} ${ch}`);
        }
      });
    });
    expect([...missing]).toEqual([]);
  });

  it('covers the prime mark, the middle dot (also inside l·l), the arrows and the dashes', () => {
    ['′', '·', '→', '←', '–', '—', '’', '•', '…', '×', '°'].forEach((ch) => {
      expect(covered.has(ch.codePointAt(0)), ch).toBe(true);
    });
    expect('col·laboradors'.split('').every((ch) => covered.has(ch.codePointAt(0)))).toBe(true);
  });
});

describe('Overpass wiring', () => {
  it('declares a swapping variable @font-face over weights 400 to 800 from the local file', () => {
    const face = css.match(/@font-face\s*\{[^}]*font-family:\s*'Overpass'\s*;[^}]*\}/)?.[0] || '';
    expect(face).toContain("url('/fonts/Overpass-subset.woff2') format('woff2')");
    expect(face).toContain('font-weight: 400 800');
    expect(face).toContain('font-display: swap');
  });

  it('declares a metric-matched fallback face so text does not jump when the font arrives', () => {
    const face = css.match(/@font-face\s*\{[^}]*font-family:\s*'Overpass Fallback'\s*;[^}]*\}/)?.[0] || '';
    expect(face).toContain("src: local('Arial')");
    expect(face).toMatch(/size-adjust:\s*10\d(\.\d+)?%/);
    expect(face).toContain('ascent-override');
    expect(face).toContain('descent-override');
    expect(face).toContain('line-gap-override');
  });

  it('defines one --font-ui token on :root, led by Overpass then its fallback, and uses it for the root', () => {
    const root0 = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] || '';
    expect(root0).toMatch(/--font-ui:\s*'Overpass',\s*'Overpass Fallback',\s*system-ui/);
    expect(root0).toContain('font-family: var(--font-ui)');
  });

  it('applies the token to buttons and form controls, which do not inherit a font by default', () => {
    const rule = css.match(/\nbutton,\s*input,\s*textarea,\s*select\s*\{([^}]*)\}/)?.[1] || '';
    expect(rule).toContain('font-family: var(--font-ui)');
    expect(css).not.toMatch(/font-family:\s*inherit/);
  });

  it('points the Android type token and the welcome screen at the same token', () => {
    expect(androidCss).toMatch(/--md-font:\s*var\(--font-ui\)/);
    expect(androidCss).not.toMatch(/Roboto/);
    expect(css.match(/\.welcome-screen-title\s*\{([^}]*)\}/)?.[1]).toContain('font-family: var(--font-ui)');
    expect(css.match(/\.welcome-screen-subtitle\s*\{([^}]*)\}/)?.[1]).toContain('font-family: var(--font-ui)');
  });

  it('preloads the font file in index.html and names the token on the splash', () => {
    expect(indexHtml).toMatch(/<link rel="preload" href="\/fonts\/Overpass-subset\.woff2" as="font" type="font\/woff2" crossorigin/);
    expect(indexHtml).toContain("font-family:'Overpass','Overpass Fallback'");
  });

  it('sets tabular figures on line badges, arrival times and stop codes', () => {
    const rule = css.match(/\.station-line-badge,[^{]*\{([^}]*)\}/)?.[0] || '';
    ['.station-line-badge', '.station-arrival-due', '.station-arrival-num', '.bus-badge'].forEach((sel) => {
      expect(rule, sel).toContain(sel);
    });
    expect(rule).toContain('font-variant-numeric: tabular-nums');
    const board = readFileSync(resolve(__dirname, 'components/BusStopBoard.jsx'), 'utf-8');
    expect(board).toMatch(/fontVariantNumeric: 'tabular-nums',\s*\n\s*background: 'rgba\(214, 40, 40, 0\.2\)'/);
  });

  // Every shipped file that sets a font names the token, not a system font list of its own.
  const walk = (dir) => readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const shipped = walk(__dirname).filter((p) => /\.(jsx?|css)$/.test(p) && !/\.test\./.test(p));

  it('has no hard-coded system font stack outside the token definition', () => {
    const offenders = shipped
      .filter((p) => p !== resolve(__dirname, 'index.css'))
      .filter((p) => /system-ui|-apple-system|Segoe UI|Roboto|'Inter'/.test(readFileSync(p, 'utf-8')))
      .map((p) => relative(root, p));
    expect(offenders).toEqual([]);
  });

  it('references no external font host anywhere in the shipped app', () => {
    const files = [...shipped, join(root, 'index.html'), join(root, 'netlify.toml'), join(root, 'capacitor.config.json')];
    const offenders = files
      .filter((p) => /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit|fonts\.bunny/.test(readFileSync(p, 'utf-8')))
      .map((p) => relative(root, p));
    expect(offenders).toEqual([]);
  });

  it('adds no Content-Security-Policy that could block the self-hosted font (none is set today)', () => {
    [indexHtml, readFileSync(join(root, 'netlify.toml'), 'utf-8'), readFileSync(join(root, 'capacitor.config.json'), 'utf-8')]
      .forEach((text) => {
        const policy = text.match(/Content-Security-Policy[^\n]*/i)?.[0];
        if (policy) expect(policy).toMatch(/font-src[^;]*'self'/);
      });
  });
});
