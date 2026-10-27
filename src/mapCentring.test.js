import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// MapView has no DOM test environment: pin the wiring of the usable-area rule by source.
const mapView = readFileSync(new URL('./components/MapView.jsx', import.meta.url), 'utf8');

describe('selection centring is wired to measured values', () => {
  it('measures the sheet from its resting layout, not an estimate', () => {
    expect(mapView).toContain('restingSheetRect(');
    expect(mapView).toContain('panel.offsetParent');
    expect(mapView).not.toMatch(/offsetHeight\s*\|\|\s*0\)\s*\+\s*16/);
    expect(mapView).not.toContain('panelHeight');
  });

  it('re-centres the same target when the sheet or the map is resized', () => {
    expect(mapView).toContain('new ResizeObserver(');
    expect(mapView).toMatch(/observer\.observe\(panel\)/);
    expect(mapView).toMatch(/observer\.observe\(map\.getContainer\(\)\)/);
    expect(mapView).toContain('samePadding(padding, focusPaddingRef.current)');
    expect(mapView).toContain('recentreOnResize(map, coords, padding)');
  });

  it('records the padding the selection centred under, so the observer never restarts that ease', () => {
    expect(mapView.match(/focusPaddingRef\.current = panelAwarePadding\(map, \{ hasPanel: true \}\)/g)).toHaveLength(2);
  });

  it('keeps a single selection-focus pair of calls: closing the sheet never moves the camera (#95)', () => {
    expect(mapView).toContain('Closing never moves the camera (#95)');
    expect(mapView).toMatch(/observer\.disconnect\(\)/);
  });
});
