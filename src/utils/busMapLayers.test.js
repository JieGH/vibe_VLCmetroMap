import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFeederStopMarker, createBusStopNodeMarker } from './busMapLayers';

vi.mock('maplibre-gl', () => ({
  Marker: vi.fn(function ({ element }) {
    this.element = element;
    this.setLngLat = vi.fn().mockReturnThis();
    this.addTo = vi.fn().mockReturnThis();
    this.getElement = () => element;
  }),
}));

describe('busMapLayers marker creators', () => {
  beforeEach(() => {
    globalThis.document = {
      createElement: () => ({
        style: {},
        className: '',
        title: '',
        innerHTML: '',
        addEventListener: vi.fn(),
      }),
    };
  });

  afterEach(() => {
    delete globalThis.document;
  });

  it('creates feeder bus stop marker as a circle', () => {
    const mockMap = { isStyleLoaded: () => true };
    const stop = {
      stopCode: '1002',
      stopName: 'Carrer de Colón',
      coordinates: [-0.375, 39.469],
      walkMin: 2,
    };

    const marker = createFeederStopMarker(mockMap, stop, () => {});
    const el = marker.getElement();

    expect(el.className).toBe('feeder-stop-marker');
    expect(el.style.cssText).toContain('border-radius: 50%');
    expect(el.innerHTML).toContain('1002');
    expect(el.title).toContain('2 min walk');
    expect(el.title).not.toMatch(/\d+m\b/);
  });

  it('creates bus stop node marker as a circle', () => {
    const mockMap = { isStyleLoaded: () => true };
    const stop = {
      code: '1004',
      name: 'Xàtiva',
      coordinates: [-0.377, 39.467],
    };

    const marker = createBusStopNodeMarker(mockMap, stop, () => {});
    const el = marker.getElement();

    expect(el.className).toBe('bus-network-stop-node');
    expect(el.style.cssText).toContain('border-radius: 50%');
  });
});
