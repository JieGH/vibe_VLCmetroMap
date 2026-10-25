// Android follows the phone's dark/light setting until the viewer picks a
// theme in the app; the web and iOS keep their dark default.
const QUERY = '(prefers-color-scheme: dark)';

const defaultMatchMedia = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : null;

/** 'dark' or 'light' for the first render. */
export const initialTheme = (android, matchMedia = defaultMatchMedia()) => {
  if (!android || !matchMedia) return 'dark';
  try {
    return matchMedia(QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
};

/**
 * Calls onChange('dark'|'light') whenever the system setting changes. Returns
 * an unsubscribe function. The caller decides whether an explicit choice wins.
 */
export const watchSystemTheme = (onChange, matchMedia = defaultMatchMedia()) => {
  if (!matchMedia) return () => {};
  let mql;
  try {
    mql = matchMedia(QUERY);
  } catch {
    return () => {};
  }
  const listener = (e) => onChange(e.matches ? 'dark' : 'light');
  if (mql.addEventListener) mql.addEventListener('change', listener);
  else if (mql.addListener) mql.addListener(listener);
  return () => {
    if (mql.removeEventListener) mql.removeEventListener('change', listener);
    else if (mql.removeListener) mql.removeListener(listener);
  };
};
