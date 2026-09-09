import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAP_ZOOM,
  DEFAULT_MAP_CENTER,
  STATION_FOCUS_ZOOM,
  ZERO_PADDING,
  calculateFocusZoom,
  calculateUnfocusCamera,
  panelAwarePadding,
  PORTRAIT_FOCUS_CLEARANCE_PX,
} from './mapCamera';

describe('mapCamera', () => {
  describe('constants', () => {
    it('defines expected default zoom and center', () => {
      expect(DEFAULT_MAP_ZOOM).toBe(12.3);
      expect(DEFAULT_MAP_CENTER).toEqual([-0.3763, 39.4699]);
      expect(STATION_FOCUS_ZOOM).toBe(14.6);
      expect(ZERO_PADDING).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });
  });

  describe('calculateFocusZoom', () => {
    it('eases in to STATION_FOCUS_ZOOM if current zoom is lower (e.g. default overview)', () => {
      const zoom = calculateFocusZoom(12.3);
      expect(zoom).toBe(14.6);
    });

    it('preserves higher zoom if already zoomed in further than STATION_FOCUS_ZOOM', () => {
      const zoom = calculateFocusZoom(16.0);
      expect(zoom).toBe(16.0);
    });
  });

  describe('calculateUnfocusCamera', () => {
    it('always resets padding to ZERO_PADDING', () => {
      const result = calculateUnfocusCamera({
        preFocusZoom: 12.3,
      });
      expect(result.padding).toEqual(ZERO_PADDING);
    });

    it('restores preFocusZoom when exiting station focus', () => {
      const result = calculateUnfocusCamera({
        preFocusZoom: 12.3,
      });
      expect(result.zoom).toBe(12.3);
      expect(result.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('falls back to DEFAULT_MAP_ZOOM if preFocusZoom is null', () => {
      const result = calculateUnfocusCamera({
        preFocusZoom: null,
      });
      expect(result.zoom).toBe(12.3);
      expect(result.padding).toEqual(ZERO_PADDING);
    });

    it('restores higher preFocusZoom if user entered search while already zoomed in', () => {
      const result = calculateUnfocusCamera({
        preFocusZoom: 15.5,
      });
      expect(result.zoom).toBe(15.5);
      expect(result.padding).toEqual(ZERO_PADDING);
    });
  });

  describe('panelAwarePadding', () => {
    it('computes landscape padding using panel right width and search bar top', () => {
      const padding = panelAwarePadding({
        isLandscape: true,
        containerRect: { top: 0, right: 1200, bottom: 800, left: 0 },
        searchBarRect: { bottom: 64 },
        panelRect: { left: 850 },
      });

      expect(padding.top).toBe(64 + 12);
      expect(padding.right).toBe((1200 - 850) + 16);
      expect(padding.bottom).toBe(40);
      expect(padding.left).toBe(40);
    });

    it('computes portrait padding using panel bottom height, search bar top, and vertical clearance', () => {
      const padding = panelAwarePadding({
        isLandscape: false,
        containerRect: { top: 0, right: 400, bottom: 800, left: 0 },
        searchBarRect: { bottom: 70 },
        panelRect: { top: 450 },
      });

      expect(padding.top).toBe(70 + 12);
      expect(padding.right).toBe(24);
      // Ensures the station dot and its expanded popup bubble clear the card
      expect(padding.bottom).toBe((800 - 450) + PORTRAIT_FOCUS_CLEARANCE_PX);
      expect(padding.left).toBe(24);
    });

    it('prioritizes panelHeight layout height over in-flight partial translateY transforms', () => {
      const padding = panelAwarePadding({
        isLandscape: false,
        containerRect: { top: 0, right: 400, bottom: 800, left: 0 },
        searchBarRect: { bottom: 70 },
        // During in-flight animation, panelRect reflects a partial/offscreen position
        panelRect: { top: 750 },
        panelHeight: 300,
      });

      expect(padding.top).toBe(70 + 12);
      // Should use 300 (layout height) rather than 50 (800 - 750)
      expect(padding.bottom).toBe(300 + PORTRAIT_FOCUS_CLEARANCE_PX);
    });

    it('clamps bottom padding on small screens to preserve minimum map aperture', () => {
      const padding = panelAwarePadding({
        isLandscape: false,
        containerRect: { top: 0, right: 360, bottom: 500, left: 0 },
        searchBarRect: { bottom: 70 }, // topPadding = 82
        panelHeight: 380, // 380 + 80 = 460, would consume entire 500px screen
      });

      // maxAllowedBottom: 500 - 82 - 120 = 298
      expect(padding.bottom).toBe(298);
    });

    it('does not apply panel clearance when hasPanel is false', () => {
      const padding = panelAwarePadding({
        isLandscape: false,
        containerRect: { top: 0, right: 400, bottom: 800, left: 0 },
        searchBarRect: { bottom: 70 },
        hasPanel: false,
      });

      expect(padding.top).toBe(70 + 12);
      expect(padding.bottom).toBe(40);
    });

    it('falls back gracefully if rects are missing but hasPanel is true', () => {
      const landscapePadding = panelAwarePadding({ isLandscape: true, hasPanel: true, viewportWidth: 1000 });
      expect(landscapePadding.right).toBe(Math.round(1000 * 0.34 + 16));
      expect(landscapePadding.bottom).toBe(40);
      expect(landscapePadding.left).toBe(40);

      const portraitPadding = panelAwarePadding({ isLandscape: false, hasPanel: true, viewportHeight: 800 });
      expect(portraitPadding.right).toBe(24);
      expect(portraitPadding.left).toBe(24);
      expect(portraitPadding.bottom).toBe(Math.round(800 * 0.45 + PORTRAIT_FOCUS_CLEARANCE_PX));
    });
  });
});
