import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { translate, SUPPORTED_LANGUAGES, FALLBACK_LANGUAGE } from './translate';

export const LANGUAGE_STORAGE_KEY = 'metro_valencia_language';

// The language a first-time visitor sees before ever touching the language
// switcher. Deliberately Spanish (this is a Valencia metro app) rather than
// FALLBACK_LANGUAGE, which stays English — that constant is the *translation*
// fallback (what a missing es key falls back to) and the no-Provider default
// every existing component test renders against; changing it to Spanish
// would flip every one of those tests rather than just the app's first run.
export const INITIAL_LANGUAGE = 'es';

export const isValidLanguage = (lang) => SUPPORTED_LANGUAGES.includes(lang);

/**
 * Reads the persisted UI language from localStorage, defaulting to Spanish
 * when nothing is stored yet or storage is unavailable — a viewer can always
 * switch to English from the sidebar, and that choice then persists.
 */
export const getStoredLanguage = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isValidLanguage(stored)) return stored;
    }
  } catch {
    // Ignore storage quota / access exceptions in sandboxed environments
  }
  return INITIAL_LANGUAGE;
};

export const setStoredLanguage = (lang) => {
  const validLang = isValidLanguage(lang) ? lang : FALLBACK_LANGUAGE;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, validLang);
    }
  } catch {
    // Ignore storage exceptions
  }
  return validLang;
};

// Default context value used by every component rendered without a
// surrounding <I18nProvider> (all of this app's existing component tests do
// exactly that) — it is a fully working English translator, not a stub, so
// those components keep rendering the same English copy they always have.
const defaultContextValue = {
  language: FALLBACK_LANGUAGE,
  setLanguage: () => {},
  t: (key, vars) => translate(FALLBACK_LANGUAGE, key, vars),
};

const I18nContext = createContext(defaultContextValue);

export const I18nProvider = ({ children }) => {
  const [language, setLanguageState] = useState(getStoredLanguage);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = (lang) => {
    setLanguageState(setStoredLanguage(lang));
  };

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (key, vars) => translate(language, key, vars),
  }), [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useTranslation = () => useContext(I18nContext);

export default I18nContext;
