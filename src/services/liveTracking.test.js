import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import {
  createLiveTracker,
  createLiveFixChannel,
  MOVING_INTERVAL_MS,
  STATIONARY_INTERVAL_MS,
  STATIONARY_AFTER_MS,
  IDLE_STOP_AFTER_MS,
  ANCHOR_RECOMPUTE_M,
} from './liveTracking';

const ORIGIN = [-0.3763, 39.4699];
// ~111 m per 0.001 deg lat; 1 m ~ 0.000009 deg lat
const north = (m, from = ORIGIN) => [from[0], from[1] + m * 0.000009];

const reading = (coordinates, accuracy = 8) => ({
  coords: { longitude: coordinates[0], latitude: coordinates[1], accuracy },
});

const harness = (overrides = {}) => {
  let clock = 1_000_000;
  const timers = [];
  let cb = null;
  const watches = [];
  const provider = {
    watchPosition: vi.fn(async (options, callback) => {
      cb = callback;
      watches.push(options);
      return `w${watches.length}`;
    }),
    clearWatch: vi.fn(async () => {}),
    getCurrentPosition: vi.fn(async () => reading(ORIGIN)),
    ...overrides.provider,
  };
  const listeners = new Set();
  const doc = {
    hidden: false,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
  };
  const events = { fixes: [], anchors: [], states: [], errors: [] };
  const tracker = createLiveTracker({
    onFix: (f) => events.fixes.push(f),
    onAnchor: (f) => events.anchors.push(f),
    onStateChange: (s) => events.states.push(s),
    onError: (e) => events.errors.push(e),
    provider,
    now: () => clock,
    setTimer: (fn, ms) => { const t = { fn, at: clock + ms }; timers.push(t); return t; },
    clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    doc,
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const advance = async (ms) => {
    const end = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      clock = Math.max(clock, next.at);
      next.fn();
      await settle();
    }
    clock = end;
    await settle();
  };
  const emit = (coordinates, accuracy) => cb(reading(coordinates, accuracy), null);
  const setHidden = async (hidden) => {
    doc.hidden = hidden;
    listeners.forEach((fn) => fn());
    await settle();
  };
  return { tracker, provider, watches, events, advance, emit, settle, setHidden, listeners, errorCb: () => cb, timers };
};

describe('liveTracking', () => {
  let h;
  beforeEach(() => { h = harness(); });

  it('reports moving fixes no faster than the moving cadence', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    expect(h.watches[0].enableHighAccuracy).toBe(true);
    await h.advance(MOVING_INTERVAL_MS);
    h.emit(north(15));
    await h.advance(1000);
    h.emit(north(30)); // inside the 4 s throttle window
    await h.advance(MOVING_INTERVAL_MS);
    h.emit(north(45));
    expect(h.events.fixes.map((f) => f.coordinates[1])).toEqual([north(15)[1], north(45)[1]]);
  });

  it('gates fixes that moved less than 10 m (jitter)', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    await h.advance(MOVING_INTERVAL_MS);
    h.emit(north(5));
    expect(h.events.fixes).toHaveLength(0);
    await h.advance(MOVING_INTERVAL_MS);
    h.emit(north(11));
    expect(h.events.fixes).toHaveLength(1);
  });

  it('widens the gate for noisy fixes and rejects unusable accuracy', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    await h.advance(MOVING_INTERVAL_MS);
    h.emit(north(15), 40); // gate 20 m for a +-40 m fix
    expect(h.events.fixes).toHaveLength(0);
    h.emit(north(300), 900); // beyond MAX_USABLE_ACCURACY_M
    expect(h.events.fixes).toHaveLength(0);
  });

  it('slows to the stationary cadence with low accuracy, and speeds up on movement', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    await h.advance(STATIONARY_AFTER_MS + 100);
    expect(h.tracker.mode).toBe('stationary');
    expect(h.watches[1].enableHighAccuracy).toBe(false);
    expect(h.provider.clearWatch).toHaveBeenCalled();
    await h.advance(STATIONARY_INTERVAL_MS);
    h.emit(north(20));
    expect(h.events.fixes).toHaveLength(1);
    expect(h.tracker.mode).toBe('moving');
    expect(h.watches[2].enableHighAccuracy).toBe(true);
  });

  it('auto-stops into a resumable resting state after the idle period', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    await h.advance(IDLE_STOP_AFTER_MS + 100);
    expect(h.tracker.state).toBe('resting');
    expect(h.provider.clearWatch).toHaveBeenCalledTimes(h.watches.length);
    expect(h.timers).toHaveLength(0);
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    expect(h.tracker.state).toBe('tracking');
  });

  it('only fires onAnchor after the larger movement threshold', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    let m = 0;
    for (let i = 0; i < 3; i += 1) {
      await h.advance(MOVING_INTERVAL_MS);
      m += 12;
      h.emit(north(m));
    }
    expect(h.events.fixes).toHaveLength(3);
    expect(h.events.anchors).toHaveLength(0); // 36 m < 45 m
    await h.advance(MOVING_INTERVAL_MS);
    h.emit(north(m + 12));
    expect(h.events.anchors).toHaveLength(1);
    expect(ANCHOR_RECOMPUTE_M).toBe(45);
    // anchor moved: the next 12 m does not fire again
    await h.advance(MOVING_INTERVAL_MS);
    h.emit(north(m + 24));
    expect(h.events.anchors).toHaveLength(1);
  });

  it('pauses when hidden and resumes with a fresh fix', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    await h.setHidden(true);
    expect(h.tracker.state).toBe('paused');
    expect(h.timers).toHaveLength(0);
    expect(h.provider.clearWatch).toHaveBeenCalled();
    const watchesBefore = h.watches.length;
    h.provider.getCurrentPosition.mockResolvedValueOnce(reading(north(60)));
    await h.setHidden(false);
    await h.settle();
    expect(h.tracker.state).toBe('tracking');
    expect(h.watches.length).toBe(watchesBefore + 1);
    expect(h.provider.getCurrentPosition).toHaveBeenCalledWith(expect.objectContaining({ maximumAge: 0, enableHighAccuracy: true }));
    expect(h.events.fixes).toHaveLength(1);
    expect(h.events.anchors).toHaveLength(1);
  });

  it('does not watch when started while hidden, and starts on return', async () => {
    await h.setHidden(true);
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    expect(h.tracker.state).toBe('paused');
    expect(h.provider.watchPosition).not.toHaveBeenCalled();
    await h.setHidden(false);
    expect(h.provider.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('stop clears the watch, timers and listener, and ignores late fixes', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    h.tracker.stop();
    expect(h.tracker.state).toBe('stopped');
    expect(h.provider.clearWatch).toHaveBeenCalled();
    expect(h.timers).toHaveLength(0);
    expect(h.listeners.size).toBe(0);
    await h.advance(MOVING_INTERVAL_MS);
    h.emit(north(50));
    expect(h.events.fixes).toHaveLength(0);
    h.tracker.stop(); // twice is fine
  });

  it('stops quietly on permission denied, without retrying', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    h.errorCb()(null, { code: 1, message: 'User denied Geolocation' });
    expect(h.events.errors).toEqual(['denied']);
    expect(h.tracker.state).toBe('stopped');
    await h.advance(IDLE_STOP_AFTER_MS);
    expect(h.provider.watchPosition).toHaveBeenCalledTimes(1);
  });

  it('keeps going through a timeout but stops when the watch cannot start', async () => {
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    h.errorCb()(null, { code: 3 });
    expect(h.tracker.state).toBe('tracking');

    const bad = harness({ provider: { watchPosition: vi.fn(async () => { throw { code: 1 }; }) } });
    bad.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await bad.settle();
    expect(bad.events.errors).toEqual(['denied']);
    expect(bad.tracker.state).toBe('stopped');
  });
});

describe('liveTracking lifecycle edges', () => {
  it('start while tracking only re-seeds: one watch, anchor moves to the new seed', async () => {
    const h = harness();
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    h.tracker.start({ coordinates: north(100), accuracy: 8 });
    await h.settle();
    expect(h.tracker.state).toBe('tracking');
    expect(h.timers).toHaveLength(1);
    expect(h.listeners.size).toBe(1);
    await h.advance(MOVING_INTERVAL_MS);
    h.emit(north(112)); // 12 m from the new seed: a fix, but not an anchor
    expect(h.events.fixes).toHaveLength(1);
    expect(h.events.anchors).toHaveLength(0);
  });

  it('stop during the in-flight resume fix drops the late fix', async () => {
    const h = harness();
    h.tracker.start({ coordinates: ORIGIN, accuracy: 8 });
    await h.settle();
    await h.setHidden(true);
    let resolveFix;
    h.provider.getCurrentPosition.mockReturnValueOnce(new Promise((r) => { resolveFix = r; }));
    await h.setHidden(false);
    h.tracker.stop();
    resolveFix(reading(north(200)));
    await h.settle();
    expect(h.events.fixes).toHaveLength(0);
    expect(h.tracker.state).toBe('stopped');
  });
});

describe('createLiveFixChannel', () => {
  it('publishes to subscribers and keeps the latest', () => {
    const channel = createLiveFixChannel();
    const seen = [];
    const off = channel.subscribe((f) => seen.push(f));
    channel.publish({ a: 1 });
    off();
    channel.publish({ a: 2 });
    expect(seen).toEqual([{ a: 1 }]);
    expect(channel.get()).toEqual({ a: 2 });
  });
});
