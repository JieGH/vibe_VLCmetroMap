export const FONT_SIZE_STORAGE_KEY = 'metro_valencia_font_size';

export const DEFAULT_FONT_SIZE = 'default';

export const FONT_SIZE_CONFIG = {
  small: { id: 'small', label: 'Small', shortLabel: 'S', scale: 0.9 },
  default: { id: 'default', label: 'Default', shortLabel: 'M', scale: 1.0 },
  large: { id: 'large', label: 'Large', shortLabel: 'L', scale: 1.15 },
  xlarge: { id: 'xlarge', label: 'X-Large', shortLabel: 'XL', scale: 1.3 },
};

export const FONT_SIZES = Object.keys(FONT_SIZE_CONFIG);

export const isValidFontSize = (size) => Boolean(size && FONT_SIZE_CONFIG[size]);

/**
 * Reads the persisted font size from localStorage, validating against supported options.
 */
export const getStoredFontSize = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return DEFAULT_FONT_SIZE;
    const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (isValidFontSize(stored)) {
      return stored;
    }
  } catch {
    // Ignore storage quota / access exceptions in sandboxed environments
  }
  return DEFAULT_FONT_SIZE;
};

/**
 * Applies the font size to the root document via attribute and CSS custom property.
 */
export const applyFontSize = (fontSize) => {
  const validSize = FONT_SIZES.includes(fontSize) ? fontSize : DEFAULT_FONT_SIZE;
  const config = FONT_SIZE_CONFIG[validSize] || FONT_SIZE_CONFIG[DEFAULT_FONT_SIZE];

  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-font-size', validSize);
    document.documentElement.style.setProperty('--font-scale', String(config.scale));
  }
  return validSize;
};

/**
 * Persists the user font size selection and updates the DOM immediately.
 */
export const setStoredFontSize = (fontSize) => {
  const validSize = FONT_SIZES.includes(fontSize) ? fontSize : DEFAULT_FONT_SIZE;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, validSize);
    }
  } catch {
    // Ignore storage exceptions
  }
  applyFontSize(validSize);
  return validSize;
};
