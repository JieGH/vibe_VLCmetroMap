import { LATEST_RELEASE_ID } from '../data/changelog';

export const WHATS_NEW_STORAGE_KEY = 'metro_valencia_whats_new_seen';

// Storage can be missing or throw (private windows, blocked site data), and
// the banner must still render, so a failed read means "not seen yet".
export const hasSeenLatestRelease = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(WHATS_NEW_STORAGE_KEY) === LATEST_RELEASE_ID;
  } catch {
    return false;
  }
};

export const markLatestReleaseSeen = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(WHATS_NEW_STORAGE_KEY, LATEST_RELEASE_ID);
  } catch {
    // Not remembered: the banner returns next visit, which is harmless.
  }
};
