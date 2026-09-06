import { describe, it, expect } from 'vitest';
import { getDistance, nearestPointOnPath } from './geoUtils';

// A straight north-south segment through Valencia, and a point beside it.
const PATH = [[-0.3800, 39.4600], [-0.3800, 39.4800]];

describe('nearestPointOnPath', () => {
  it('drops a perpendicular onto the segment', () => {
    const point = [-0.3790, 39.4700];
    const nearest = nearestPointOnPath(PATH, point);

    expect(nearest.coordinates[0]).toBeCloseTo(-0.38, 5);
    expect(nearest.coordinates[1]).toBeCloseTo(39.47, 5);
    // 0.001° of longitude at 39.47°N is about 86 m, and the flat projection
    // has to account for that rather than treating degrees as square.
    expect(nearest.distance).toBeGreaterThan(80);
    expect(nearest.distance).toBeLessThan(90);
  });

  it('clamps to the end rather than an imaginary continuation of the line', () => {
    const beyondTheEnd = [-0.3800, 39.4900];
    const nearest = nearestPointOnPath(PATH, beyondTheEnd);

    expect(nearest.coordinates[1]).toBeCloseTo(39.48, 5);
  });

  it('agrees with the haversine distance it snapped by', () => {
    const point = [-0.3790, 39.4700];
    const nearest = nearestPointOnPath(PATH, point);

    expect(nearest.distance).toBeCloseTo(getDistance(point, nearest.coordinates), 0);
  });

  it('returns nothing to snap to for an empty path', () => {
    expect(nearestPointOnPath([], [-0.38, 39.47])).toBeNull();
  });
});
