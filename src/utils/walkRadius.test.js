import { describe, it, expect } from 'vitest';
import {
  WALK_RADIUS_MIN,
  WALK_RADIUS_METRES,
  WALK_RADIUS_HYSTERESIS_METRES,
  pickWalkSet,
} from './walkRadius';
import { walkingMinutes } from './walking';
import { getDistance } from './geoUtils';

const ORIGIN = [-0.377, 39.467];
// A point due east of ORIGIN, `metres` away by the repo's own distance function.
const eastOf = (metres) => {
  let lng = ORIGIN[0] + metres / 86000;
  for (let i = 0; i < 20; i += 1) lng += (metres - getDistance(ORIGIN, [lng, ORIGIN[1]])) / 86000;
  return [lng, ORIGIN[1]];
};
const at = (key, metres) => ({ key, coordinates: eastOf(metres) });
const opts = (extra = {}) => ({ getCoords: (i) => i.coordinates, getKey: (i) => i.key, ...extra });

describe('walk radius constant', () => {
  it('is 3 minutes at the one walking speed, 225 m', () => {
    expect(WALK_RADIUS_MIN).toBe(3);
    expect(WALK_RADIUS_METRES).toBe(225);
    expect(walkingMinutes(WALK_RADIUS_METRES)).toBe(WALK_RADIUS_MIN);
    expect(walkingMinutes(WALK_RADIUS_METRES + 1)).toBe(WALK_RADIUS_MIN + 1);
  });
});

describe('pickWalkSet', () => {
  it('keeps what is inside, drops what is outside, and sorts nearest first', () => {
    const { items, fallback } = pickWalkSet([at('far', 400), at('b', 200), at('a', 50)], ORIGIN, opts());
    expect(items.map((r) => r.item.key)).toEqual(['a', 'b']);
    expect(fallback).toBe(false);
  });

  it('includes the boundary and excludes just past it', () => {
    const inside = at('in', WALK_RADIUS_METRES - 1);
    const outside = at('out', WALK_RADIUS_METRES + 5);
    const { items } = pickWalkSet([inside, outside], ORIGIN, opts());
    expect(items.map((r) => r.item.key)).toEqual(['in']);
  });

  it('reports real distance and the displayed walk minutes from the same speed', () => {
    const { items } = pickWalkSet([at('x', 200)], ORIGIN, opts());
    expect(items[0].distance).toBeCloseTo(200, 0);
    expect(items[0].walkMin).toBe(walkingMinutes(items[0].distance));
  });

  it('falls back to the single nearest item, flagged, when nothing is inside', () => {
    const { items, fallback } = pickWalkSet([at('far', 700), at('near', 400)], ORIGIN, opts());
    expect(fallback).toBe(true);
    expect(items).toHaveLength(1);
    expect(items[0].item.key).toBe('near');
    expect(items[0].walkMin).toBe(walkingMinutes(items[0].distance));
  });

  it('returns an empty, unflagged set for no items or no origin', () => {
    expect(pickWalkSet([], ORIGIN, opts())).toEqual({ items: [], fallback: false });
    expect(pickWalkSet([at('a', 10)], null, opts())).toEqual({ items: [], fallback: false });
  });

  it('skips items without usable coordinates', () => {
    const { items } = pickWalkSet([{ key: 'none' }, at('a', 10)], ORIGIN, opts());
    expect(items.map((r) => r.item.key)).toEqual(['a']);
  });

  it('keeps a previously shown item until it is past radius + hysteresis (no boundary flicker)', () => {
    const drifting = at('d', WALK_RADIUS_METRES + WALK_RADIUS_HYSTERESIS_METRES - 5);
    const gone = at('g', WALK_RADIUS_METRES + WALK_RADIUS_HYSTERESIS_METRES + 5);
    const keep = new Set(['d', 'g']);
    const withKeep = pickWalkSet([drifting, gone, at('a', 10)], ORIGIN, opts({ keep }));
    expect(withKeep.items.map((r) => r.item.key)).toEqual(['a', 'd']);
    // Never shown before: the same distance does not get in.
    const fresh = pickWalkSet([drifting, at('a', 10)], ORIGIN, opts());
    expect(fresh.items.map((r) => r.item.key)).toEqual(['a']);
  });
});
