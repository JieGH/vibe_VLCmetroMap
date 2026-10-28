import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createThrottle, createBudget, createFetchPolicy, createGestureStore, withPrefetchBuffer,
  BUDGET_MAX, REFETCH_MOVE_M, ANCHOR_MAX_AGE_MS, MID_DRAG_THROTTLE_MS,
} from './centrePinBuffer';

afterEach(() => vi.useRealTimers());
const clock = () => { let t = 0; return { now: () => t, tick: (ms) => { t += ms; } }; };

describe('createThrottle', () => {
  it('runs the first call at once and collapses the rest into one trailing run', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const th = createThrottle(fn, MID_DRAG_THROTTLE_MS);
    th(); expect(fn).toHaveBeenCalledTimes(1);
    th(); th(); th(); expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(MID_DRAG_THROTTLE_MS + 1);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('cancel drops the trailing run', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const th = createThrottle(fn, 300);
    th(); th(); th.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('createBudget', () => {
  it('grants at most max per window and refills after it', () => {
    const c = clock();
    const b = createBudget({ now: c.now });
    expect(b.take(20)).toBe(BUDGET_MAX);
    expect(b.take(1)).toBe(0);
    c.tick(10001);
    expect(b.take(5)).toBe(5);
  });
});

describe('createFetchPolicy', () => {
  const pin = [-0.3557, 39.4667];
  const near = [-0.3557, 39.4667 + 0.0005]; // ~55 m
  const far = [-0.3557, 39.4667 + 0.002]; // ~222 m
  const mk = () => { const c = clock(); return { c, p: createFetchPolicy({ now: c.now, budget: createBudget({ now: c.now }) }) }; };

  it('first plan requests every uncached code', () => {
    const { p } = mk();
    expect(p.plan({ pin, codes: ['1', '2'] })).toMatchObject({ fetch: ['1', '2'], anchorReset: true });
  });
  it('a small pan reuses: nothing refetched for codes already requested', () => {
    const { p } = mk();
    p.plan({ pin, codes: ['1', '2'] });
    expect(p.plan({ pin: near, codes: ['1', '2'] }).fetch).toEqual([]);
  });
  it('a stop that newly entered the radius is fetched, the rest reused', () => {
    const { p } = mk();
    p.plan({ pin, codes: ['1', '2'] });
    expect(p.plan({ pin: near, codes: ['1', '2', '3'] }).fetch).toEqual(['3']);
  });
  it('moving past the anchor distance refetches', () => {
    const { p } = mk();
    p.plan({ pin, codes: ['1'] });
    const r = p.plan({ pin: far, codes: ['1'] });
    expect(REFETCH_MOVE_M).toBeLessThan(222);
    expect(r).toMatchObject({ fetch: ['1'], anchorReset: true });
  });
  it('an old anchor refetches even without movement', () => {
    const { c, p } = mk();
    p.plan({ pin, codes: ['1'] });
    c.tick(ANCHOR_MAX_AGE_MS + 1);
    expect(p.plan({ pin, codes: ['1'] }).fetch).toEqual(['1']);
  });
  it('cached codes cost nothing, in-flight ones join without a token', () => {
    const { p } = mk();
    const r = p.plan({ pin, codes: ['1', '2', '3'], isCached: (c) => c === '1', isInFlight: (c) => c === '2' });
    expect(r.fetch).toEqual(['2', '3']);
  });
  it('beyond the budget nearest stops win and the rest are skipped, then retried later', () => {
    const { c, p } = mk();
    const codes = Array.from({ length: 15 }, (_, i) => String(i));
    const r = p.plan({ pin, codes });
    expect(r.fetch).toHaveLength(BUDGET_MAX);
    expect(r.skipped).toEqual(['12', '13', '14']);
    c.tick(10001);
    expect(p.plan({ pin, codes }).fetch).toEqual(['12', '13', '14']);
  });
});

describe('gesture store and buffer', () => {
  it('notifies only on change; deactivating clears moving', () => {
    const s = createGestureStore();
    const l = vi.fn();
    s.subscribe(l);
    s.setActive(true); s.setActive(true); s.setMoving(true);
    expect(l).toHaveBeenCalledTimes(2);
    s.setActive(false);
    expect(s.getState()).toEqual({ active: false, moving: false });
  });
  it('adds at most a few buffer stops beyond the radius', () => {
    expect(withPrefetchBuffer(['a', 'b'], ['b', 'c', 'd', 'e', 'f', 'g'])).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
});
