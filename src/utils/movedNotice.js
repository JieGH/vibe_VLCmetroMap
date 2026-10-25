// The site now lives at xarxa.net. The old addresses (the Netlify site and the
// workers.dev one) stay up but ask visitors to move, so bookmarks and shared
// links drift over without anyone being cut off.
export const NEW_ADDRESS = 'https://xarxa.net';
export const MOVED_HOST_PATTERN = /\.(netlify\.app|workers\.dev)$/i;
export const MOVED_POSTPONED_KEY = 'xarxa.movedNoticePostponed';
// "Not now" is honoured for a day, then the notice asks again.
export const MOVED_POSTPONE_MS = 24 * 60 * 60 * 1000;

/** The same page on the new address, or null when this already is the new address (or not a retired host). */
export const newAddressFor = (location) => {
  if (!location || !MOVED_HOST_PATTERN.test(location.hostname || '')) return null;
  return `${NEW_ADDRESS}${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
};

export const isPostponed = (now = Date.now(), storage = safeStorage()) => {
  try {
    const at = Number(storage?.getItem(MOVED_POSTPONED_KEY));
    return Number.isFinite(at) && at > 0 && now - at < MOVED_POSTPONE_MS;
  } catch {
    return false;
  }
};

export const postpone = (now = Date.now(), storage = safeStorage()) => {
  try {
    storage?.setItem(MOVED_POSTPONED_KEY, String(now));
  } catch {
    // Not remembered: the notice returns on the next visit, which is the safe direction.
  }
};

function safeStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
