import { describe, it, expect } from 'vitest';
import {
  DEFAULT_MAP_ZOOM,
  DEFAULT_MAP_CENTER,
  STATION_FOCUS_ZOOM,
  ZERO_PADDING,
  calculateFocusZoom,
  calculateUnfocusCamera,
  panelAwarePadding,
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
        currentZoom: 14.6,
        preFocusZoom: 12.3,
      });
      expect(result.padding).toEqual(ZERO_PADDING);
    });

    it('restores preFocusZoom when exiting station focus without user pan', () => {
      const result = calculateUnfocusCamera({
        currentZoom: 14.6,
        preFocusZoom: 12.3,
        userPanned: false,
      });
      expect(result.zoom).toBe(12.3);
      expect(result.shouldAnimateZoom).toBe(true);
      expect(result.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('preserves current zoom and suppresses zoom animation if user panned away manually', () => {
      const result = calculateUnfocusCamera({
        currentZoom: 15.2,
        preFocusZoom: 12.3,
        userPanned: true,
      });
      expect(result.zoom).toBe(15.2);
      expect(result.shouldAnimateZoom).toBe(false);
      expect(result.padding).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('falls back to DEFAULT_MAP_ZOOM if preFocusZoom is null and user did not pan', () => {
      const result = calculateUnfocusCamera({
        currentZoom: 14.6,
        preFocusZoom: null,
      });
      expect(result.zoom).toBe(12.3);
      expect(result.shouldAnimateZoom).toBe(true);
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

    it('computes portrait padding using panel bottom height and search bar top', () => {
      const padding = panelAwarePadding({
        isLandscape: false,
        containerRect: { top: 0, right: 400, bottom: 800, left: 0 },
        searchBarRect: { bottom: 70 },
        panelRect: { top: 450 },
      });

      expect(padding.top).toBe(70 + 12);
      expect(padding.right).toBe(24);
      expect(padding.bottom).toBe((800 - 450) + 16);
      expect(padding.left).toBe(24);
    });

    it('falls back gracefully if rects are missing', () => {
      const landscapePadding = panelAwarePadding({ isLandscape: true });
      expect(landscapePadding.bottom).toBe(40);
      expect(landscapePadding.left).toBe(40);

      const portraitPadding = panelAwarePadding({ isLandscape: false });
      expect(portraitPadding.right).toBe(24);
      expect(portraitPadding.left).toBe(24);
    });
  });
});
