import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import {
  FONT_SIZES,
  FONT_SIZE_CONFIG,
  DEFAULT_FONT_SIZE,
  FONT_SIZE_STORAGE_KEY,
  getStoredFontSize,
  setStoredFontSize,
  applyFontSize,
} from './fontSize';

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
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('fontSize utility', () => {
  let mockStorage;
  let mockAttributes;
  let mockStyles;
  const originalWindow = global.window;
  const originalDocument = global.document;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    mockAttributes = {};
    mockStyles = {};

    global.window = {
      localStorage: mockStorage,
    };

    global.document = {
      documentElement: {
        setAttribute: (k, v) => { mockAttributes[k] = String(v); },
        getAttribute: (k) => mockAttributes[k] ?? null,
        removeAttribute: (k) => { delete mockAttributes[k]; },
        style: {
          setProperty: (k, v) => { mockStyles[k] = String(v); },
          getPropertyValue: (k) => mockStyles[k] ?? '',
          removeProperty: (k) => { delete mockStyles[k]; },
        },
      },
    };
  });

  afterAll(() => {
    global.window = originalWindow;
    global.document = originalDocument;
  });

  it('defines valid font size options and configurations', () => {
    expect(FONT_SIZES).toEqual(['small', 'default', 'large', 'xlarge']);
    expect(DEFAULT_FONT_SIZE).toBe('default');
    expect(FONT_SIZE_STORAGE_KEY).toBe('metro_valencia_font_size');

    expect(FONT_SIZE_CONFIG.small.scale).toBe(0.9);
    expect(FONT_SIZE_CONFIG.default.scale).toBe(1.0);
    expect(FONT_SIZE_CONFIG.large.scale).toBe(1.15);
    expect(FONT_SIZE_CONFIG.xlarge.scale).toBe(1.3);
  });

  it('returns default font size when localStorage is empty', () => {
    expect(getStoredFontSize()).toBe('default');
  });

  it('returns stored font size when a valid value exists', () => {
    mockStorage.setItem(FONT_SIZE_STORAGE_KEY, 'large');
    expect(getStoredFontSize()).toBe('large');

    mockStorage.setItem(FONT_SIZE_STORAGE_KEY, 'xlarge');
    expect(getStoredFontSize()).toBe('xlarge');
  });

  it('falls back to default if stored value is unrecognized or corrupt', () => {
    mockStorage.setItem(FONT_SIZE_STORAGE_KEY, 'gigantic');
    expect(getStoredFontSize()).toBe('default');

    mockStorage.setItem(FONT_SIZE_STORAGE_KEY, '');
    expect(getStoredFontSize()).toBe('default');
  });

  it('persists and applies selected font size', () => {
    const result = setStoredFontSize('large');
    expect(result).toBe('large');
    expect(mockStorage.getItem(FONT_SIZE_STORAGE_KEY)).toBe('large');
    expect(global.document.documentElement.getAttribute('data-font-size')).toBe('large');
    expect(global.document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.15');
  });

  it('ignores invalid values when attempting to set', () => {
    const result = setStoredFontSize('invalid_size');
    expect(result).toBe('default');
    expect(global.document.documentElement.getAttribute('data-font-size')).toBe('default');
    expect(global.document.documentElement.style.getPropertyValue('--font-scale')).toBe('1');
  });

  it('applies data attribute and CSS variable correctly for all sizes', () => {
    applyFontSize('small');
    expect(global.document.documentElement.getAttribute('data-font-size')).toBe('small');
    expect(global.document.documentElement.style.getPropertyValue('--font-scale')).toBe('0.9');

    applyFontSize('xlarge');
    expect(global.document.documentElement.getAttribute('data-font-size')).toBe('xlarge');
    expect(global.document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.3');

    applyFontSize('default');
    expect(global.document.documentElement.getAttribute('data-font-size')).toBe('default');
    expect(global.document.documentElement.style.getPropertyValue('--font-scale')).toBe('1');
  });

  it('handles missing window and document gracefully without throwing', () => {
    delete global.window;
    delete global.document;

    expect(getStoredFontSize()).toBe('default');
    expect(() => applyFontSize('large')).not.toThrow();
    expect(() => setStoredFontSize('large')).not.toThrow();
  });
});
