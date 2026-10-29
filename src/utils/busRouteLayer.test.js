import { describe, it, expect, vi } from 'vitest';
import { buildBusRouteGeoJSON, ensureBusRouteLayer, removeBusRouteLayer, BUS_HL_SOURCE, BUS_HL_LAYERS } from './busRouteLayer';

describe('buildBusRouteGeoJSON', () => {
  it('has one LineString per direction and no stop points (the regular EMT stop markers stay the only stop UI)', () => {
    const fc = buildBusRouteGeoJSON();
    const lines = fc.features.filter((f) => f.properties.kind === 'route');
    expect(lines.map((l) => l.properties.direction).sort()).toEqual(['to-malvarosa', 'to-nord']);
    expect(lines.every((l) => l.geometry.type === 'LineString' && l.geometry.coordinates.length > 1)).toBe(true);
    expect(fc.features).toHaveLength(lines.length);
  });
  it('skips directions without geometry', () => {
    expect(buildBusRouteGeoJSON({ directions: [{ id: 'x', polyline: [], stops: [] }] }).features).toEqual([]);
  });
});

describe('ensure/remove', () => {
  const fakeMap = (loaded = true) => {
    const src = new Set(); const lay = new Set();
    return { src, lay, isStyleLoaded: () => loaded, getSource: (i) => src.has(i), getLayer: (i) => lay.has(i),
      addSource: vi.fn((i) => src.add(i)), addLayer: vi.fn((l) => lay.add(l.id)), removeLayer: vi.fn((i) => lay.delete(i)), removeSource: vi.fn((i) => src.delete(i)) };
  };
  it('is idempotent and fully removable', () => {
    const m = fakeMap();
    ensureBusRouteLayer(m); ensureBusRouteLayer(m);
    expect(m.addSource).toHaveBeenCalledTimes(1);
    expect(m.addLayer).toHaveBeenCalledTimes(BUS_HL_LAYERS.length);
    removeBusRouteLayer(m);
    expect(m.src.has(BUS_HL_SOURCE)).toBe(false);
    expect(m.lay.size).toBe(0);
  });
  it('does nothing before the style is loaded', () => {
    const m = fakeMap(false);
    ensureBusRouteLayer(m);
    expect(m.addSource).not.toHaveBeenCalled();
  });
});
