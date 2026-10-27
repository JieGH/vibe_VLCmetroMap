import { describe, it, expect } from 'vitest';
import {
  usableCentre,
  needsRecentre,
  shouldEaseToTarget,
  focusTarget,
  cameraOnDismiss,
  RECENTRE_TOLERANCE_PX,
} from './mapCamera';

const SIZE = { width: 400, height: 800 };
const PADDING = { top: 96, right: 24, bottom: 400, left: 24 };
const CENTRE = usableCentre(SIZE, PADDING); // { x: 200, y: 248 }

// Fake map: a flat 1 px / unit projection. Records every camera call and
// applies easeTo instantly so a later project() sees where the camera went.
const makeMap = ({ zoom = 14, origin = [0, 0] } = {}) => {
  const calls = [];
  const state = { zoom, origin: [...origin], padding: { ...PADDING } };
  const record = (name) => (...args) => { calls.push([name, ...args]); };
  const map = {
    calls,
    getZoom: () => state.zoom,
    getContainer: () => ({ clientWidth: SIZE.width, clientHeight: SIZE.height }),
    // screen = usable centre + (lngLat - camera origin)
    project: ([x, y]) => ({ x: CENTRE.x + x - state.origin[0], y: CENTRE.y + y - state.origin[1] }),
    easeTo: (o) => {
      calls.push(['easeTo', o]);
      state.origin = [...o.center];
      if (o.zoom != null) state.zoom = o.zoom;
    },
    jumpTo: record('jumpTo'),
    flyTo: record('flyTo'),
    panTo: record('panTo'),
    setPadding: record('setPadding'),
  };
  return map;
};

describe('idempotent centring (#95)', () => {
  it('computes the usable-space centre', () => {
    expect(CENTRE).toEqual({ x: 200, y: 248 });
  });

  it('needsRecentre honours the tolerance', () => {
    expect(needsRecentre({ x: 200, y: 248 }, CENTRE)).toBe(false);
    expect(needsRecentre({ x: 200 + RECENTRE_TOLERANCE_PX, y: 248 }, CENTRE)).toBe(false);
    expect(needsRecentre({ x: 200 + RECENTRE_TOLERANCE_PX + 1, y: 248 }, CENTRE)).toBe(true);
  });

  it('shouldEaseToTarget also fires when zoom must change', () => {
    const base = { screenPoint: CENTRE, size: SIZE, padding: PADDING, currentZoom: 14, targetZoom: 14 };
    expect(shouldEaseToTarget(base)).toBe(false);
    expect(shouldEaseToTarget({ ...base, currentZoom: 10, targetZoom: 12.3 })).toBe(true);
  });

  it('select moves, close is silent, reselect is silent', () => {
    const map = makeMap();
    const target = [50, 90];
    expect(focusTarget(map, target, PADDING)).toBe(true);
    expect(map.calls.filter((c) => c[0] === 'easeTo')).toHaveLength(1);
    expect(map.calls[0][1].zoom).toBe(14); // user's zoom preserved
    // close: MapView makes no camera call; nothing recorded
    expect(map.calls).toHaveLength(1);
    // reselect the same place
    expect(focusTarget(map, target, PADDING)).toBe(false);
    expect(map.calls).toHaveLength(1);
  });

  const rig = (size, oldPad, newPad) => {
    const old = usableCentre(size, oldPad);
    return {
      calls: [],
      getZoom: () => 14,
      getContainer: () => ({ clientWidth: size.width, clientHeight: size.height }),
      getPadding: () => oldPad,
      project: () => old, // target sits at the old usable centre
      easeTo() { this.calls.push('easeTo'); },
      newPad,
    };
  };
  const run = (size, oldPad, newPad) => { const m = rig(size, oldPad, newPad); const r = focusTarget(m, [0, 0], newPad); return { r, calls: m.calls.length }; };
  const P = (bottom) => ({ top: 96, right: 24, bottom, left: 24 });
  const L = (right) => ({ top: 96, right, bottom: 40, left: 40 });

  it('portrait: taller sheet always eases (400 -> 584 and 400 -> 500)', () => {
    expect(run(SIZE, P(400), P(584))).toEqual({ r: true, calls: 1 });
    expect(run(SIZE, P(400), P(500))).toEqual({ r: true, calls: 1 });
  });
  it('portrait: a shorter sheet re-centres too, the centre is always the true one', () => {
    expect(run(SIZE, P(500), P(400)).r).toBe(true);
    expect(run(SIZE, P(448), P(400))).toEqual({ r: true, calls: 1 });
    expect(run(SIZE, P(400), P(398))).toEqual({ r: false, calls: 0 }); // 1 px: within tolerance
  });
  it('landscape: a wider or narrower side sheet re-centres', () => {
    const land = { width: 900, height: 420 };
    expect(run(land, L(300), L(420)).r).toBe(true);
    expect(run(land, L(340), L(300)).r).toBe(true);
  });

  it('dismiss makes no camera options and a close step records no calls', () => {
    const map = makeMap();
    focusTarget(map, [50, 90], PADDING);
    const n = map.calls.length;
    expect(cameraOnDismiss()).toBeNull();
    expect(map.calls).toHaveLength(n);
  });

  it('selecting a different target moves', () => {
    const map = makeMap();
    focusTarget(map, [50, 90], PADDING);
    expect(focusTarget(map, [400, 300], PADDING)).toBe(true);
    expect(map.calls.filter((c) => c[0] === 'easeTo')).toHaveLength(2);
  });

  it('zooms in from far out even when already centred, never zooms out', () => {
    const far = makeMap({ zoom: 10 });
    expect(focusTarget(far, [0, 0], PADDING)).toBe(true);
    expect(far.calls[0][1].zoom).toBe(12.3);
    const near = makeMap({ zoom: 17 });
    focusTarget(near, [30, 30], PADDING);
    expect(near.calls[0][1].zoom).toBe(17);
  });
});
