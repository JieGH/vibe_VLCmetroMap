import { describe, it, expect } from 'vitest';
import { getDistance, nearestFeature, nearestPointOnPath, pathsOffReference, createCircleGeoJSON, nearbyFeatures } from './geoUtils';
import returnTracks from '../data/return_tracks.json';
import metroData from '../data/metro_lines.json';
import gtfsData from '../data/gtfs_expanded.json';

describe('pathsOffReference', () => {
  // A trunk running north, and a path that follows it, steps ~170 m east for
  // a stretch, then comes back.
  const TRUNK = [[-0.3800, 39.4600], [-0.3800, 39.4800]];
  const DETOUR = [
    [-0.3800, 39.4600], [-0.3800, 39.4650],
    [-0.3780, 39.4670], [-0.3780, 39.4730],
    [-0.3800, 39.4750], [-0.3800, 39.4800],
  ];

  it('returns only the stretch that leaves the reference, joined at both ends', () => {
    const runs = pathsOffReference(DETOUR, TRUNK, 12);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual(DETOUR.slice(1, 5));
  });

  it('returns nothing for a path that never leaves the reference', () => {
    expect(pathsOffReference(TRUNK, TRUNK, 12)).toEqual([]);
  });

  // The map draws each coastal Line's outbound alignment from metro_lines.json;
  // the return leg past Dr. Lluch and Cabanyal is the stretch it lacks.
  it.each(['4', '6'])('finds line %s\'s return leg past Dr. Lluch and Cabanyal', (lineId) => {
    const outbound = metroData.features.find(
      f => f.properties.line === lineId && f.geometry.type === 'LineString'
    ).geometry.coordinates;
    const stations = Object.fromEntries(
      gtfsData.features
        .filter(f => f.geometry.type === 'Point')
        .map(f => [f.properties.name, f.geometry.coordinates])
    );
    const runs = pathsOffReference(returnTracks.lines[lineId].coordinates, outbound, 12);
    const nearestRun = (name) => Math.min(...runs.map(run => nearestPointOnPath(run, stations[name]).distance));

    expect(nearestRun('Cabanyal')).toBeLessThan(30);
    expect(nearestRun('Dr. Lluch')).toBeLessThan(30);
    // The beach leg is outbound only, so no return stretch runs along it.
    expect(nearestRun('Platja les Arenes')).toBeGreaterThan(100);
  });
});

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

describe('nearestFeature', () => {
  const at = (name, coordinates) => ({ properties: { name }, geometry: { type: 'Point', coordinates } });
  const FEATURES = [
    at('west', [-0.3810, 39.4700]),
    at('east', [-0.3790, 39.4700]),
  ];

  it('picks whichever is closer, not whichever came first', () => {
    // Nearer the east one, which is second in the list.
    expect(nearestFeature(FEATURES, [-0.3792, 39.4700]).feature.properties.name).toBe('east');
    expect(nearestFeature(FEATURES, [-0.3808, 39.4700]).feature.properties.name).toBe('west');
  });

  it('reports the distance so the caller can apply its own threshold', () => {
    const nearest = nearestFeature(FEATURES, [-0.3810, 39.4700]);
    expect(nearest.distance).toBeLessThan(1);
  });

  it('has nothing to offer for an empty list', () => {
    expect(nearestFeature([], [-0.38, 39.47])).toBeNull();
  });
});

describe('createCircleGeoJSON', () => {
  it('returns valid GeoJSON polygon with closed ring', () => {
    const geo = createCircleGeoJSON([-0.375, 39.47], 800, 32);
    expect(geo.type).toBe('FeatureCollection');
    expect(geo.features[0].geometry.type).toBe('Polygon');
    const ring = geo.features[0].geometry.coordinates[0];
    expect(ring.length).toBe(33); // 32 points + closed start
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it('handles null coordinates gracefully', () => {
    const geo = createCircleGeoJSON(null, 800);
    expect(geo.features).toEqual([]);
  });
});

describe('nearbyFeatures', () => {
  const at = (name, coordinates) => ({ properties: { name }, geometry: { type: 'Point', coordinates } });
  const FEATURES = [
    at('close', [-0.377, 39.467]),
    at('medium', [-0.372, 39.467]),
    at('far', [-0.350, 39.467]),
  ];

  it('filters by distance and sorts closest first', () => {
    const matches = nearbyFeatures(FEATURES, [-0.377, 39.467], 800);
    expect(matches.length).toBe(2);
    expect(matches[0].feature.properties.name).toBe('close');
    expect(matches[1].feature.properties.name).toBe('medium');
    expect(matches[0].distance).toBeLessThan(matches[1].distance);
    expect(matches[0].walkMin).toBeDefined();
  });

  it('returns empty array when none match or list empty', () => {
    expect(nearbyFeatures([], [-0.377, 39.467], 800)).toEqual([]);
    expect(nearbyFeatures(FEATURES, [-0.377, 39.467], 10)).toHaveLength(1);
  });
});
