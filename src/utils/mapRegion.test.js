import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MAP_REGION_BBOX,
  MAP_REGION_BOUNDS,
  regionMinZoom,
  isInRegion,
  pointsOutsideRegion,
} from './mapRegion';
import { DEFAULT_MAP_ZOOM, DEFAULT_MAP_CENTER } from './mapCamera';
import emtStops from '../data/emt_stops.json';
import metroLines from '../data/metro_lines.json';
import gtfs from '../data/gtfs_expanded.json';
import paradas from '../data/paradas_api.json';
import returnTracks from '../data/return_tracks.json';

const mercY = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);
const regionPx = (zoom) => {
  const [w, s, e, n] = MAP_REGION_BBOX;
  const world = 512 * 2 ** zoom;
  return { width: ((e - w) / 360) * world, height: (mercY(s) - mercY(n)) * world };
};

// Every [lng, lat] pair anywhere in a GeoJSON-ish tree. Arrays of OSM node ids are not coordinates, hence the range check.
const lngLats = (value, out = []) => {
  if (Array.isArray(value)) {
    if (value.length >= 2 && Math.abs(value[0]) < 180 && Math.abs(value[1]) < 90 && value.slice(0, 2).every((n) => typeof n === 'number')) out.push([value[0], value[1]]);
    else if (value.length >= 2 && value.slice(0, 2).every((n) => typeof n === 'number')) return out;
    else value.forEach((v) => lngLats(v, out));
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach((v) => lngLats(v, out));
  }
  return out;
};

describe('map region', () => {
  it('exposes the bbox as [west, south, east, north] and as MapLibre bounds', () => {
    const [w, s, e, n] = MAP_REGION_BBOX;
    expect(w).toBeLessThan(e);
    expect(s).toBeLessThan(n);
    expect(MAP_REGION_BOUNDS).toEqual([[w, s], [e, n]]);
  });

  it('keeps the default open view inside the region', () => {
    expect(isInRegion(DEFAULT_MAP_CENTER)).toBe(true);
  });

  describe('regionMinZoom', () => {
    it('is the lowest zoom at which the viewport still sits entirely inside the region', () => {
      for (const [width, height] of [[390, 844], [768, 1024], [1440, 900], [844, 390]]) {
        const z = regionMinZoom({ width, height });
        const px = regionPx(z);
        expect(px.width).toBeGreaterThanOrEqual(width - 0.5);
        expect(px.height).toBeGreaterThanOrEqual(height - 0.5);
        // Not wastefully high: a hair lower would let the viewport spill out on one axis.
        const lower = regionPx(z - 0.01);
        expect(lower.width < width || lower.height < height).toBe(true);
      }
    });

    it('needs more zoom in landscape, where the region is tight on the short axis', () => {
      expect(regionMinZoom({ width: 844, height: 390 })).toBeGreaterThan(regionMinZoom({ width: 390, height: 844 }));
    });

    it('needs more zoom on bigger screens', () => {
      expect(regionMinZoom({ width: 1440, height: 900 })).toBeGreaterThan(regionMinZoom({ width: 768, height: 1024 }));
      expect(regionMinZoom({ width: 768, height: 1024 })).toBeGreaterThan(regionMinZoom({ width: 390, height: 844 }));
    });

    it('stays below the default zoom on a phone, so the open view is unchanged', () => {
      expect(regionMinZoom({ width: 390, height: 844 })).toBeLessThan(DEFAULT_MAP_ZOOM);
    });

    it('never lets the lock exceed the default zoom on any ordinary screen', () => {
      expect(regionMinZoom({ width: 1440, height: 900 })).toBeLessThan(DEFAULT_MAP_ZOOM);
    });

    it('falls back to a safe whole-region value for an unmeasured container', () => {
      expect(Number.isFinite(regionMinZoom({ width: 0, height: 0 }))).toBe(true);
      expect(Number.isFinite(regionMinZoom())).toBe(true);
    });
  });

  describe('isInRegion / pointsOutsideRegion', () => {
    it('accepts points on the edge and rejects points beyond it', () => {
      const [w, s, e, n] = MAP_REGION_BBOX;
      expect(isInRegion([w, s])).toBe(true);
      expect(isInRegion([e, n])).toBe(true);
      expect(isInRegion([e + 0.001, n])).toBe(false);
      expect(isInRegion([w, s - 0.001])).toBe(false);
    });

    it('lists the offenders with a margin applied', () => {
      const [w, s] = MAP_REGION_BBOX;
      expect(pointsOutsideRegion([[w + 0.01, s + 0.01], [w - 1, s]])).toEqual([[w - 1, s]]);
      expect(pointsOutsideRegion([[w + 0.001, s + 0.001]], 0.01)).toHaveLength(1);
    });
  });

  describe('shipped data lies inside the region with margin', () => {
    const MARGIN = 0.02; // roughly 2 km of breathing room

    it('contains every EMT stop', () => {
      const pts = emtStops.map((s) => s.coordinates);
      expect(pts).toHaveLength(emtStops.length);
      expect(pointsOutsideRegion(pts, MARGIN)).toEqual([]);
    });

    it('contains every metro line vertex and station', () => {
      expect(pointsOutsideRegion(lngLats(metroLines), MARGIN)).toEqual([]);
      expect(pointsOutsideRegion(lngLats(gtfs), MARGIN)).toEqual([]);
      expect(pointsOutsideRegion(paradas.map((p) => [p.longitud, p.latitud]), MARGIN)).toEqual([]);
    });

    it('contains the overlays (return tracks and the line 4 geojson)', () => {
      expect(pointsOutsideRegion(lngLats(returnTracks), MARGIN)).toEqual([]);
      const line4 = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../public/line4_osm.geojson'), 'utf8'));
      expect(pointsOutsideRegion(lngLats(line4), MARGIN)).toEqual([]);
    });
  });

  it('is the single source for the basemap extract', () => {
    const script = fs.readFileSync(path.resolve(__dirname, '../../scripts/fetch_basemap.cjs'), 'utf8');
    expect(script).toContain('map_region.json');
    expect(script).not.toMatch(/BBOX\s*=\s*'-?\d/);
  });
});
