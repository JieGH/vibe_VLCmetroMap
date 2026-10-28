import { describe, it, expect } from 'vitest';
import { thinStopsForZoom, EMT_DOT_ENTER_ZOOM } from './emtDotMode';

const stop = (code, lng, lat, lines = ['1']) => ({ stopCode: code, coordinates: [lng, lat], lines });
// Five stops along one street, ~15 m apart.
const street = [0, 1, 2, 3, 4].map((i) => stop(String(100 + i), -0.3763 + i * 0.00017, 39.4699));

describe('thinStopsForZoom (#140)', () => {
  it('draws one stop for a street when zoomed far out', () => {
    expect(thinStopsForZoom(street, 12.3, 39.47)).toHaveLength(1);
  });

  it('shows more stops as you zoom in, never fewer', () => {
    const counts = [12.3, 13, 13.5, 13.89].map((z) => thinStopsForZoom(street, z, 39.47).length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[counts.length - 1]).toBeGreaterThan(1);
  });

  it('returns every stop, untouched, from the logo zoom up', () => {
    expect(thinStopsForZoom(street, EMT_DOT_ENTER_ZOOM, 39.47)).toBe(street);
  });

  it('is stable: same pick whatever the input order, preferring the stop with most lines', () => {
    const hub = stop('999', -0.3763, 39.4699, ['1', '2', '3']);
    const a = thinStopsForZoom([...street, hub], 12.3, 39.47);
    const b = thinStopsForZoom([hub, ...[...street].reverse()], 12.3, 39.47);
    expect(a.map((s) => s.stopCode)).toEqual(b.map((s) => s.stopCode));
    expect(a.map((s) => s.stopCode)).toContain('999');
  });
});

describe('thinning follows the real marker stage (#140)', () => {
  it('stays thinned while the markers are still dots, even past the enter zoom (hysteresis band)', () => {
    expect(thinStopsForZoom(street, 14.0, 39.47, 'dot').length).toBeLessThan(street.length);
  });
  it('draws every stop once the stage is logo or lines, whatever the zoom', () => {
    expect(thinStopsForZoom(street, 13.0, 39.47, 'logo')).toBe(street);
  });
});
