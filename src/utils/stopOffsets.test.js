import { describe, it, expect } from 'vitest';
import {
  buildDisplayCoordinates,
  displayCoordinatesFor,
  MAX_OFFSET_METRES,
  TARGET_SEPARATION_METRES,
  PAIR_MAX_METRES,
} from './stopOffsets';
import { getDistance } from './geoUtils';

const LAT = 39.47;
const mPerLng = 111320 * Math.cos((LAT * Math.PI) / 180);
// Build a stop `east` metres east and `north` metres north of a fixed origin.
const at = (east, north) => [-0.38 + east / mPerLng, LAT + north / 110574];
const stop = (stopCode, stopName, coords, lines = ['93']) => ({
  stopCode,
  stopName,
  coordinates: coords,
  lines,
});

describe('buildDisplayCoordinates', () => {
  it('pushes an opposite-direction pair apart along the joining line', () => {
    const a = stop('1', 'Cid - Nou d\'Octubre', at(0, 0));
    const b = stop('2', 'Nou d\'Octubre - Cid', at(0, 10), ['99']);
    const map = buildDisplayCoordinates([a, b]);
    const da = map.get('1');
    const db = map.get('2');
    expect(getDistance(da, db)).toBeGreaterThan(getDistance(a.coordinates, b.coordinates) + 10);
    // a moved south (away from b), b moved north
    expect(da[1]).toBeLessThan(a.coordinates[1]);
    expect(db[1]).toBeGreaterThan(b.coordinates[1]);
    // joining line stays north-south
    expect(da[0]).toBeCloseTo(a.coordinates[0], 8);
  });

  it('pairs names that differ only by a parenthetical suffix', () => {
    const a = stop('1', 'Regne de València (parell) - Alcalde Reig', at(0, 0));
    const b = stop('2', 'Regne de València (imparell) - Alcalde Reig', at(0, 12));
    const map = buildDisplayCoordinates([a, b]);
    expect(map.has('1') && map.has('2')).toBe(true);
  });

  it('leaves an unpaired stop unchanged', () => {
    const a = stop('1', 'Cid - Burgos', at(0, 0));
    const far = stop('2', 'Cid - Burgos', at(0, 400));
    const other = stop('3', 'Something else', at(0, 10));
    const map = buildDisplayCoordinates([a, far, other]);
    expect(map.size).toBe(0);
    expect(displayCoordinatesFor(a, map)).toBe(a.coordinates);
  });

  it('does not pair neighbouring stops on the same street with different cross streets', () => {
    const a = stop('1', 'Regne de València - Russafa', at(0, 0), ['19']);
    const b = stop('2', 'Regne de València - Gregori Maians', at(0, 20), ['19']);
    expect(buildDisplayCoordinates([a, b]).size).toBe(0);
  });

  it('pairs the closest two of a three-stop cluster and leaves the third alone', () => {
    const a = stop('1', 'Colón - Xàtiva', at(0, 0));
    const b = stop('2', 'Colón - Xàtiva', at(0, 8));
    const c = stop('3', 'Colón - Xàtiva', at(0, 30));
    const map = buildDisplayCoordinates([a, b, c]);
    expect(map.has('1')).toBe(true);
    expect(map.has('2')).toBe(true);
    expect(map.has('3')).toBe(false);
  });

  it('never moves a stop more than the cap', () => {
    const a = stop('1', 'X - Y', at(0, 0));
    const b = stop('2', 'X - Y', at(0, 2.5));
    const map = buildDisplayCoordinates([a, b]);
    for (const s of [a, b]) {
      expect(getDistance(s.coordinates, map.get(s.stopCode))).toBeLessThanOrEqual(MAX_OFFSET_METRES + 0.01);
    }
  });

  it('does not move stops already well separated', () => {
    const a = stop('1', 'X - Y', at(0, 0));
    const b = stop('2', 'X - Y', at(0, TARGET_SEPARATION_METRES));
    expect(buildDisplayCoordinates([a, b]).size).toBe(0);
  });

  it('moves nothing when the direction is unknown (identical coordinates)', () => {
    const a = stop('1', 'X - Y', at(0, 0));
    const b = stop('2', 'X - Y', at(0, 0));
    expect(buildDisplayCoordinates([a, b]).size).toBe(0);
  });

  it('is deterministic regardless of input order and never mutates input', () => {
    const list = [
      stop('1', 'X - Y', at(0, 0)),
      stop('2', 'X - Y', at(0, 9)),
      stop('3', 'P - Q', at(300, 0)),
      stop('4', 'P - Q', at(300, 14)),
    ];
    const snapshot = JSON.stringify(list);
    const m1 = buildDisplayCoordinates(list);
    const m2 = buildDisplayCoordinates([...list].reverse());
    expect([...m1.entries()].sort()).toEqual([...m2.entries()].sort());
    expect(JSON.stringify(list)).toBe(snapshot);
  });

  it('pushes a pair at 79 m by about 3.5 m each (target 86 m)', () => {
    const a = stop('1', 'X - Y', at(0, 0));
    const b = stop('2', 'X - Y', at(0, 79));
    const map = buildDisplayCoordinates([a, b]);
    // at() uses a slightly different metres-per-degree, so allow a margin.
    for (const [s, code] of [[a, '1'], [b, '2']]) {
      const m = getDistance(s.coordinates, map.get(code));
      expect(m).toBeGreaterThan(3);
      expect(m).toBeLessThan(4);
    }
  });

  it.each([60, 80])('a %i m pair does not move and does not block a closer pairing', (gap) => {
    // a--(gap)--b, with c 20 m beyond b: b/c is the closer pair and must still form.
    const a = stop('1', 'X - Y', at(0, 0));
    const b = stop('2', 'X - Y', at(0, gap));
    const c = stop('3', 'X - Y', at(0, gap + 20));
    const map = buildDisplayCoordinates([a, b, c]);
    expect(map.has('1')).toBe(false);
    expect(map.has('2')).toBe(true);
    expect(map.has('3')).toBe(true);
  });

  it('pushes a 30 m pair to the 25 m cap each (drawn 80 m apart, short of the 86 m target)', () => {
    const a = stop('1', 'X - Y', at(0, 0));
    const b = stop('2', 'X - Y', at(0, 30));
    const map = buildDisplayCoordinates([a, b]);
    expect(getDistance(map.get('1'), map.get('2'))).toBeGreaterThan(79);
    expect(getDistance(a.coordinates, map.get('1'))).toBeCloseTo(MAX_OFFSET_METRES, 0);
  });

  it('a 70 m pair is under the cap: each moves (86 - 70) / 2 = 8 m', () => {
    const a = stop('1', 'X - Y', at(0, 0));
    const b = stop('2', 'X - Y', at(0, 70));
    const map = buildDisplayCoordinates([a, b]);
    expect(getDistance(a.coordinates, map.get('1'))).toBeCloseTo(8, 0);
  });

  it('KNOWN LIMITATION: same-name stops on the same side are still pushed apart', () => {
    // Pairing uses name and distance only (no heading in the data), so two
    // same-name stops 20 m apart along one kerb are treated as a pair.
    const a = stop('1', 'X - Y', at(0, 0));
    const b = stop('2', 'X - Y', at(0, 20));
    expect(buildDisplayCoordinates([a, b]).size).toBe(2);
  });
});
