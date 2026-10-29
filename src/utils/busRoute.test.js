import { describe, it, expect } from 'vitest';
import emtStops from '../data/emt_stops.json';
import recording from '../data/fixtures/emt_line19_recording.json';
import {
  distanceM, getLine19Route, directionForTrayecto, projectOnShape, alongShapeM, findStop, stopsAway,
  pointAtAlongM, nextStop, OFF_ROUTE_M, PASSED_HYSTERESIS_M,
} from './busRoute';

const route = getLine19Route();
const [toMalva, toNord] = route.directions;

describe('line19_route.json', () => {
  it('came from the 75 segments of layer 74 and has one direction per fixture trayecto', () => {
    expect(route.segments).toBe(75);
    const fixtureTrayectos = new Set(recording.polls.flatMap((p) => p.buses.map((b) => b.trayecto)));
    expect(new Set(route.directions.map((d) => d.trayecto))).toEqual(fixtureTrayectos);
  });

  it('each direction is a connected polyline (largest vertex gap is 345 m, so none over 350 m)', () => {
    let maxGap = 0;
    for (const d of route.directions) {
      expect(d.polyline.length).toBeGreaterThan(50);
      for (let i = 1; i < d.polyline.length; i++) {
        maxGap = Math.max(maxGap, distanceM(d.polyline[i - 1], d.polyline[i]));
      }
    }
    expect(maxGap).toBeLessThan(350);
  });

  it('the two directions close into one loop at the termini', () => {
    expect(distanceM(toMalva.polyline.at(-1), toNord.polyline[0])).toBeLessThan(1);
    expect(distanceM(toNord.polyline.at(-1), toMalva.polyline[0])).toBeLessThan(1);
    expect(toMalva.stops[0].stopCode).toBe('2314');
    expect(toMalva.stops.at(-1).stopCode).toBe('18');
    expect(toNord.stops[0].stopCode).toBe('18');
    expect(toNord.stops.at(-1).stopCode).toBe('2314');
  });

  it('every stop is a known line 19 stop in emt_stops.json and lies within 20 m of its shape (stop 2314 is the worst, 16.9 m off)', () => {
    let maxOffset = 0;
    const byCode = new Map(emtStops.map((s) => [s.stopCode, s]));
    for (const d of route.directions) {
      for (const s of d.stops) {
        const e = byCode.get(s.stopCode);
        expect(e, `stop ${s.stopCode}`).toBeTruthy();
        expect(e.lines).toContain('19');
        expect(s.coordinates).toEqual(e.coordinates);
        const off = projectOnShape(d, s.coordinates).offsetM;
        expect(off, `stop ${s.stopCode}`).toBeLessThan(20);
        maxOffset = Math.max(maxOffset, off);
      }
    }
    expect(maxOffset).toBeGreaterThan(16.8);
    expect(maxOffset).toBeLessThan(17);
  });

  it('stops are ordered along the shape, once each, and alongM matches the projection', () => {
    for (const d of route.directions) {
      const codes = d.stops.map((s) => s.stopCode);
      expect(new Set(codes).size).toBe(codes.length);
      for (let i = 1; i < d.stops.length; i++) expect(d.stops[i].alongM).toBeGreaterThan(d.stops[i - 1].alongM);
      for (const s of d.stops) {
        const p = projectOnShape(d, s.coordinates, { hintAlongM: s.alongM, windowM: 100 });
        expect(Math.abs(p.alongM - s.alongM)).toBeLessThan(60);
      }
    }
  });

  it('together the directions cover all 51 stops of layer 73 except the catalogue-less node 24', () => {
    const codes = new Set(route.directions.flatMap((d) => d.stops.map((s) => s.stopCode)));
    expect(codes.size).toBe(51);
    expect(codes.has('24')).toBe(false);
  });

  it('recorded buses sit on the shape of their own trayecto', () => {
    const off = [];
    for (const p of recording.polls) {
      for (const b of p.buses) {
        const d = directionForTrayecto(b.trayecto);
        off.push(projectOnShape(d, [b.lon, b.lat]).offsetM);
      }
    }
    expect(Math.max(...off)).toBeLessThan(100);
  });
});

describe('directionForTrayecto', () => {
  it('matches the exact string, trimmed, and nothing else', () => {
    expect(directionForTrayecto(' La Malva-rosa - Est.del Nord ')).toBe(toNord);
    expect(directionForTrayecto('Est.del Nord - La Malva-rosa')).toBe(toMalva);
    expect(directionForTrayecto('X')).toBeNull();
    expect(directionForTrayecto(undefined)).toBeNull();
    expect(directionForTrayecto(null)).toBeNull();
    expect(directionForTrayecto('')).toBeNull();
    expect(directionForTrayecto(19)).toBeNull();
    // flipped / reworded strings are not accepted
    expect(directionForTrayecto('La Malva-rosa - Est.del Nord - ')).toBeNull();
    expect(directionForTrayecto('Est.del Nord-La Malva-rosa')).toBeNull();
    expect(directionForTrayecto('est.del nord - la malva-rosa')).toBeNull();
  });
});

describe('projectOnShape', () => {
  const line = { polyline: [[0, 40], [0.01, 40], [0.01, 40.01]] };
  const seg1 = distanceM(line.polyline[0], line.polyline[1]);

  it('projects an off-shape point to the nearest point and distance along', () => {
    const r = projectOnShape(line, [0.005, 40.0005]);
    expect(r.alongM).toBeCloseTo(distanceM([0, 40], [0.005, 40]), -1);
    expect(r.offsetM).toBeCloseTo(distanceM([0.005, 40.0005], [0.005, 40]), 0);
    expect(r.point[1]).toBeCloseTo(40, 6);
  });

  it('clamps to the ends and runs on past the first corner', () => {
    expect(projectOnShape(line, [-0.01, 40]).alongM).toBe(0);
    expect(projectOnShape(line, [0.011, 40.005]).alongM).toBeCloseTo(seg1 + distanceM([0.01, 40], [0.01, 40.005]), -1);
    expect(alongShapeM(line, [0.01, 40.02])).toBeCloseTo(seg1 + distanceM([0.01, 40], [0.01, 40.01]), -1);
  });

  it('a hint window picks the stretch near the hint when the shape passes twice', () => {
    const loop = { polyline: [[0, 40], [0.01, 40], [0.01, 40.001], [0, 40.001], [0, 40.0001]] };
    const p = [0.005, 40.0005];
    const first = projectOnShape(loop, p, { hintAlongM: 0, windowM: 100 });
    const last = projectOnShape(loop, p, { hintAlongM: 1400, windowM: 100 });
    expect(first.alongM).toBeLessThan(seg1);
    expect(last.alongM).toBeGreaterThan(seg1);
  });
});

describe('stopsAway', () => {
  const d = toMalva;
  const at = (i) => d.stops[i].coordinates;

  it('at a stop: 0 for that stop, 1 for the next, and counts the stops in between', () => {
    expect(stopsAway(d, at(2), d.stops[2].stopCode)).toMatchObject({ passed: false, stopsAway: 0 });
    expect(stopsAway(d, at(2), d.stops[3].stopCode).stopsAway).toBe(1);
    expect(stopsAway(d, at(2), d.stops[5].stopCode).stopsAway).toBe(3);
  });

  it('a bus between two stops is 0 away from the next one', () => {
    const a = d.stops[4];
    const b = d.stops[5];
    const mid = alongToPoint(d, (a.alongM + b.alongM) / 2);
    const r = stopsAway(d, mid, b.stopCode);
    expect(r.stopsAway).toBe(0);
    expect(r.distanceM).toBeCloseTo((b.alongM - a.alongM) / 2, -1);
  });

  it('a stop is passed only beyond the hysteresis: no flicker around it', () => {
    const s = d.stops[4];
    const next = d.stops[5];
    const just = (m) => alongToPoint(d, s.alongM + m);
    expect(stopsAway(d, just(PASSED_HYSTERESIS_M - 2), s.stopCode)).toMatchObject({ passed: false, stopsAway: 0 });
    expect(stopsAway(d, just(PASSED_HYSTERESIS_M - 2), next.stopCode).stopsAway).toBe(1);
    expect(stopsAway(d, just(PASSED_HYSTERESIS_M + 2), s.stopCode)).toEqual({ passed: true, stopsAway: null, distanceM: 0 });
    expect(stopsAway(d, just(PASSED_HYSTERESIS_M + 2), next.stopCode).stopsAway).toBe(0);
  });

  it('is monotonic along the shape: stopsAway never increases and passed never reverts', () => {
    for (const dir of route.directions) {
      for (const idx of [3, 10, dir.stops.length - 1]) {
        const code = dir.stops[idx].stopCode;
        let prev = Infinity;
        let passed = false;
        for (let m = 0; m <= dir.lengthM; m += 5) {
          const r = stopsAway(dir, alongToPoint(dir, m), code, { hintAlongM: m, windowM: 20 });
          if (r.passed) {
            passed = true;
          } else {
            expect(passed, `stop ${code} at ${m} m reverted from passed`).toBe(false);
            expect(r.stopsAway, `stop ${code} at ${m} m`).toBeLessThanOrEqual(prev);
            prev = r.stopsAway;
          }
        }
        expect(passed || idx === dir.stops.length - 1).toBe(true);
      }
    }
  });

  it('returns {passed: true} for a stop already passed and null for an unknown stop', () => {
    expect(stopsAway(d, at(6), d.stops[2].stopCode)).toEqual({ passed: true, stopsAway: null, distanceM: 0 });
    expect(stopsAway(d, at(2), '999999')).toBeNull();
  });

  it('returns null for a bus off the route', () => {
    const p = alongToPoint(d, (d.stops[4].alongM + d.stops[5].alongM) / 2);
    const off = (m) => [p[0] + m / (111320 * Math.cos(p[1] * Math.PI / 180)), p[1]];
    expect(stopsAway(d, off(0), d.stops[5].stopCode)).not.toBeNull();
    // offsetM is the distance to the nearest shape point, so 4 * OFF_ROUTE_M east is surely beyond it
    const far = projectOnShape(d, off(OFF_ROUTE_M * 4)).offsetM > OFF_ROUTE_M;
    expect(far).toBe(true);
    expect(stopsAway(d, off(OFF_ROUTE_M * 4), d.stops[5].stopCode)).toBeNull();
  });

  it('findStop looks up by code, number or string', () => {
    expect(findStop(toNord, 2314)).toBe(toNord.stops.at(-1));
    expect(findStop(toNord, 'nope')).toBeNull();
  });
});

describe('pointAtAlongM and nextStop', () => {
  it('returns the point and segment bearing, clamped to the ends', () => {
    const line = { polyline: [[0, 40], [0.01, 40], [0.01, 40.01]] };
    const seg1 = distanceM(line.polyline[0], line.polyline[1]);
    const east = pointAtAlongM(line, seg1 / 2);
    expect(east.lonLat[0]).toBeCloseTo(0.005, 5);
    expect(east.bearingDeg).toBeCloseTo(90, 3);
    expect(pointAtAlongM(line, seg1 + 10).bearingDeg).toBeCloseTo(0, 3);
    expect(pointAtAlongM(line, -5).lonLat).toEqual([0, 40]);
    expect(pointAtAlongM(line, 1e9).lonLat).toEqual([0.01, 40.01]);
  });

  it('round-trips with projectOnShape on a real direction', () => {
    const m = toNord.lengthM / 2;
    const { lonLat } = pointAtAlongM(toNord, m);
    expect(projectOnShape(toNord, lonLat, { hintAlongM: m, windowM: 50 }).alongM).toBeCloseTo(m, -1);
  });

  it('nextStop is the first stop not passed, null after the last', () => {
    const d = toMalva;
    expect(nextStop(d, 0).stop).toBe(d.stops[0]);
    expect(nextStop(d, d.stops[3].alongM)).toMatchObject({ index: 3, distanceM: 0 });
    expect(nextStop(d, d.stops[3].alongM + PASSED_HYSTERESIS_M + 1).index).toBe(4);
    expect(nextStop(d, d.stops.at(-1).alongM + PASSED_HYSTERESIS_M + 1)).toBeNull();
  });
});

describe('projection of the recording', () => {
  // Build tracks by nearest same-trayecto match to the previous poll's tracks (ADR-0014, simplified).
  function tracks() {
    const out = [];
    let live = [];
    for (const p of recording.polls) {
      const next = [];
      const used = new Set();
      for (const b of p.buses) {
        let best = null;
        for (const t of live) {
          if (used.has(t) || t.trayecto !== b.trayecto) continue;
          const dm = distanceM(t.fixes.at(-1), [b.lon, b.lat]);
          if (dm < 250 && (!best || dm < best.dm)) best = { t, dm };
        }
        const t = best ? best.t : { trayecto: b.trayecto, fixes: [] };
        if (!best) out.push(t);
        used.add(t);
        t.fixes.push([b.lon, b.lat]);
        next.push(t);
      }
      live = next;
    }
    return out.filter((t) => t.fixes.length >= 10);
  }

  it('with the right direction and a hint, along-shape progress is monotonic', () => {
    const all = tracks();
    expect(all.length).toBeGreaterThan(3);
    let hinted = 0;
    for (const t of all) {
      const dir = directionForTrayecto(t.trayecto);
      let hint = null;
      let prev = -Infinity;
      for (const f of t.fixes) {
        const proj = projectOnShape(dir, f, hint == null ? {} : { hintAlongM: hint, windowM: 500 });
        expect(proj.alongM, `${t.trayecto} backwards`).toBeGreaterThan(prev - 30);
        prev = Math.max(prev, proj.alongM);
        hint = proj.alongM;
        hinted++;
      }
    }
    expect(hinted).toBeGreaterThan(100);
  });
});

function alongToPoint(direction, alongM) {
  const { polyline } = direction;
  let acc = 0;
  for (let i = 1; i < polyline.length; i++) {
    const seg = distanceM(polyline[i - 1], polyline[i]);
    if (acc + seg >= alongM) {
      const t = (alongM - acc) / seg;
      return [polyline[i - 1][0] + (polyline[i][0] - polyline[i - 1][0]) * t, polyline[i - 1][1] + (polyline[i][1] - polyline[i - 1][1]) * t];
    }
    acc += seg;
  }
  return polyline.at(-1);
}

describe('directionById', () => {
  it('finds a direction by id, or null', async () => {
    const { directionById, getLine19Route } = await import('./busRoute');
    const d = getLine19Route().directions[0];
    expect(directionById(d.id)).toBe(d);
    expect(directionById('nope')).toBeNull();
    expect(directionById(null)).toBeNull();
  });
});
