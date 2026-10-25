import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import packageJson from '../../package.json';
import metroData from '../data/metro_lines.json';
import paradasData from '../data/paradas_api.json';
import gtfsData from '../data/gtfs_expanded.json';

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

describe('MapLibre GL & Basemap Integrity', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const srcWorker = path.join(rootDir, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
  const publicWorker = path.join(rootDir, 'public/vendor/maplibre/maplibre-gl-worker.mjs');

  it('ensures public MapLibre worker matches installed maplibre-gl node_modules version exactly', () => {
    expect(fs.existsSync(publicWorker), 'public/vendor/maplibre/maplibre-gl-worker.mjs must exist').toBe(true);

    const publicSize = fs.statSync(publicWorker).size;
    expect(publicSize, 'public worker must not be empty').toBeGreaterThan(100000);

    if (fs.existsSync(srcWorker)) {
      const srcHash = hashFile(srcWorker);
      const publicHash = hashFile(publicWorker);
      expect(
        publicHash,
        `MapLibre worker protocol mismatch! public/vendor/maplibre/maplibre-gl-worker.mjs (${publicHash}) must match node_modules/maplibre-gl (${srcHash}). Run 'node scripts/sync_maplibre_worker.cjs'.`
      ).toBe(srcHash);
    }
  });

  it('ensures maplibre-gl package dependency is at least 6.16.0', () => {
    const declaredVersion = packageJson.dependencies['maplibre-gl'];
    expect(declaredVersion).toBeDefined();
    // Verify it is not an older version that has known DOM XSS or worker protocol flaws
    expect(declaredVersion).toMatch(/\^?6\.(1[6-9]|[2-9]\d|\d{3,})\./);
  });
});

describe('Valencia Metro Transit GeoJSON & Station Integrity', () => {
  it('validates 140+ metro stations have coordinates within Greater Valencia bounding box', () => {
    expect(paradasData).toBeDefined();
    expect(Array.isArray(paradasData)).toBe(true);
    expect(paradasData.length).toBeGreaterThan(130);

    for (const station of paradasData) {
      const lon = station.longitud;
      const lat = station.latitud;
      expect(Number.isFinite(lon)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
      // Valencia metro bounds: lon approx [-1.2, 0.3], lat approx [38.8, 40.0]
      expect(lon).toBeGreaterThan(-1.2);
      expect(lon).toBeLessThan(0.3);
      expect(lat).toBeGreaterThan(38.8);
      expect(lat).toBeLessThan(40.0);

      // Station properties must include a name and id
      expect(typeof station.nombre).toBe('string');
      expect(station.nombre.trim().length).toBeGreaterThan(0);
      expect(station.id).toBeDefined();
    }
  });

  it('validates metro rail track lines are valid LineString or MultiLineString geometries', () => {
    expect(metroData).toBeDefined();
    expect(Array.isArray(metroData.features)).toBe(true);
    expect(metroData.features.length).toBeGreaterThan(0);

    for (const track of metroData.features) {
      expect(['LineString', 'MultiLineString', 'Point', 'GeometryCollection']).toContain(track.geometry?.type);
      if (track.geometry?.type === 'LineString' || track.geometry?.type === 'MultiLineString') {
        expect(Array.isArray(track.geometry.coordinates)).toBe(true);
        expect(track.geometry.coordinates.length).toBeGreaterThan(0);
      }
    }
  });

  it('validates gtfs expanded dataset consistency', () => {
    expect(gtfsData).toBeDefined();
    expect(Array.isArray(gtfsData.features)).toBe(true);
    expect(gtfsData.features.length).toBeGreaterThan(50);
  });
});
