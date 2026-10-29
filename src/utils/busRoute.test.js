import { describe, it, expect } from 'vitest';
import emtStops from '../data/emt_stops.json';
import recording from '../data/fixtures/emt_line19_recording.json';
import {
  distanceM, getLine19Route, directionForTrayecto, projectOnShape, alongShapeM, findStop, stopsAway,
} from './busRoute';

const route = getLine19Route();
const [toMalva, toNord] = route.directions;

describe('line19_route.json', () => {
  it('came from the 75 segments of layer 74 and has one direction per fixture trayecto', () => {
    expect(route.segments).toBe(75);
    const fixtureTrayectos = new Set(recording.polls.flatMap((p) => p.buses.map((b) => b.trayecto)));
    expect(new Set(route.directions.map((d) => d.trayecto))).toEqual(fixtureTrayectos);
  });

  it('each direction is a connected polyline (no jump between vertices)', () => {
    for (const d of route.directions) {
      expect(d.polyline.length).toBeGreaterThan(50);
      for (let i = 1; i < d.polyline.length; i++) {
        expect(distanceM(d.polyline[i - 1], d.polyline[i])).toBeLessThan(400);
      }
    }
  });

  it('the two directions close into one loop at the termini', () => {
    expect(distanceM(toMalva.polyline.at(-1), toNord.polyline[0])).toBeLessThan(1);
    expect(distanceM(toNord.polyline.at(-1), toMalva.polyline[0])).toBeLessThan(1);
    expect(toMalva.stops[0].stopCode).toBe('2314');
    expect(toMalva.stops.at(-1).stopCode).toBe('18');
    expect(toNord.stops[0].stopCode).toBe('18');
    expect(toNord.stops.at(-1).stopCode).toBe('2314');
  });

  it('every stop is a known line 19 stop in emt_stops.json and lies within 20 m of its shape', () => {
    const byCode = new Map(emtStops.map((s) => [s.stopCode, s]));
    for (const d of route.directions) {
      for (const s of d.stops) {
        const e = byCode.get(s.stopCode);
        expect(e, `stop ${s.stopCode}`).toBeTruthy();
        expect(e.lines).toContain('19');
        expect(s.coordinates).toEqual(e.coordinates);
        expect(projectOnShape(d, s.coordinates).offsetM, `stop ${s.stopCode}`).toBeLessThan(20);
      }
    }
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

  it('is 0 stops away at the next stop and counts the stops in between', () => {
    expect(stopsAway(d, at(2), d.stops[3].stopCode).stopsAway).toBe(1);
    expect(stopsAway(d, at(2), d.stops[2].stopCode).stopsAway).toBe(0);
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

  it('returns null for a stop already passed or not on the direction', () => {
    expect(stopsAway(d, at(6), d.stops[2].stopCode)).toBeNull();
    expect(stopsAway(d, at(2), '999999')).toBeNull();
  });

  it('findStop looks up by code, number or string', () => {
    expect(findStop(toNord, 2314)).toBe(toNord.stops.at(-1));
    expect(findStop(toNord, 'nope')).toBeNull();
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
