import { describe, it, expect } from 'vitest';
import { translate, SUPPORTED_LANGUAGES, FALLBACK_LANGUAGE } from './translate';
import en from './translations/en';
import es from './translations/es';

const flattenKeys = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'object' && v !== null ? flattenKeys(v, path) : [path];
  });

describe('translate', () => {
  it('defaults to English', () => {
    expect(FALLBACK_LANGUAGE).toBe('en');
    expect(SUPPORTED_LANGUAGES).toContain('en');
    expect(SUPPORTED_LANGUAGES).toContain('es');
  });

  it('looks up a dot-path key in the requested language', () => {
    expect(translate('en', 'sidebar.textSize')).toBe('Text Size');
    expect(translate('es', 'sidebar.textSize')).toBe('Tamaño de texto');
  });

  it('interpolates {{vars}} into the template', () => {
    expect(translate('en', 'app.lineFilterBanner', { lines: '1, 3' })).toBe('Lines 1, 3 only');
    expect(translate('es', 'app.lineFilterBanner', { lines: '1, 3' })).toBe('Solo líneas 1, 3');
  });

  it('leaves an unmatched placeholder untouched', () => {
    expect(translate('en', 'sidebar.textSize', { unused: 'x' })).toBe('Text Size');
  });

  it('falls back to English for an unknown language', () => {
    expect(translate('fr', 'sidebar.textSize')).toBe(translate('en', 'sidebar.textSize'));
    expect(translate(undefined, 'sidebar.textSize')).toBe(translate('en', 'sidebar.textSize'));
  });

  it('falls back to the key itself for an unknown key', () => {
    expect(translate('en', 'nope.not.a.key')).toBe('nope.not.a.key');
  });

  it('keeps the English and Spanish dictionaries in sync (same key set)', () => {
    const enKeys = flattenKeys(en).sort();
    const esKeys = flattenKeys(es).sort();
    expect(esKeys).toEqual(enKeys);
  });
});
