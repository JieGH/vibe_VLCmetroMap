import { describe, it, expect } from 'vitest';
import fixture from '../data/fixtures/emt_line19_recording.json';
import { normalizeFecha } from './busFleetService';
import { directionForTrayecto, projectOnShape } from '../utils/busRoute';
import { createBusTracker, MATCH_GATE_M, DROP_AFTER_MS, HIDE_AGE_S, HEADING_MIN_MOVE_M } from './busTracker';

const T0 = 1793308537000;
const NORTH = 'Est.del Nord - La Malva-rosa';
const SOUTH = 'La Malva-rosa - Est.del Nord';
const ORIGIN = [-0.36, 39.47];

/** A point `dxM` metres east and `dyM` metres north of ORIGIN. */
function at(dxM, dyM, o = ORIGIN) {
  return [o[0] + dxM / (111320 * Math.cos((o[1] * Math.PI) / 180)), o[1] + dyM / 110574];
}
function rec(gid, lonLat, over = {}) {
  return { gid, linea: '19', trayecto: NORTH, lonLat, fixTimeMs: T0 - 10000, ageSeconds: 10, ...over };
}

describe('constants', () => {
  it('follow ADR-0014', () => {
    expect([MATCH_GATE_M, DROP_AFTER_MS, HIDE_AGE_S, HEADING_MIN_MOVE_M]).toEqual([400, 120000, 120, 10]);
  });
});

describe('busTracker basics', () => {
  it('a new bus gets an id, no heading, and the output shape', () => {
    const t = createBusTracker();
    const [b] = t.update([rec(1, at(0, 0))], T0);
    expect(b.id).toBeTruthy();
    expect(b).toMatchObject({ linea: '19', trayecto: NORTH, headingDeg: null, fixTimeMs: T0 - 10000, ageSeconds: 10, stale: false });
    expect(b.lonLat).toEqual(at(0, 0));
    expect(b.id).not.toBe(1);
    expect(t.getBuses()).toHaveLength(1);
  });

  it('a moved bus keeps its id and gets a bearing', () => {
    const t = createBusTracker();
    const [a] = t.update([rec(1, at(0, 0))], T0);
    const [b] = t.update([rec(2, at(0, 80), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    expect(b.id).toBe(a.id);
    expect(b.headingDeg).toBeCloseTo(0, 0);
    expect(b.fixTimeMs).toBe(T0 + 20000);
  });

  it('keeps ids independent of gid', () => {
    const t = createBusTracker();
    const [a, c] = t.update([rec(5, at(0, 0)), rec(6, at(2000, 0))], T0);
    const out = t.update([rec(100, at(0, 50), { fixTimeMs: T0 + 20000 }), rec(101, at(2000, 50), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    expect(out.map((b) => b.id).sort()).toEqual([a.id, c.id].sort());
  });

  it('does not match across more than the gate, nor across linea or trayecto', () => {
    const t = createBusTracker();
    const [a] = t.update([rec(1, at(0, 0))], T0);
    const far = t.update([rec(2, at(0, MATCH_GATE_M + 50), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    expect(far.find((b) => b.id !== a.id)).toBeTruthy();
    const t2 = createBusTracker();
    const [x] = t2.update([rec(1, at(0, 0))], T0);
    const out = t2.update([rec(2, at(0, 10), { trayecto: SOUTH, fixTimeMs: T0 + 20000 })], T0 + 30000);
    expect(out.find((b) => b.trayecto === SOUTH).id).not.toBe(x.id);
  });

  it('matches just inside the 400 m gate', () => {
    const t = createBusTracker();
    const [a] = t.update([rec(1, at(0, 0))], T0);
    const out = t.update([rec(2, at(0, 390), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(a.id);
  });
});

describe('dropping and hiding', () => {
  it('a vanished bus stays 120 s of poll time, then is dropped', () => {
    const t = createBusTracker();
    const [a] = t.update([rec(1, at(0, 0)), rec(2, at(3000, 0))], T0);
    // only bus 2 remains (1 of 2 is exactly half, not partial)
    t.update([rec(3, at(3000, 10), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    expect(t.getBuses(T0 + 30000, { includeStale: true }).some((b) => b.id === a.id)).toBe(true);
    t.update([rec(4, at(3000, 20), { fixTimeMs: T0 + 110000 })], T0 + 120000);
    expect(t.getBuses(T0 + 120000, { includeStale: true }).some((b) => b.id === a.id)).toBe(true); // exactly 120 s kept
    t.update([rec(5, at(3000, 30), { fixTimeMs: T0 + 140000 })], T0 + 150000);
    expect(t.getBuses(T0 + 150000, { includeStale: true }).some((b) => b.id === a.id)).toBe(false);
  });

  it('hides a bus whose fix age is over 120 s, shows exactly 120 s', () => {
    const t = createBusTracker();
    expect(t.update([rec(1, at(0, 0), { ageSeconds: 120 })], T0)).toHaveLength(1);
    t.reset();
    expect(t.update([rec(1, at(0, 0), { ageSeconds: 121 })], T0)).toHaveLength(0);
    const all = t.getBuses(T0, { includeStale: true });
    expect(all).toHaveLength(1);
    expect(all[0].stale).toBe(true);
  });

  it('fix age grows with poll time while the bus is unmatched', () => {
    const t = createBusTracker();
    t.update([rec(1, at(0, 0), { ageSeconds: 50 }), rec(2, at(3000, 0))], T0);
    t.update([rec(3, at(3000, 10), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    const a = t.getBuses(T0 + 30000, { includeStale: true }).find((b) => b.lonLat[0] === at(0, 0)[0]);
    expect(a.ageSeconds).toBe(80);
    expect(a.stale).toBe(false);
    expect(t.getBuses(T0 + 100000, { includeStale: true }).find((b) => b.lonLat[0] === at(0, 0)[0]).stale).toBe(true);
  });
});

describe('identity', () => {
  it('two close buses keep their ids over a step', () => {
    const t = createBusTracker();
    const [a, b] = t.update([rec(1, at(0, 0)), rec(2, at(500, 0))], T0);
    // new input order reversed, both move 100 m east
    const out = t.update([rec(11, at(600, 0), { fixTimeMs: T0 + 20000 }), rec(10, at(100, 0), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    const byX = (id) => out.find((o) => o.id === id).lonLat[0];
    expect(byX(a.id)).toBeCloseTo(at(100, 0)[0], 8);
    expect(byX(b.id)).toBeCloseTo(at(600, 0)[0], 8);
  });

  it('is global one-to-one, not per-bus nearest', () => {
    const t = createBusTracker();
    const [a, b] = t.update([rec(1, at(0, 0)), rec(2, at(300, 0))], T0);
    // new fixes at 150 and 450: nearest-for-each would give both to... a->150, b->150; global gives a->150, b->450
    const out = t.update([rec(3, at(150, 0), { fixTimeMs: T0 + 20000 }), rec(4, at(450, 0), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    expect(out.find((o) => o.id === a.id).lonLat[0]).toBeCloseTo(at(150, 0)[0], 8);
    expect(out.find((o) => o.id === b.id).lonLat[0]).toBeCloseTo(at(450, 0)[0], 8);
  });

  it('breaks distance ties by lower previous gid, then lower new gid', () => {
    const t = createBusTracker();
    const [a, b] = t.update([rec(7, at(-100, 0)), rec(3, at(100, 0))], T0); // b has lower gid 3
    // one new fix at the centre, equidistant from both
    const out = t.update([rec(9, at(0, 0), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    const moved = out.find((o) => o.fixTimeMs === T0 + 20000);
    expect(moved.id).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  it('does not match a new fix older than the track fix', () => {
    const t = createBusTracker();
    const [a] = t.update([rec(1, at(0, 0), { fixTimeMs: T0 })], T0);
    const out = t.update([rec(2, at(0, 20), { fixTimeMs: T0 - 5000 })], T0 + 30000);
    expect(out.find((b) => b.fixTimeMs === T0 - 5000).id).not.toBe(a.id);
  });

  it('the same fix time keeps the match without moving or recomputing heading', () => {
    const t = createBusTracker();
    const [a] = t.update([rec(1, at(0, 0), { fixTimeMs: T0 })], T0);
    const out = t.update([rec(2, at(0, 5), { fixTimeMs: T0 })], T0 + 30000);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe(a.id);
    expect(out[0].lonLat).toEqual(at(0, 0));
    expect(out[0].headingDeg).toBeNull();
  });

  it('turnaround at the terminus starts a new track', () => {
    const t = createBusTracker();
    const [a] = t.update([rec(1, at(0, 0))], T0);
    const out = t.update([rec(2, at(100, 100), { trayecto: SOUTH, fixTimeMs: T0 + 20000 })], T0 + 30000);
    const turned = out.find((b) => b.trayecto === SOUTH);
    expect(turned.id).not.toBe(a.id);
    expect(turned.headingDeg).toBeNull();
  });
});

describe('partial, empty and repeated polls', () => {
  it('ignores an empty poll for matching', () => {
    const t = createBusTracker();
    const [a] = t.update([rec(1, at(0, 0)), rec(2, at(3000, 0))], T0);
    t.update([], T0 + 15000);
    const out = t.update([rec(3, at(0, 40), { fixTimeMs: T0 + 20000 }), rec(4, at(3000, 40), { fixTimeMs: T0 + 20000 })], T0 + 30000);
    expect(out).toHaveLength(2);
    expect(out.some((b) => b.id === a.id)).toBe(true);
  });

  it('ignores a partial poll (fewer than half) and does not start duplicates', () => {
    const t = createBusTracker();
    t.update([rec(1, at(0, 0)), rec(2, at(3000, 0)), rec(3, at(6000, 0))], T0);
    const out = t.update([rec(9, at(0, 30), { fixTimeMs: T0 + 5000 })], T0 + 15000);
    expect(t.getBuses(T0 + 15000, { includeStale: true })).toHaveLength(3);
    expect(out).toHaveLength(3);
  });

  it('passing the same snapshot twice is idempotent and does not refresh the drop clock', () => {
    const t = createBusTracker();
    const snap = [rec(1, at(0, 0)), rec(2, at(3000, 0))];
    const first = t.update(snap, T0).map((b) => ({ ...b }));
    const second = t.update(snap, T0 + 15000);
    expect(second.map((b) => b.id)).toEqual(first.map((b) => b.id));
    expect(second.map((b) => b.lonLat)).toEqual(first.map((b) => b.lonLat));
    expect(second.map((b) => b.headingDeg)).toEqual(first.map((b) => b.headingDeg));
    expect(second.map((b) => b.ageSeconds)).toEqual(first.map((b) => b.ageSeconds + 15));
    // repeated for over 120 s: the tracks are dropped (data too old), not kept forever
    t.update(snap, T0 + 130000);
    expect(t.getBuses(T0 + 130000, { includeStale: true })).toHaveLength(0);
  });
});

describe('unknown trayecto', () => {
  it('is tracked without direction, snap or alongM', () => {
    const t = createBusTracker();
    const [a] = t.update([rec(1, at(0, 0), { trayecto: 'Somewhere - Else' })], T0);
    expect(a.directionKey).toBeNull();
    expect(a.alongM).toBeNull();
    expect(a.snappedLonLat).toEqual(a.lonLat);
    const [b] = t.update([rec(2, at(0, 50), { trayecto: 'Somewhere - Else', fixTimeMs: T0 + 20000 })], T0 + 30000);
    expect(b.id).toBe(a.id);
    expect(b.headingDeg).toBeCloseTo(0, 0);
  });
});

describe('heading hold', () => {
  it('holds under 10 m and a slow creep accumulates against the fixed prev', () => {
    const t = createBusTracker();
    t.update([rec(1, at(0, 0), { fixTimeMs: T0 })], T0);
    const h1 = t.update([rec(2, at(0, 50), { fixTimeMs: T0 + 30000 })], T0 + 30000)[0].headingDeg;
    expect(h1).toBeCloseTo(0, 0);
    // creep east 4 m per step: held at 0 for the first two steps
    const p = at(0, 50);
    const h2 = t.update([rec(3, at(4, 50, ORIGIN), { fixTimeMs: T0 + 60000 })], T0 + 60000)[0].headingDeg;
    const h3 = t.update([rec(4, at(8, 50, ORIGIN), { fixTimeMs: T0 + 90000 })], T0 + 90000)[0].headingDeg;
    expect(h2).toBe(h1);
    expect(h3).toBe(h1);
    // third creep step passes 10 m from the held prev (12 m): heading updates to roughly east
    const h4 = t.update([rec(5, at(12, 50, ORIGIN), { fixTimeMs: T0 + 120000 })], T0 + 120000)[0].headingDeg;
    expect(h4).toBeGreaterThan(60);
    expect(h4).toBeLessThan(100);
    expect(p).toBeTruthy();
  });
});

describe('snapping', () => {
  const dir = directionForTrayecto(NORTH);
  const onRoute = (m) => {
    const p = projectOnShape(dir, dir.polyline[0]);
    return p && dir.polyline[Math.min(dir.polyline.length - 1, Math.floor(m))];
  };

  it('snaps an on-route bus and reports alongM and directionKey', () => {
    const t = createBusTracker();
    const pt = onRoute(20);
    const [b] = t.update([rec(1, [pt[0] + 0.00001, pt[1]])], T0);
    expect(b.directionKey).toBe(dir.id);
    expect(b.alongM).toBeGreaterThan(0);
    expect(b.snappedLonLat).not.toEqual(b.lonLat);
    expect(b.offsetM).toBeLessThan(50);
  });

  it('leaves a far-off-route bus unsnapped', () => {
    const t = createBusTracker();
    const [b] = t.update([rec(1, [ORIGIN[0], ORIGIN[1] + 0.2])], T0);
    expect(b.alongM).toBeNull();
    expect(b.snappedLonLat).toEqual(b.lonLat);
  });
});

describe('recording replay (ADR-0014)', () => {
  it('has zero identity swaps and at most the one turnaround unmatched', () => {
    const tracker = createBusTracker();
    let prevSnap = null; // { slotToId: Map }, gids
    let prevKey = '';
    let wrong = 0;
    let unmatched = 0;
    let steps = 0;
    let turnarounds = 0;
    for (const poll of fixture.polls) {
      const recs = poll.buses.map((b) => {
        const fixTimeMs = normalizeFecha(b.fecha, poll.serverDateMs);
        return {
          gid: b.gid, linea: '19', trayecto: b.trayecto.trim(), lonLat: [b.lon, b.lat],
          fixTimeMs, ageSeconds: Math.max(0, Math.round((poll.serverDateMs - fixTimeMs) / 1000)),
        };
      });
      tracker.update(recs, poll.serverDateMs);
      const key = recs.map((r) => r.gid).sort().join(',');
      if (!recs.length || key === prevKey) continue;
      prevKey = key;
      const all = tracker.getBuses(poll.serverDateMs, { includeStale: true });
      const idByGid = new Map(all.map((b) => [b.sourceGid, b.id]));
      // ground truth: the table keeps its row order across rewrites, so the rank by gid is the bus slot
      const ranked = [...recs].sort((a, b) => a.gid - b.gid);
      const slots = new Map(ranked.map((r, i) => [i, { id: idByGid.get(r.gid), trayecto: r.trayecto }]));
      if (prevSnap && prevSnap.slots.size === slots.size) {
        for (const [slot, cur] of slots) {
          const before = prevSnap.slots.get(slot);
          if (!before) continue;
          steps++;
          if (cur.id === before.id) continue;
          if (cur.trayecto !== before.trayecto) turnarounds++;
          else if ([...prevSnap.slots.values()].some((p) => p.id === cur.id)) wrong++;
          else unmatched++;
        }
      }
      prevSnap = { slots };
    }
    expect(steps).toBeGreaterThan(60);
    expect(wrong).toBe(0);
    expect(unmatched + turnarounds).toBeLessThanOrEqual(1);
    expect(turnarounds).toBe(1);
  });
});
