import { describe, it, expect, vi } from 'vitest';
import { candidates, tick, stationAfter, MAX_PER_TICK } from './trainTracker';

const train = (o) => ({ isLive: true, line: '3', isForward: true, isDeadReckoned: false, secondsToTarget: 10, targetStation: 'A', ...o });
const after = (l, s) => `${s}+`;

describe('candidates', () => {
  it('takes the station after a target that is due soon, most urgent first', () => {
    const r = candidates([train({ targetStation: 'B', secondsToTarget: 20 }), train({ targetStation: 'C', secondsToTarget: 5 })], after);
    expect(r).toEqual(['C+', 'B+']);
  });
  it('ignores far trains and non-live ones, refreshes the target of dead-reckoned ones, dedupes', () => {
    const r = candidates([
      train({ secondsToTarget: 200 }),
      train({ isLive: false }),
      train({ isDeadReckoned: true, targetStation: 'D', secondsToTarget: 100 }),
      train({ isDeadReckoned: true, targetStation: 'D', secondsToTarget: 90 }),
    ], after);
    expect(r).toEqual(['D']);
  });
});

describe('stationAfter', () => {
  it('walks the chain by direction', () => {
    const a = { name: 'A' }, b = { name: 'B' }, c = { name: 'C' };
    const engine = { getLineStations: () => [a, b, c], findStation: (l, n) => [a, b, c].find((s) => s.name === n) || null };
    expect(stationAfter(engine, '1', 'A', true)).toBe('B');
    expect(stationAfter(engine, '1', 'C', true)).toBeNull();
    expect(stationAfter(engine, '1', 'C', false)).toBe('B');
    expect(stationAfter(engine, '1', 'Z', true)).toBeNull();
  });
});

describe('tick', () => {
  it('refreshes at most two stale stations, skipping fresh and unmapped ones', async () => {
    const trains = ['S1', 'S2', 'S3', 'S4', 'S5'].map((n, i) => train({ isDeadReckoned: true, targetStation: n, secondsToTarget: i }));
    const engine = { getLiveVehiclesFromMemory: () => trains };
    const ages = { 1: 5000, 2: null, 3: 30000, 4: 40000, 5: 50000 };
    const store = {
      apiIdForName: (n) => (n === 'S2' ? 2 : n === 'S1' ? 1 : n === 'S3' ? 3 : n === 'S4' ? 4 : null),
      ageMs: (id) => ages[id],
      getStationArrivals: vi.fn().mockResolvedValue([]),
    };
    const wanted = await tick({ engine, store, now: 0 });
    expect(wanted.map((w) => w.name)).toEqual(['S2', 'S3']);
    expect(wanted.length).toBeLessThanOrEqual(MAX_PER_TICK);
    expect(store.getStationArrivals).toHaveBeenCalledWith({ name: 'S2', apiId: 2 }, { forceRefresh: true });
  });
});
