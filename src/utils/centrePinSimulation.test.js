// Scripted drag simulation (no browser): real gate, throttle, debounce sync, gesture store, fetch policy and
// the cached EMT fetcher, with a fake map and a counting fetch. Mirrors what MapView + ConnectingBusSection wire.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCentrePinSync, createUserGestureGate, movedEnough } from './centrePin';
import {
  createThrottle, createFetchPolicy, createGestureStore, createBudget, withPrefetchBuffer,
  MID_DRAG_THROTTLE_MS, BUDGET_MAX, BUDGET_WINDOW_MS,
} from './centrePinBuffer';
import { pickWalkSet, WALK_RADIUS_BUS_METRES } from './walkRadius';
import { PREFETCH_BUFFER_M } from './centrePinBuffer';
import { clearEmtCache, fetchStopArrivals, getEmtCachedArrivals, isEmtInFlight } from '../services/emtArrivalService';
import * as mapCamera from './mapCamera';

const xml = `<?xml version='1.0'?><estimacion><solo_parada><bus><linea>6</linea><destino><![CDATA[X]]></destino><minutos>5 min.</minutos><horaLlegada/><error/><adaptado>0</adaptado></bus><info/></solo_parada></estimacion>`;
// A grid of stops every ~55 m along a street (dense city).
const stops = Array.from({ length: 400 }, (_, i) => ({ stopCode: String(1000 + i), coordinates: [-0.3557, 39.44 + i * 0.0005] }));

const setup = () => {
  const requested = [];
  const fetchFn = vi.fn(async (url) => { requested.push({ t: Date.now(), code: /parada=(\d+)/.exec(url)[1] }); return { ok: true, text: async () => xml }; });
  const store = createGestureStore();
  store.setActive(true);
  const policy = createFetchPolicy({ budget: createBudget() });
  let centre = [-0.3557, 39.46];
  const spy = vi.spyOn(mapCamera, 'visibleCentreLngLat').mockImplementation(() => centre);
  const published = [];
  let last = null;
  const publish = (c) => { last = c; published.push({ t: Date.now(), c, moving: store.getState().moving }); };
  const sync = createCentrePinSync({ map: {}, getLast: () => last, publish, onSettle: () => store.setMoving(false) });
  const mid = createThrottle(() => { const c = mapCamera.visibleCentreLngLat({}); if (movedEnough(last, c)) publish(c); });
  const gate = createUserGestureGate(sync.schedule, { onHandStart: () => store.setMoving(true), onHandMove: mid });
  // What ConnectingBusSection does when the pin changes and the gesture is not moving.
  const fetchRound = async () => {
    if (store.getState().moving || !last) return;
    const inR = pickWalkSet(stops, last, { getCoords: (s) => s.coordinates, getKey: (s) => s.stopCode, radiusMetres: WALK_RADIUS_BUS_METRES, allowFallback: false }).items.map(({ item }) => item.stopCode);
    const buf = pickWalkSet(stops, last, { getCoords: (s) => s.coordinates, getKey: (s) => s.stopCode, radiusMetres: WALK_RADIUS_BUS_METRES + PREFETCH_BUFFER_M, allowFallback: false }).items.map(({ item }) => item.stopCode);
    const plan = policy.plan({ pin: last, codes: withPrefetchBuffer(inR.slice(0, 8), buf), isCached: (c) => getEmtCachedArrivals(c) !== null, isInFlight: isEmtInFlight });
    await Promise.all(plan.fetch.map((c) => fetchStopArrivals(c, { fetchFn })));
  };
  const drag = async (lats, stepMs) => {
    const ev = { originalEvent: {} };
    gate.onUserStart(ev);
    for (const lat of lats) { centre = [-0.3557, lat]; gate.onMove(); await vi.advanceTimersByTimeAsync(stepMs); await fetchRound(); }
    gate.onMoveEnd();
    await vi.advanceTimersByTimeAsync(300);
    await fetchRound();
  };
  return { requested, published, store, drag, fetchRound, spy, setCentre: (c) => { centre = c; } };
};

describe('centre pin drag simulation (scripted, no browser)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); clearEmtCache(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('slow short pan: pin follows live mid-drag, no request until settled, buffer serves the next small pan', async () => {
    const s = setup();
    await s.drag([39.4601, 39.4602, 39.4603, 39.4604, 39.4605, 39.4606], 150);
    const midDrag = s.published.filter((p) => p.moving);
    expect(midDrag.length).toBeGreaterThan(1);
    expect(s.requested.length).toBeGreaterThan(0);
    expect(s.requested.every((r) => r.t >= s.published[s.published.length - 1].t - 1)).toBe(true);
    const first = s.requested.length;
    await s.drag([39.4608, 39.461], 150);
    expect(s.requested.length - first).toBeLessThanOrEqual(2);
    console.log('slow pan: published', s.published.length, 'mid-drag', midDrag.length, 'requests', first, 'after small pan +', s.requested.length - first);
  });

  it('fast long pan across the city: no request mid-drag, requests stay inside the budget window', async () => {
    const s = setup();
    const lats = Array.from({ length: 12 }, (_, i) => 39.44 + i * 0.012);
    await s.drag(lats, 120);
    const inWindow = s.requested.filter((r) => r.t <= BUDGET_WINDOW_MS);
    expect(inWindow.length).toBeLessThanOrEqual(BUDGET_MAX);
    console.log('fast pan: published', s.published.length, 'requests', s.requested.length);
  });

  it('back-and-forth jitter: no refetch for the same stops', async () => {
    const s = setup();
    await s.drag([39.46], 100);
    const base = s.requested.length;
    await s.drag([39.4604, 39.4598, 39.4605, 39.4597, 39.4603, 39.4599], 100);
    // A few metres of jitter can swap the last stop of the nearest batch for the next one: at most one cheap request.
    expect(s.requested.length - base).toBeLessThanOrEqual(1);
    console.log('jitter: base', base, 'extra', s.requested.length - base);
  });

  it('idle makes no requests', async () => {
    const s = setup();
    await s.drag([39.46], 100);
    const n = s.requested.length;
    await vi.advanceTimersByTimeAsync(30000);
    expect(s.requested.length).toBe(n);
  });
});
