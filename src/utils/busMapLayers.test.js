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
        appendChild: vi.fn(),
        setAttribute: vi.fn(),
        getAttribute: vi.fn(),
      }),
    };
  });

  afterEach(() => {
    delete globalThis.document;
  });

  it('creates feeder bus stop marker as a rectangular wrap with EMT text without jelly transitions', () => {
    const mockMap = { isStyleLoaded: () => true };
    const stop = {
      stopCode: '1002',
      stopName: 'Carrer de Colón',
      coordinates: [-0.375, 39.469],
      walkMin: 2,
    };

    const marker = createFeederStopMarker(mockMap, stop, () => {});
    const el = marker.getElement();

    expect(el.className).toBe('emt-stop-marker');
    expect(el.style.cssText).not.toContain('transition: transform'); // Prevents jelly movement on root marker
    expect(el.title).toContain('1002');
  });

  it('creates bus stop node marker as a rectangular wrap with EMT text', () => {
    const mockMap = { isStyleLoaded: () => true };
    const stop = {
      code: '1004',
      name: 'Xàtiva',
      coordinates: [-0.377, 39.467],
    };

    const marker = createBusStopNodeMarker(mockMap, stop, () => {});
    const el = marker.getElement();

    expect(el.className).toBe('emt-stop-marker');
    expect(el.style.cssText).not.toContain('transition: transform');
  });

  it('creates feeder bus stop marker with is-selected and elevated zIndex when isSelected is true', () => {
    const mockMap = { isStyleLoaded: () => true };
    const stop = {
      stopCode: '1002',
      stopName: 'Carrer de Colón',
      coordinates: [-0.375, 39.469],
    };

    const marker = createFeederStopMarker(mockMap, stop, () => {}, true);
    const el = marker.getElement();

    expect(el.className).toBe('emt-stop-marker');
    expect(el.style.cssText).toContain('z-index: 50');
  });
});
