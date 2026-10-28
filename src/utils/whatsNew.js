// Bump the version suffix every release so people who dismissed an older What's New see the new bullets.
export const WHATS_NEW_STORAGE_KEY = 'xarxa_whats_new_seen_1.7.0';

const defaultStorage = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/**
 * Returns true if the user has already seen and dismissed the What's New modal.
 */
export const hasSeenWhatsNew = (storage = defaultStorage()) => {
  try {
    return storage?.getItem(WHATS_NEW_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Marks What's New as seen in localStorage.
 */
export const markWhatsNewSeen = (storage = defaultStorage()) => {
  try {
    storage?.setItem(WHATS_NEW_STORAGE_KEY, '1');
  } catch {
    // Ignore storage exceptions in sandboxed or private browsing environments
  }
};
