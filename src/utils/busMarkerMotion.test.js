import { describe, it, expect } from 'vitest';
import { createBusMotion, MAX_SNAP_GAP_M, MIN_EASE_MS, MAX_EASE_MS } from './busMarkerMotion';
import { getLine19Route, pointAtAlongM, distanceM, projectOnShape } from './busRoute';

const dir = getLine19Route().directions[0];
const P = (m) => pointAtAlongM(dir, m).lonLat;
const bus = (id, along, fixTimeMs, prevFixTimeMs = null, over = {}) => ({
  id, directionKey: dir.id, alongM: along, snappedLonLat: P(along), fixTimeMs, prevFixTimeMs,
  headingDeg: 90, stale: false, ...over,
});
const alongOf = (ll) => projectOnShape(dir, ll, { hintAlongM: 1000, windowM: 3000 }).alongM;

describe('busMarkerMotion', () => {
  it('places a new bus straight on its fix with its heading', () => {
    const m = createBusMotion();
    m.update([bus('a', 1000, 100000)], 0);
    const s = m.sample('a', 0);
    expect(distanceM(s.lonLat, P(1000))).toBeLessThan(1);
    expect(s.headingDeg).toBe(90);
  });

  it('eases along the route from the old fix to the new over the fix interval, never overshooting', () => {
    const m = createBusMotion();
    m.update([bus('a', 1000, 100000)], 0);
    m.update([bus('a', 1300, 130000, 100000)], 1000);
    const half = alongOf(m.sample('a', 1000 + 15000).lonLat);
    expect(half).toBeGreaterThan(1050);
    expect(half).toBeLessThan(1250);
    let last = 1000;
    for (let t = 1000; t <= 1000 + 60000; t += 500) {
      const a = alongOf(m.sample('a', t).lonLat);
      expect(a).toBeGreaterThanOrEqual(last - 1);
      expect(a).toBeLessThanOrEqual(1301);
      last = a;
    }
    expect(distanceM(m.sample('a', 1000 + 60000).lonLat, P(1300))).toBeLessThan(1);
  });

  it('holds at the latest fix once reached', () => {
    const m = createBusMotion();
    m.update([bus('a', 500, 1000)], 0);
    m.update([bus('a', 700, 31000, 1000)], 0);
    const end = m.sample('a', 10 * 60000).lonLat;
    expect(distanceM(end, P(700))).toBeLessThan(1);
    expect(m.isSettled(10 * 60000)).toBe(true);
    expect(m.isSettled(1000)).toBe(false);
  });

  it('clamps the ease duration', () => {
    const m = createBusMotion();
    m.update([bus('a', 0, 1000)], 0);
    m.update([bus('a', 100, 1500, 1000)], 0); // 0.5 s fix gap
    expect(m.isSettled(MIN_EASE_MS - 1)).toBe(false);
    expect(m.isSettled(MIN_EASE_MS)).toBe(true);
    m.update([bus('a', 200, 9999999, 1500)], 0);
    expect(m.isSettled(MAX_EASE_MS - 1)).toBe(false);
    expect(m.isSettled(MAX_EASE_MS)).toBe(true);
  });

  it('starts a new ease from where the marker is now, not from the old fix (no jump)', () => {
    const m = createBusMotion();
    m.update([bus('a', 0, 0)], 0);
    m.update([bus('a', 400, 30000, 0)], 0);
    const mid = m.sample('a', 15000).lonLat;
    m.update([bus('a', 600, 60000, 30000)], 15000);
    expect(distanceM(m.sample('a', 15000).lonLat, mid)).toBeLessThan(1);
  });

  it('never moves a marker backwards when the new fix is behind it', () => {
    const m = createBusMotion();
    m.update([bus('a', 500, 0)], 0);
    m.update([bus('a', 400, 30000, 0)], 0);
    expect(alongOf(m.sample('a', 60000).lonLat)).toBeGreaterThan(495);
  });

  it('snaps on an implausibly large forward gap', () => {
    const m = createBusMotion();
    m.update([bus('a', 0, 0)], 0);
    m.update([bus('a', MAX_SNAP_GAP_M + 500, 30000, 0)], 0);
    expect(distanceM(m.sample('a', 0).lonLat, P(MAX_SNAP_GAP_M + 500))).toBeLessThan(1);
  });

  it('holds the last heading when the new one is null and has no arrow before the first heading', () => {
    const m = createBusMotion();
    m.update([bus('a', 0, 0, null, { headingDeg: null })], 0);
    expect(m.sample('a', 0).headingDeg).toBeNull();
    m.update([bus('a', 100, 30000, 0, { headingDeg: 45 })], 0);
    m.update([bus('a', 150, 60000, 30000, { headingDeg: null })], 0);
    expect(m.sample('a', 0).headingDeg).toBe(45);
  });

  it('turns the short way round north (no spin)', () => {
    const m = createBusMotion();
    m.update([bus('a', 0, 0, null, { headingDeg: 350 })], 0);
    m.update([bus('a', 10, 30000, 0, { headingDeg: 10 })], 0);
    expect(m.sample('a', 0).headingDeg).toBe(370);
  });

  it('falls back to a straight line without a route position, and snaps if far', () => {
    const m = createBusMotion();
    const a = [-0.37, 39.47];
    const b = [-0.3697, 39.47];
    const nb = (ll, f, p) => ({ id: 'x', directionKey: null, alongM: null, snappedLonLat: ll, fixTimeMs: f, prevFixTimeMs: p, headingDeg: 0, stale: false });
    m.update([nb(a, 0, null)], 0);
    m.update([nb(b, 30000, 0)], 0);
    const mid = m.sample('x', 15000).lonLat;
    expect(mid[0]).toBeGreaterThan(a[0]);
    expect(mid[0]).toBeLessThan(b[0]);
    m.update([nb([-0.2, 39.5], 60000, 30000)], 30000);
    expect(m.sample('x', 30000).lonLat).toEqual([-0.2, 39.5]);
  });

  it('drops buses that are gone or stale', () => {
    const m = createBusMotion();
    m.update([bus('a', 0, 0), bus('b', 100, 0)], 0);
    m.update([bus('a', 0, 0, null, { stale: true })], 0);
    expect(m.sample('a', 0)).toBeNull();
    expect(m.sample('b', 0)).toBeNull();
    expect(m.ids()).toEqual([]);
  });

  it('is unchanged by a repeat of the same fix', () => {
    const m = createBusMotion();
    m.update([bus('a', 0, 0)], 0);
    m.update([bus('a', 300, 30000, 0)], 0);
    m.update([bus('a', 300, 30000, 0)], 10000);
    const s = alongOf(m.sample('a', 10000).lonLat);
    expect(s).toBeGreaterThan(50);
    expect(s).toBeLessThan(250);
  });
});
