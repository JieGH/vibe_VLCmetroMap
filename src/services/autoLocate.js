// Auto-locate on launch
//
// Takes a User Location without being asked, so a viewer who has already
// allowed it opens the app onto themselves and their Nearest Station. Pure
// scheduling and arbitration: the permission rules live in userLocation.js and
// what a fix does to the screen is App's, handed in as callbacks. Kept out of
// App.jsx so every rule below is testable without a DOM. See ADR-0008.
import { locate, resolveAutoLocate } from './userLocation';

// A glance at the phone between two stops should not move the map; coming back
// to it after a while should. Hidden this long and the last fix is a different
// place, so the app is effectively launching again.
export const RESUME_AFTER_HIDDEN_MS = 5 * 60 * 1000;

/**
 * @param {object} options
 * @param {(fix: object) => void} options.onFix Called with a usable fix: located, with a Nearest Station. Never for a refusal, a timeout or a rough or distant fix, which at launch do nothing.
 * @param {boolean} options.isNative Resume handling is native only; a browser tab is never "returned to".
 * @param {object} [options.provider]
 * @param {Storage|null} [options.storage]
 * @param {() => number} [options.now]
 * @param {{addEventListener: Function, removeEventListener: Function, hidden: boolean}} [options.doc]
 * @param {Function} [options.locateFn]
 * @param {Function} [options.resolveFn]
 */
export const createAutoLocator = ({
  onFix,
  isNative,
  provider,
  storage,
  now = Date.now,
  doc = typeof document !== 'undefined' ? document : null,
  locateFn = locate,
  resolveFn = resolveAutoLocate,
}) => {
  // Bumped by anything that outranks the run in flight: the viewer touching the
  // map, a newer run, the locate button. A result from an older generation is
  // dropped on arrival.
  let generation = 0;
  let running = false;
  let ready = false;
  let pending = null;
  let hiddenAt = null;

  const flush = () => {
    if (!ready || !pending) return;
    const { fix, gen } = pending;
    pending = null;
    if (gen === generation) onFix(fix);
  };

  const accept = (fix, gen) => {
    if (gen !== generation) return;
    if (fix.status !== 'located' || !fix.nearestStation) return;
    pending = { fix, gen };
    flush();
  };

  const run = async () => {
    if (running) return;
    running = true;
    const gen = ++generation;
    try {
      if ((await resolveFn({ provider, isNative, storage })) === 'skip') return;
      const result = await locateFn({
        provider,
        onProgressiveFix: (interim) => accept(interim, gen),
      });
      accept(result, gen);
    } catch {
      // Quiet by contract: a launch-time failure has no one to tell.
    } finally {
      running = false;
    }
  };

  const onVisibility = () => {
    if (doc.hidden) {
      hiddenAt = now();
      return;
    }
    const away = hiddenAt === null ? 0 : now() - hiddenAt;
    hiddenAt = null;
    if (away >= RESUME_AFTER_HIDDEN_MS) run();
  };

  return {
    start() {
      run();
      if (isNative && doc) doc.addEventListener('visibilitychange', onVisibility);
    },
    stop() {
      generation += 1;
      pending = null;
      if (doc) doc.removeEventListener('visibilitychange', onVisibility);
    },
    // The map exists, so a held fix can now be framed.
    setReady() {
      ready = true;
      flush();
    },
    // The viewer chose something (a station, a search, a map gesture) or pressed
    // the locate button: whatever is in flight no longer gets to move anything.
    interrupt() {
      generation += 1;
      pending = null;
    },
  };
};
