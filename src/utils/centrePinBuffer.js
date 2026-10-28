// Buffered updates for the centre pin (ADR-0013). Pure policy: no timers of its own beyond the
// throttle, no network, no React. Constants here are the source of truth.
import { getDistance } from './geoUtils';

/** Mid-drag local republish cadence (leading + trailing). Local data only, no requests. */
export const MID_DRAG_THROTTLE_MS = 350;
/** Bus arrivals are fetched only this long after the last move (matches CENTRE_PIN_DEBOUNCE_MS). */
export const FETCH_SETTLE_MS = 250;
/** The pin must be this far from the last fetch anchor before expired data is refetched. */
export const REFETCH_MOVE_M = 100;
/** An anchor older than this refetches even if the pin has not moved (stale times must not linger). */
export const ANCHOR_MAX_AGE_MS = 60000;
/** Stops this far beyond the walk radius are prefetched, so a small pan is served from the cache. */
export const PREFETCH_BUFFER_M = 60;
/** At most this many buffer-only stops are added to a fetch. */
export const PREFETCH_MAX_EXTRA = 4;
/** Hard EMT request budget: at most BUDGET_MAX network requests per BUDGET_WINDOW_MS. */
export const BUDGET_MAX = 12;
export const BUDGET_WINDOW_MS = 10000;
/** When the budget skipped stops, look again after this long. */
export const BUDGET_RETRY_MS = 2500;

/** Leading + trailing throttle: the first call runs now, calls inside the window collapse to one trailing run. */
export const createThrottle = (fn, ms = MID_DRAG_THROTTLE_MS, now = () => Date.now()) => {
  let last = -Infinity;
  let timer = null;
  const run = () => { last = now(); timer = null; fn(); };
  const call = () => {
    const wait = ms - (now() - last);
    if (wait <= 0) { if (timer !== null) { clearTimeout(timer); timer = null; } run(); return; }
    if (timer === null) timer = setTimeout(run, wait);
  };
  call.cancel = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  return call;
};

/** Sliding-window request budget. take(n) grants up to n slots, oldest-first expiry. */
export const createBudget = ({ max = BUDGET_MAX, windowMs = BUDGET_WINDOW_MS, now = () => Date.now() } = {}) => {
  let stamps = [];
  const prune = () => { const t = now(); stamps = stamps.filter((s) => t - s < windowMs); };
  return {
    take(n) {
      prune();
      const granted = Math.max(0, Math.min(n, max - stamps.length));
      for (let i = 0; i < granted; i += 1) stamps.push(now());
      return granted;
    },
    remaining() { prune(); return max - stamps.length; },
  };
};

/**
 * Decides which stop codes to hand to the (cached, de-duplicated) fetcher for a pin position.
 * - cached: no request. in flight: joins it, free.
 * - otherwise a request, unless the fetch anchor is still valid (pin within REFETCH_MOVE_M and the anchor
 *   younger than ANCHOR_MAX_AGE_MS) and the stop was already requested from it: reuse, do not refetch.
 * - requests beyond the budget are skipped (nearest first win) and reported so the caller can retry.
 * `codes` are nearest first. A skipped stop is not recorded on the anchor, so a retry picks it up.
 */
export const createFetchPolicy = ({ budget = createBudget(), now = () => Date.now() } = {}) => {
  let anchor = null; // { pin, at, requested: Set }
  return {
    plan({ pin, codes, isCached = () => false, isInFlight = () => false }) {
      const t = now();
      const valid = anchor && t - anchor.at < ANCHOR_MAX_AGE_MS && getDistance(anchor.pin, pin) <= REFETCH_MOVE_M;
      if (!valid) anchor = { pin, at: t, requested: new Set() };
      const join = [];
      const wanted = [];
      for (const code of codes) {
        if (isCached(code)) continue;
        if (isInFlight(code)) { join.push(code); continue; }
        if (valid && anchor.requested.has(code)) continue;
        wanted.push(code);
      }
      const granted = budget.take(wanted.length);
      const network = wanted.slice(0, granted);
      const skipped = wanted.slice(granted);
      network.forEach((c) => anchor.requested.add(c));
      return { fetch: [...join, ...network], skipped, anchorReset: !valid };
    },
    reset() { anchor = null; },
  };
};

/** Gesture state shared between the map (writer) and the bus section (reader). */
export const createGestureStore = () => {
  const listeners = new Set();
  let state = { active: false, moving: false };
  const set = (patch) => {
    const next = { ...state, ...patch };
    if (next.active === state.active && next.moving === state.moving) return;
    state = next;
    listeners.forEach((l) => l());
  };
  return {
    getState: () => state,
    subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
    setActive: (active) => set(active ? { active } : { active, moving: false }),
    setMoving: (moving) => set({ moving }),
  };
};

/** Stop codes (nearest first) inside radius + buffer: the in-radius ones, then up to PREFETCH_MAX_EXTRA beyond. */
export const withPrefetchBuffer = (inRadiusCodes, bufferCodes, maxExtra = PREFETCH_MAX_EXTRA) => {
  const have = new Set(inRadiusCodes);
  return [...inRadiusCodes, ...bufferCodes.filter((c) => !have.has(c)).slice(0, maxExtra)];
};

export const centreGesture = createGestureStore();
export const centreFetchPolicy = createFetchPolicy();
