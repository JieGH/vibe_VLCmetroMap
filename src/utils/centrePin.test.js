import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CENTRE_PIN_DEBOUNCE_MS,
  CENTRE_PIN_MIN_MOVE_M,
  visibleCentreLngLat,
  movedEnough,
  buildCentrePing,
  createCentrePinSync,
} from './centrePin';

// A stand-in for MapLibre: a flat 1e-5 deg/px grid so unproject is easy to predict.
const fakeMap = ({ width = 400, height = 800, padding = { top: 0, right: 0, bottom: 0, left: 0 } } = {}) => ({
  getContainer: () => ({ clientWidth: width, clientHeight: height }),
  getPadding: () => padding,
  unproject: ([x, y]) => ({ lng: x * 1e-5, lat: -y * 1e-5 }),
});

describe('centrePin', () => {
  describe('visibleCentreLngLat', () => {
    it('is the container middle when nothing pads the camera', () => {
      expect(visibleCentreLngLat(fakeMap())).toEqual([200 * 1e-5, -400 * 1e-5]);
    });

    it('is the middle of the area above the sheet when the camera carries bottom padding', () => {
      const map = fakeMap({ padding: { top: 100, right: 0, bottom: 300, left: 0 } });
      // usable y runs 100..500, so its middle is 300
      expect(visibleCentreLngLat(map)).toEqual([200 * 1e-5, -300 * 1e-5]);
    });

    it('accounts for a landscape side panel on the right', () => {
      const map = fakeMap({ padding: { top: 0, right: 100, bottom: 0, left: 20 } });
      expect(visibleCentreLngLat(map)).toEqual([160 * 1e-5, -400 * 1e-5]);
    });
  });

  describe('movedEnough', () => {
    it('treats a missing previous point as a move', () => {
      expect(movedEnough(null, [-0.37, 39.47])).toBe(true);
    });

    it('skips moves under the 15 m threshold', () => {
      // ~11 m north
      expect(movedEnough([-0.37, 39.47], [-0.37, 39.4701])).toBe(false);
    });

    it('accepts moves over the threshold', () => {
      // ~22 m north
      expect(movedEnough([-0.37, 39.47], [-0.37, 39.4702])).toBe(true);
      expect(CENTRE_PIN_MIN_MOVE_M).toBe(15);
    });
  });

  describe('buildCentrePing', () => {
    it('reuses the Map Ping shape so hub, nodes and walk radii work unchanged', () => {
      const station = buildCentrePing([-0.37, 39.47], 1234);
      expect(station.isPin).toBe(true);
      expect(station.properties).toEqual({ name: 'Map Ping', lines: [], isPin: true });
      expect(station.geometry).toEqual({ type: 'Point', coordinates: [-0.37, 39.47] });
    });

    it('carries the map-click user location', () => {
      const { userLocation } = buildCentrePing([-0.37, 39.47], 1234);
      expect(userLocation).toMatchObject({
        coordinates: [-0.37, 39.47],
        isMapClick: true,
        status: 'located',
        nearestStation: null,
        fetchedAt: 1234,
      });
    });
  });

  describe('createCentrePinSync', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('publishes the centre once, debounced after the last gesture end', () => {
      const publish = vi.fn();
      const map = fakeMap();
      const sync = createCentrePinSync({ map, publish, getLast: () => null });
      sync.schedule();
      vi.advanceTimersByTime(CENTRE_PIN_DEBOUNCE_MS - 1);
      sync.schedule(); // another gesture end restarts the wait
      vi.advanceTimersByTime(CENTRE_PIN_DEBOUNCE_MS - 1);
      expect(publish).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(publish).toHaveBeenCalledTimes(1);
      expect(publish).toHaveBeenCalledWith([200 * 1e-5, -400 * 1e-5]);
    });

    it('skips a centre that moved less than 15 m from the last pin', () => {
      const publish = vi.fn();
      const map = fakeMap();
      const last = [200 * 1e-5, -400 * 1e-5 + 0.00005]; // ~5.5 m away
      const sync = createCentrePinSync({ map, publish, getLast: () => last });
      sync.schedule();
      vi.advanceTimersByTime(CENTRE_PIN_DEBOUNCE_MS);
      expect(publish).not.toHaveBeenCalled();
    });

    it('cancel drops a pending update', () => {
      const publish = vi.fn();
      const sync = createCentrePinSync({ map: fakeMap(), publish, getLast: () => null });
      sync.schedule();
      sync.cancel();
      vi.advanceTimersByTime(CENTRE_PIN_DEBOUNCE_MS * 2);
      expect(publish).not.toHaveBeenCalled();
    });
  });
});
