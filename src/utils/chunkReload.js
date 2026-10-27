// A deploy replaces the hashed chunk files, so a page still running the old build asks for a file that
// is gone and gets an HTML page back. One reload fetches the new build.

const RELOAD_KEY = 'xarxa_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 60_000;

const CHUNK_ERROR_PATTERNS = [
  'not a valid JavaScript MIME type',
  'Failed to fetch dynamically imported module',
  'error loading dynamically imported module',
  'Importing a module script failed',
  'Unable to preload CSS',
];

export function isChunkLoadError(errorOrMessage) {
  const msg = typeof errorOrMessage === 'string' ? errorOrMessage : errorOrMessage?.message || '';
  return CHUNK_ERROR_PATTERNS.some((p) => msg.includes(p));
}

/** Cross-origin or failed-script errors the browser hides: no message detail, file or stack to act on. */
export function isOpaqueScriptError(message, filename) {
  return message === 'Script error.' && !filename;
}

/**
 * Reloads the page once per cooldown window. Returns true when a reload was started, false when one
 * already happened recently (so a genuinely broken deploy cannot loop).
 */
export function reloadOnceForNewBuild() {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: reloading without the guard could loop, so do not reload.
    return false;
  }
  window.location.reload();
  return true;
}

export function setupChunkErrorRecovery() {
  if (typeof window === 'undefined') return;
  // Vite fires this when a dynamic import's preload fails.
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadOnceForNewBuild()) event.preventDefault();
  });
}
