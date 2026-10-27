import { describe, it, expect } from 'vitest';
import en from './translations/en';
import es from './translations/es';
import ca from './translations/ca';

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' ? flatten(v, path) : [[path, v]];
  });

const placeholders = (s) => (String(s).match(/\{\{\w+\}\}/g) || []).sort();

const dicts = { en: Object.fromEntries(flatten(en)), es: Object.fromEntries(flatten(es)), ca: Object.fromEntries(flatten(ca)) };

describe('dictionaries', () => {
  it('have exactly the same keys in English, Spanish and Valencian', () => {
    const enKeys = Object.keys(dicts.en).sort();
    expect(Object.keys(dicts.es).sort()).toEqual(enKeys);
    expect(Object.keys(dicts.ca).sort()).toEqual(enKeys);
  });

  it.each(['en', 'es', 'ca'])('%s has no empty or non-string values', (lang) => {
    Object.entries(dicts[lang]).forEach(([key, value]) => {
      expect(typeof value, `${lang}:${key}`).toBe('string');
      expect(value.trim(), `${lang}:${key}`).not.toBe('');
    });
  });

  it('use the same {{placeholders}} in every language', () => {
    Object.keys(dicts.en).forEach((key) => {
      expect(placeholders(dicts.es[key]), `es:${key}`).toEqual(placeholders(dicts.en[key]));
      expect(placeholders(dicts.ca[key]), `ca:${key}`).toEqual(placeholders(dicts.en[key]));
    });
  });
});
