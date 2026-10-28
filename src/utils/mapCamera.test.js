import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAP_ZOOM,
  DEFAULT_MAP_CENTER,
  STATION_FOCUS_ZOOM,
  ZERO_PADDING,
  calculateFocusZoom,
  calculateUnfocusCamera,
  zoomOutTarget,
  CAMERA_EASE_MS,
  panelAwarePadding,
  usableArea,
  restingSheetRect,
  samePadding,
  recentreOnResize,
  FOCUS_EDGE_PX,
  SHEET_GAP_PX,
} from './mapCamera';

describe('mapCamera', () => {
  describe('constants', () => {
    it('defines expected default zoom and center', () => {
      expect(DEFAULT_MAP_ZOOM).toBe(12.3);
      expect(DEFAULT_MAP_CENTER).toEqual([-0.3763, 39.4699]);
      expect(STATION_FOCUS_ZOOM).toBe(15.0);
      expect(ZERO_PADDING).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });
  });

  describe('calculateFocusZoom', () => {
    it('preserves user zoom level when focused (Google Maps natural interaction)', () => {
      expect(calculateFocusZoom(13.8)).toBe(13.8);
      expect(calculateFocusZoom(14.5)).toBe(14.5);
      expect(calculateFocusZoom(16.0)).toBe(16.0);
    });

    it('clamps to DEFAULT_MAP_ZOOM if current zoom is lower than network overview', () => {
      const zoom = calculateFocusZoom(10.0);
      expect(zoom).toBe(DEFAULT_MAP_ZOOM);
    });
  });

  describe('calculateUnfocusCamera', () => {
    it('always resets padding to ZERO_PADDING', () => {
      const result = calculateUnfocusCamera({
        currentZoom: 14.5,
      });
      expect(result.padding).toEqual(ZERO_PADDING);
    });

    it('preserves currentZoom when exiting station focus', () => {
      const result = calculateUnfocusCamera({
        currentZoom: 14.5,
      });
      expect(result.zoom).toBe(14.5);
      expect(result.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('falls back to preFocusZoom or DEFAULT_MAP_ZOOM if currentZoom is null', () => {
      const resultWithPreFocus = calculateUnfocusCamera({
        preFocusZoom: 13.0,
      });
      expect(resultWithPreFocus.zoom).toBe(13.0);

      const resultDefault = calculateUnfocusCamera({
        currentZoom: null,
        preFocusZoom: null,
      });
      expect(resultDefault.zoom).toBe(DEFAULT_MAP_ZOOM);
    });

    it('restores higher preFocusZoom if user entered search while already zoomed in', () => {
      const result = calculateUnfocusCamera({
        preFocusZoom: 15.5,
      });
      expect(result.zoom).toBe(15.5);
      expect(result.padding).toEqual(ZERO_PADDING);
    });
  });

  describe('usableArea (one rule for where a selected stop is centred)', () => {
    const container = { top: 0, right: 400, bottom: 800, left: 0 };

    it('portrait: the free area ends at the measured sheet top, below the search bar', () => {
      const { rect, padding, centre } = usableArea({
        isLandscape: false,
        containerRect: container,
        searchBarRect: { bottom: 70 },
        sheetRect: { top: 450 },
      });
      expect(rect).toEqual({ left: FOCUS_EDGE_PX, top: 82, right: 400 - FOCUS_EDGE_PX, bottom: 450 - SHEET_GAP_PX });
      expect(padding).toEqual({ top: 82, right: FOCUS_EDGE_PX, bottom: 800 - 450 + SHEET_GAP_PX, left: FOCUS_EDGE_PX });
      expect(centre).toEqual({ x: 200, y: (82 + 442) / 2 });
    });

    it('landscape: the free area ends at the measured sheet left edge', () => {
      const { rect, centre } = usableArea({
        isLandscape: true,
        containerRect: { top: 0, right: 1200, bottom: 800, left: 0 },
        searchBarRect: { bottom: 64 },
        sheetRect: { left: 850 },
      });
      expect(rect).toEqual({ left: FOCUS_EDGE_PX, top: 76, right: 850 - SHEET_GAP_PX, bottom: 800 - FOCUS_EDGE_PX });
      expect(centre).toEqual({ x: (12 + 842) / 2, y: (76 + 788) / 2 });
    });

    it('measures from the container, not the viewport', () => {
      const { rect } = usableArea({
        isLandscape: false,
        containerRect: { top: 40, right: 420, bottom: 840, left: 20 },
        searchBarRect: { bottom: 110 },
        sheetRect: { top: 500 },
      });
      expect(rect.top).toBe(110 - 40 + 12);
      expect(rect.bottom).toBe(500 - 40 - SHEET_GAP_PX);
      expect(rect.right).toBe(400 - FOCUS_EDGE_PX);
    });

    it('moves the centre with every sheet height (no estimate, no extra clearance)', () => {
      const centreFor = (top) => usableArea({
        isLandscape: false, containerRect: container, searchBarRect: { bottom: 70 }, sheetRect: { top },
      }).centre.y;
      expect(centreFor(300)).toBeLessThan(centreFor(450));
      expect(centreFor(450)).toBeLessThan(centreFor(600));
      expect(centreFor(450)).toBe((82 + 450 - SHEET_GAP_PX) / 2);
    });

    it('keeps a minimum aperture on small windows', () => {
      const { rect } = usableArea({
        isLandscape: false,
        containerRect: { top: 0, right: 360, bottom: 500, left: 0 },
        searchBarRect: { bottom: 70 },
        sheetRect: { top: 120 },
      });
      expect(rect.bottom - rect.top).toBeGreaterThanOrEqual(120);
    });

    it('has no sheet: only the edge margin at the bottom', () => {
      const { rect } = usableArea({
        isLandscape: false, containerRect: container, searchBarRect: { bottom: 70 }, hasPanel: false,
      });
      expect(rect.bottom).toBe(800 - FOCUS_EDGE_PX);
    });

    it('falls back to a proportional sheet when expected but not measurable yet', () => {
      const portrait = usableArea({ isLandscape: false, hasPanel: true, viewportWidth: 400, viewportHeight: 800 });
      expect(portrait.rect.bottom).toBe(Math.round(800 - 800 * 0.45 - SHEET_GAP_PX));
      const landscape = usableArea({ isLandscape: true, hasPanel: true, viewportWidth: 1000, viewportHeight: 700 });
      expect(landscape.rect.right).toBe(Math.round(1000 - 1000 * 0.34 - SHEET_GAP_PX));
    });
  });

  describe('panelAwarePadding', () => {
    it('is the padding of usableArea', () => {
      const args = {
        isLandscape: false,
        containerRect: { top: 0, right: 400, bottom: 800, left: 0 },
        searchBarRect: { bottom: 70 },
        panelRect: { top: 450 },
      };
      expect(panelAwarePadding(args)).toEqual(usableArea(args).padding);
    });
  });

  describe('restingSheetRect', () => {
    it('uses layout offsets so an in-flight slide-up transform cannot skew the measurement', () => {
      const rect = restingSheetRect({
        rect: { top: 760, left: 12 }, // mid-animation, translated down
        offsetParentRect: { top: 40, left: 0 },
        offsetTop: 420,
        offsetLeft: 12,
      });
      expect(rect).toEqual({ top: 460, left: 12 });
    });

    it('falls back to the drawn rect without an offset parent', () => {
      expect(restingSheetRect({ rect: { top: 500, left: 8 } })).toEqual({ top: 500, left: 8 });
    });

    it('is undefined when nothing was measured', () => {
      expect(restingSheetRect({})).toBeUndefined();
    });
  });

  describe('samePadding', () => {
    const p = { top: 82, right: 12, bottom: 358, left: 12 };
    it('treats sub-pixel noise as equal and a real change as different', () => {
      expect(samePadding(p, { ...p, bottom: 358.4 })).toBe(true);
      expect(samePadding(p, { ...p, bottom: 372 })).toBe(false);
      expect(samePadding(p, null)).toBe(false);
    });
  });

  describe('recentreOnResize', () => {
    it('eases to the same target under the new padding, keeping the zoom', () => {
      const calls = [];
      const map = { getZoom: () => 16.2, easeTo: (o) => calls.push(o) };
      const padding = { top: 82, right: 12, bottom: 400, left: 12 };
      recentreOnResize(map, [-0.37, 39.46], padding);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ center: [-0.37, 39.46], padding, duration: CAMERA_EASE_MS });
      expect(calls[0].zoom).toBeUndefined();
    });
  });

  describe('zoomOutTarget', () => {
    it('preserves current zoom ratio on sheet exit (Google Maps natural interaction)', () => {
      expect(zoomOutTarget(15.0)).toBe(15.0);
      expect(zoomOutTarget(13.5)).toBe(13.5);
      expect(zoomOutTarget(DEFAULT_MAP_ZOOM)).toBe(DEFAULT_MAP_ZOOM);
    });
  });

  it('eases for 400 ms', () => {
    expect(CAMERA_EASE_MS).toBe(400);
  });
});

describe('fitBoundsOptions (#95)', () => {
  it('makes the given padding absolute so carried padding is never added', async () => {
    const { fitBoundsOptions } = await import('./mapCamera');
    const o = fitBoundsOptions({ top: 10, left: 5 }, { maxZoom: 13, duration: 400 });
    expect(o.absolutePadding).toBe(true);
    expect(o.padding).toEqual({ top: 10, right: 0, bottom: 0, left: 5 });
    expect(o.maxZoom).toBe(13);
    expect(o.duration).toBe(400);
  });
});

describe('visibleCentreScreenPoint', () => {
  it('is the middle of the area left free by the padding', async () => {
    const { visibleCentreScreenPoint } = await import('./mapCamera');
    const map = {
      getContainer: () => ({ clientWidth: 390, clientHeight: 844 }),
      getPadding: () => ({ top: 100, right: 0, bottom: 400, left: 0 }),
    };
    expect(visibleCentreScreenPoint(map)).toEqual({ x: 195, y: 272 });
  });
});
