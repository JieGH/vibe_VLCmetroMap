// Live tracking
//
// After the viewer has located themselves, keep following them while the app is
// open and visible (#104, ADR-0012). A small state machine over the existing
// `watchLocation`: it decides how often to sample, which fixes are worth
// reporting, and when to stop. It does not touch React, the map or the network;
// App.jsx hands in callbacks. Provider, clock, timers and document are all
// injectable so every rule below is testable without a phone.
//
// Battery is the constraint, so every constant is the cheapest value that still
// feels live while walking.
import { watchLocation, defaultProvider, classifyError, MAX_USABLE_ACCURACY_M } from './userLocation';
import { getDistance } from '../utils/geoUtils';

// Moving: a fix at most every 4 s, high accuracy. Walking pace is ~1.4 m/s, so 4 s is a ~6 m step: the dot
// looks continuous (the marker is a CSS-cheap setLngLat) without keeping the GPS chip at full duty.
export const MOVING_INTERVAL_MS = 4000;
// Stationary: a fix at most every 20 s, with enableHighAccuracy false (Wi-Fi/cell, GPS chip off). Still quick
// enough to notice you set off again.
export const STATIONARY_INTERVAL_MS = 20000;
// A fix closer than this to the last reported one is not movement: it is GPS jitter. For noisy fixes the gate
// widens to half the reported accuracy, capped at JITTER_GATE_CAP_M, so a +-30 m fix does not look like walking.
export const MIN_MOVE_M = 10;
export const JITTER_GATE_CAP_M = 25;
// No movement for this long and we drop to the stationary cadence.
export const STATIONARY_AFTER_MS = 30000;
// No movement for this long and tracking ends in the resumable 'resting' state (pressing locate resumes it).
export const IDLE_STOP_AFTER_MS = 10 * 60 * 1000;
// Nearby stops, the 5-minute-walk nodes and the "Where you're at" hub are recomputed only once the viewer has
// moved this far from where they were last computed (the 'anchor'). 5-minute walk radius is 375 m, so 45 m
// changes at most a few markers while skipping ~90% of per-fix recomputation.
export const ANCHOR_RECOMPUTE_M = 45;

export const MOVING_WATCH_OPTIONS = { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 };
export const STATIONARY_WATCH_OPTIONS = { enableHighAccuracy: false, timeout: 30000, maximumAge: STATIONARY_INTERVAL_MS };
// The fresh fix taken when returning to the foreground: never a cached one.
export const RESUME_FIX_OPTIONS = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 };

const moveGate = (accuracy) => (
  Number.isFinite(accuracy)
    ? Math.max(MIN_MOVE_M, Math.min(accuracy * 0.5, JITTER_GATE_CAP_M))
    : MIN_MOVE_M
);

/**
 * A channel that carries per-fix positions straight to the map marker without going through React state, so a
 * fix every few seconds never re-renders the app.
 */
export const createLiveFixChannel = () => {
  let current = null;
  const listeners = new Set();
  return {
    publish(fix) {
      current = fix;
      listeners.forEach((fn) => fn(fix));
    },
    get: () => current,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
};

/**
 * @param {object} options
 * @param {(fix: {coordinates: [number, number], accuracy: number|null, updatedAt: number}) => void} options.onFix Every reported fix (distance- and accuracy-gated): move the dot only.
 * @param {(fix: object) => void} [options.onAnchor] Called when the viewer has moved ANCHOR_RECOMPUTE_M from the last anchor: recompute dependants.
 * @param {(state: string) => void} [options.onStateChange] 'tracking' | 'paused' | 'resting' | 'stopped'
 * @param {(status: 'denied'|'unavailable') => void} [options.onError] Tracking has stopped for good (no retry).
 * @param {object} [options.provider]
 * @param {() => number} [options.now]
 * @param {Function} [options.setTimer]
 * @param {Function} [options.clearTimer]
 * @param {{hidden: boolean, addEventListener: Function, removeEventListener: Function}|null} [options.doc]
 */
export const createLiveTracker = ({
  onFix,
  onAnchor = () => {},
  onStateChange = () => {},
  onError = () => {},
  provider = defaultProvider,
  now = Date.now,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  doc = typeof document !== 'undefined' ? document : null,
}) => {
  let state = 'stopped';
  let mode = 'moving';
  let stopWatch = null;
  let timer = null;
  let lastFix = null; // last reported fix
  let anchor = null; // where dependants were last computed
  let lastMoveAt = 0;
  let generation = 0; // invalidates in-flight async work on stop/pause
  let foreground = !doc || !doc.hidden;

  const setState = (next) => {
    if (state === next) return;
    state = next;
    onStateChange(next);
  };

  const clearTimers = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const endWatch = () => {
    if (stopWatch) stopWatch();
    stopWatch = null;
  };

  const fail = (status) => {
    generation += 1;
    clearTimers();
    endWatch();
    setState('stopped');
    onError(status);
  };

  const handleError = (status) => {
    // A timeout is the plugin saying "nothing yet", not a loss; the watch carries on. Denial and a dead GPS end
    // tracking quietly, with no retry loop.
    if (status === 'denied' || status === 'unavailable') fail(status);
  };

  const report = (fix, { force = false } = {}) => {
    const at = now();
    const moved = !lastFix || getDistance(lastFix.coordinates, fix.coordinates) >= moveGate(fix.accuracy);
    if (!moved && !force) return;
    lastFix = { coordinates: fix.coordinates, accuracy: fix.accuracy };
    lastMoveAt = at;
    onFix({ coordinates: fix.coordinates, accuracy: fix.accuracy, updatedAt: at });
    if (mode === 'stationary') setMode('moving');
    if (!anchor || getDistance(anchor.coordinates, fix.coordinates) >= ANCHOR_RECOMPUTE_M) {
      const first = !anchor;
      anchor = fix;
      if (!first) onAnchor({ coordinates: fix.coordinates, accuracy: fix.accuracy, updatedAt: at });
    }
    schedule();
  };

  const beginWatch = () => {
    endWatch();
    const moving = mode === 'moving';
    stopWatch = watchLocation({
      provider,
      now,
      watchOptions: moving ? MOVING_WATCH_OPTIONS : STATIONARY_WATCH_OPTIONS,
      minIntervalMs: moving ? MOVING_INTERVAL_MS : STATIONARY_INTERVAL_MS,
      onFix: (fix) => { if (state === 'tracking') report(fix); },
      onError: handleError,
    });
  };

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    if (state === 'tracking') beginWatch();
  }

  // One timer, aimed at the next thing that can change: the stationary slow-down, then the idle stop.
  function schedule() {
    clearTimers();
    if (state !== 'tracking') return;
    const at = now();
    const slowAt = lastMoveAt + STATIONARY_AFTER_MS;
    const stopAt = lastMoveAt + IDLE_STOP_AFTER_MS;
    const next = mode === 'moving' ? slowAt : stopAt;
    timer = setTimer(evaluate, Math.max(0, next - at));
  }

  function evaluate() {
    timer = null;
    if (state !== 'tracking') return;
    const idle = now() - lastMoveAt;
    if (idle >= IDLE_STOP_AFTER_MS) {
      generation += 1;
      endWatch();
      setState('resting');
      return;
    }
    if (idle >= STATIONARY_AFTER_MS) setMode('stationary');
    schedule();
  }

  const freshFixThenWatch = async () => {
    const gen = ++generation;
    mode = 'moving';
    lastMoveAt = now();
    setState('tracking');
    beginWatch();
    schedule();
    if (typeof provider.getCurrentPosition !== 'function') return;
    try {
      const reading = await provider.getCurrentPosition(RESUME_FIX_OPTIONS);
      if (gen !== generation || state !== 'tracking' || !reading?.coords) return;
      const accuracy = Number.isFinite(reading.coords.accuracy) ? reading.coords.accuracy : null;
      if (accuracy !== null && accuracy > MAX_USABLE_ACCURACY_M) return;
      report({ coordinates: [reading.coords.longitude, reading.coords.latitude], accuracy }, { force: true });
    } catch (error) {
      handleError(classifyError(error));
    }
  };

  const pause = () => {
    if (state !== 'tracking') return;
    generation += 1;
    clearTimers();
    endWatch();
    setState('paused');
  };

  const onVisibility = () => tracker.setForeground(!doc.hidden);

  const tracker = {
    get state() { return state; },
    get mode() { return mode; },

    /**
     * Begin (or re-seed) tracking from a fix the caller already holds. Calling it again while tracking just
     * moves the seed, so every locate-button press can call it.
     */
    start(seed) {
      if (seed?.coordinates) {
        lastFix = { coordinates: seed.coordinates, accuracy: seed.accuracy ?? null };
        anchor = lastFix;
      }
      if (doc && state === 'stopped') doc.addEventListener('visibilitychange', onVisibility);
      if (doc) foreground = !doc.hidden;
      if (!foreground) {
        generation += 1;
        clearTimers();
        endWatch();
        setState('paused');
        return;
      }
      generation += 1;
      mode = 'moving';
      lastMoveAt = now();
      setState('tracking');
      beginWatch();
      schedule();
    },

    stop() {
      generation += 1;
      clearTimers();
      endWatch();
      lastFix = null;
      anchor = null;
      if (doc) doc.removeEventListener('visibilitychange', onVisibility);
      setState('stopped');
    },

    // Page visibility and the Capacitor App state both land here.
    setForeground(isForeground) {
      foreground = isForeground;
      if (state === 'stopped' || state === 'resting') return;
      if (!isForeground) pause();
      else if (state === 'paused') freshFixThenWatch();
    },
  };

  return tracker;
};
