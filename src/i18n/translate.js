import en from './translations/en';
import es from './translations/es';

export const SUPPORTED_LANGUAGES = ['en', 'es'];
export const FALLBACK_LANGUAGE = 'en';

const DICTIONARIES = { en, es };

const getPath = (dict, key) =>
  key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), dict);

const interpolate = (template, vars) => {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  ));
};

/**
 * Looks up `key` (dot-path, e.g. "sidebar.textSize") in `lang`'s dictionary,
 * falling back to English when the language or the key is missing there, and
 * finally to the key itself so a typo shows up as broken text instead of
 * throwing.
 */
export const translate = (lang, key, vars) => {
  const dict = DICTIONARIES[lang] || DICTIONARIES[FALLBACK_LANGUAGE];
  const value = getPath(dict, key) ?? getPath(DICTIONARIES[FALLBACK_LANGUAGE], key);
  if (typeof value !== 'string') return key;
  return interpolate(value, vars);
};

export default translate;
