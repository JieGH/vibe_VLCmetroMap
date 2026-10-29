// #136: the centre pin moving refreshes the walk set and fetches bus arrivals within budget.
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { clearEmtCache } from './emtArrivalService';
import { fetchFeederArrivals, visibleFeederCodes, createLatestGuard, FEEDER_FETCH_BATCH } from './feederArrivalFetch';
import { createCentrePinSync, isCentrePinRefresh, buildCentrePing } from '../utils/centrePin';
import { pickWalkSet, WALK_RADIUS_BUS_METRES } from '../utils/walkRadius';

const xml = `<?xml version='1.0' encoding='UTF-8'?>
<estimacion><solo_parada>
<bus><linea>6</linea><destino><![CDATA[Torrefiel]]></destino><minutos>5 min.</minutos><horaLlegada/><error/><adaptado>0</adaptado></bus><info/>
</solo_parada></estimacion>`;

// Stops spaced ~111 m apart in latitude along a line; the pin walks along it.
const stops = Array.from({ length: 40 }, (_, i) => ({ stopCode: String(1000 + i), coordinates: [-0.375, 39.45 + i * 0.001] }));
const walkCodes = (pin, keep) =>
  pickWalkSet(stops, pin, {
    getCoords: (s) => s.coordinates,
    getKey: (s) => `b:${s.stopCode}`,
    keep,
    radiusMetres: WALK_RADIUS_BUS_METRES,
    allowFallback: false,
  }).items.map(({ item }) => item.stopCode);

describe('#136 centre pin fetches', () => {
  beforeEach(() => clearEmtCache());
  afterEach(() => vi.useRealTimers());

  it('a fast pan across several positions fetches only for the final position', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => ({ ok: true, text: async () => xml }));
    let centre = [-0.375, 39.45];
    const map = {};
    const published = [];
    const sync = createCentrePinSync({
      map,
      getLast: () => published[published.length - 1],
      publish: (c) => published.push(c),
    });
    // Drive the centre without MapLibre: visibleCentreLngLat reads the map.
    const mapCamera = await import('../utils/mapCamera');
    const spy = vi.spyOn(mapCamera, 'visibleCentreLngLat');
    spy.mockImplementation(() => centre);
    for (const lat of [39.455, 39.46, 39.47, 39.48]) {
      centre = [-0.375, lat];
      sync.schedule();
      vi.advanceTimersByTime(100); // each gesture ends before the 250 ms debounce
    }
    vi.advanceTimersByTime(300);
    spy.mockRestore();
    expect(published).toHaveLength(1);
    await fetchFeederArrivals(visibleFeederCodes(walkCodes(published[0])), { fetchFn });
    // Only the nearest batch (what the split view shows) is fetched; the rest waits for a scroll.
    expect(fetchFn).toHaveBeenCalledTimes(visibleFeederCodes(walkCodes([-0.375, 39.48])).length);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(FEEDER_FETCH_BATCH);
  });

  it('never fetches a stop outside the pin radius, and nothing when far from every stop', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, text: async () => xml }));
    const pin = [-0.375, 39.47];
    const codes = walkCodes(pin);
    expect(codes.length).toBeGreaterThan(0);
    await fetchFeederArrivals(visibleFeederCodes(codes, { limit: codes.length }), { fetchFn });
    const called = fetchFn.mock.calls.map(([url]) => String(url).match(/parada=(\d+)/)[1]);
    expect(called.sort()).toEqual([...codes].sort());
    fetchFn.mockClear();
    expect(walkCodes([-0.2, 39.2])).toEqual([]);
    await fetchFeederArrivals(visibleFeederCodes(walkCodes([-0.2, 39.2])), { fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a small move reuses the 20 s cache: only the newly entered stops are requested', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, text: async () => xml }));
    const a = walkCodes([-0.375, 39.47]);
    await fetchFeederArrivals(a, { fetchFn });
    fetchFn.mockClear();
    const b = walkCodes([-0.375, 39.4715], new Set(a.map((c) => `b:${c}`)));
    await fetchFeederArrivals(b, { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(b.filter((c) => !a.includes(c)).length);
  });

  it('keeps a stop just past the radius via the 20 m hysteresis', () => {
    const pin = [-0.375, 39.45];
    const edge = { stopCode: 'E', coordinates: [-0.375, 39.45 + 290 / 111320] };
    const opts = (keep) => ({ getCoords: (s) => s.coordinates, getKey: (s) => `b:${s.stopCode}`, keep, radiusMetres: WALK_RADIUS_BUS_METRES, allowFallback: false });
    expect(pickWalkSet([edge], pin, opts(new Set())).items).toHaveLength(0);
    expect(pickWalkSet([edge], pin, opts(new Set(['b:E']))).items).toHaveLength(1);
  });

  it('drops a response for a pin position that is no longer current', async () => {
    const guard = createLatestGuard();
    const applied = [];
    let release;
    const slow = new Promise((r) => { release = r; });
    const t1 = guard.next();
    const p1 = slow.then(() => { if (guard.isCurrent(t1)) applied.push('old'); });
    const t2 = guard.next();
    applied.push(guard.isCurrent(t2) ? 'new' : 'stale');
    release();
    await p1;
    expect(applied).toEqual(['new']);
  });

  it('marks the centre pin republish so the hub refreshes without a focus ease', () => {
    const { userLocation } = buildCentrePing([-0.37, 39.47], 1);
    expect(isCentrePinRefresh(userLocation)).toBe(false);
    expect(isCentrePinRefresh({ ...userLocation, centrePin: true })).toBe(true);
    expect(isCentrePinRefresh(null)).toBe(false);
  });
});
