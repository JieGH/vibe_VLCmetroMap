import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFeederStopMarker, createBusStopNodeMarker, createLiveBusMarker } from './busMapLayers';

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

  it('hugs the EMT letters: horizontal padding 3px (was 4.5px, #108)', () => {
    const marker = createFeederStopMarker({ isStyleLoaded: () => true }, { stopCode: '1', coordinates: [-0.375, 39.469] }, () => {});
    const badge = marker.getElement().appendChild.mock.calls[0][0];
    expect(badge.style.cssText).toContain('padding: 1.5px 3px');
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

  it('wraps the live bus pill so Text Size scaling never touches the map-positioned marker element', () => {
    const mockMap = { isStyleLoaded: () => true };
    const bus = { line: '7', destination: 'X', speedKmh: 10, nextStop: 'Y', coordinates: [-0.375, 39.469] };

    const marker = createLiveBusMarker(mockMap, bus, () => {});
    const el = marker.getElement();

    expect(el.className).toBe('live-bus-marker');
    expect(el.appendChild).toHaveBeenCalledTimes(1);
    const pill = el.appendChild.mock.calls[0][0];
    expect(pill.className).toBe('live-bus-pill');
    expect(pill.style.cssText).toContain('font: 800 11px/1 system-ui');
  });
});

describe('EMT stop marker line chips (#116)', () => {
  beforeEach(() => {
    globalThis.document = {
      createElement: () => ({ style: {}, className: '', title: '', innerHTML: '', addEventListener: vi.fn(), appendChild: vi.fn(), setAttribute: vi.fn(), getAttribute: vi.fn() }),
    };
  });
  afterEach(() => { delete globalThis.document; });

  const badgeFor = (stop) => createFeederStopMarker({ isStyleLoaded: () => true }, stop, () => {}).getElement().appendChild.mock.calls[0][0];

  it('keeps the EMT logo and adds the stop line chips, sorted, in the same badge', () => {
    const badge = badgeFor({ stopCode: '1', coordinates: [-0.375, 39.469], lines: ['81', '31'] });
    expect(badge.innerHTML).toContain('emt-stop-logo');
    expect(badge.innerHTML.indexOf('>31<')).toBeLessThan(badge.innerHTML.indexOf('>81<'));
    expect(badge.className).toContain('has-lines');
  });

  it('a stop without line data keeps the logo only', () => {
    const badge = badgeFor({ stopCode: '2', coordinates: [-0.375, 39.469] });
    expect(badge.className).not.toContain('has-lines');
    expect(badge.innerHTML).not.toContain('emt-stop-lines');
  });
});
