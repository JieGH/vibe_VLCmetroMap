import { describe, it, expect, vi } from 'vitest';
import { buildChevronImage, buildBusRouteGeoJSON, ensureBusRouteLayer, removeBusRouteLayer, BUS_HL_SOURCE, BUS_HL_LAYERS } from './busRouteLayer';

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
    const src = new Set(); const lay = new Set(); const img = new Set();
    return { src, lay, img, hasImage: (i) => img.has(i), addImage: vi.fn((i) => img.add(i)), isStyleLoaded: () => loaded, getSource: (i) => src.has(i), getLayer: (i) => lay.has(i),
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
  it('clears a legacy route-stop layer left behind by an older build', () => {
    const m = fakeMap();
    m.lay.add('bus-line-hl-stops'); m.src.add(BUS_HL_SOURCE);
    ensureBusRouteLayer(m);
    expect(m.lay.has('bus-line-hl-stops')).toBe(false);
    removeBusRouteLayer(m);
    expect(m.src.has(BUS_HL_SOURCE)).toBe(false);
  });
  it('draws a bold casing + fill and a chevron icon layer, no custom stop layer', () => {
    const m = fakeMap();
    ensureBusRouteLayer(m);
    expect([...m.lay]).toEqual(BUS_HL_LAYERS);
    expect(m.addImage).toHaveBeenCalledTimes(1);
  });
});

describe('buildChevronImage', () => {
  it('has white stroke pixels with a dark outline and transparent corners', () => {
    const { width, height, data } = buildChevronImage(48);
    expect(data.length).toBe(width * height * 4);
    const px = (x, y) => [...data.slice((y * width + x) * 4, (y * width + x) * 4 + 4)];
    expect(px(0, 0)[3]).toBe(0);
    let white = 0; let dark = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i + 3] === 255 && data[i] === 255) white++; else if (data[i + 3] > 0) dark++; }
    expect(white).toBeGreaterThan(50);
    expect(dark).toBeGreaterThan(50);
  });
});
