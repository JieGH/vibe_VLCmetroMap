import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  I18nProvider,
  useTranslation,
  getStoredLanguage,
  setStoredLanguage,
  LANGUAGE_STORAGE_KEY,
  INITIAL_LANGUAGE,
  isValidLanguage,
} from './I18nContext';

class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] !== undefined ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  clear() {
    this.store = {};
  }
}

const Probe = () => {
  const { language, t } = useTranslation();
  return <span data-lang={language}>{t('sidebar.textSize')}</span>;
};

describe('useTranslation without a Provider', () => {
  it('defaults to English so standalone component renders/tests are unaffected', () => {
    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain('data-lang="en"');
    expect(html).toContain('Text Size');
  });
});

describe('I18nProvider and language storage helpers', () => {
  let mockStorage;
  const originalWindow = global.window;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    global.window = { localStorage: mockStorage };
  });

  afterAll(() => {
    global.window = originalWindow;
  });

  it('validates supported languages only', () => {
    expect(isValidLanguage('en')).toBe(true);
    expect(isValidLanguage('es')).toBe(true);
    expect(isValidLanguage('fr')).toBe(false);
    expect(isValidLanguage(undefined)).toBe(false);
  });

  it('round-trips a valid language through storage', () => {
    expect(setStoredLanguage('es')).toBe('es');
    expect(getStoredLanguage()).toBe('es');
  });

  it('defaults to Spanish when nothing is stored yet', () => {
    expect(INITIAL_LANGUAGE).toBe('es');
    expect(getStoredLanguage()).toBe('es');
  });

  it('falls back to English for an invalid language', () => {
    expect(setStoredLanguage('fr')).toBe('en');
    expect(getStoredLanguage()).toBe('en');
  });

  it('provider reads the persisted language from localStorage', () => {
    mockStorage.setItem(LANGUAGE_STORAGE_KEY, 'es');
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(html).toContain('data-lang="es"');
    expect(html).toContain('Tamaño de texto');
  });

  it('provider defaults to Spanish for a first-time visitor with nothing stored', () => {
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(html).toContain('data-lang="es"');
    expect(html).toContain('Tamaño de texto');
  });

  it('provider respects an explicit stored English preference', () => {
    mockStorage.setItem(LANGUAGE_STORAGE_KEY, 'en');
    const html = renderToStaticMarkup(
      <I18nProvider>
        <Probe />
      </I18nProvider>
    );
    expect(html).toContain('data-lang="en"');
    expect(html).toContain('Text Size');
  });
});
