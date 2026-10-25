// The site now lives at xarxa.net. The old addresses (the Netlify site and the
// workers.dev one) stay up but ask visitors to move, so bookmarks and shared
// links drift over without anyone being cut off.
export const NEW_ADDRESS = 'https://xarxa.net';
export const MOVED_HOST_PATTERN = /\.(netlify\.app|workers\.dev)$/i;
// The notice opens on every visit. Dismissing it ("Not now") only hides it for this long; a page left open
// asks again after that.
export const MOVED_REMIND_MS = 60 * 60 * 1000;

/** The same page on the new address, or null when this already is the new address (or not a retired host). */
export const newAddressFor = (location) => {
  if (!location || !MOVED_HOST_PATTERN.test(location.hostname || '')) return null;
  return `${NEW_ADDRESS}${location.pathname || '/'}${location.search || ''}${location.hash || ''}`;
};
