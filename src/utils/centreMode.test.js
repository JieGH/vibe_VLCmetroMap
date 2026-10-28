import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { shouldRefreshGpsHub, buildGpsHub } from './returnContext';
import {
  isCentrePinActive,
  buildCentrePing,
  isCentrePinRefresh,
  shouldLeaveCentreMode,
  createUserGestureGate,
} from './centrePin';

const hub = { properties: { name: "Where you're at" } };
const ping = { isPin: true, properties: { name: 'Map Ping' } };
const metro = { properties: { name: 'Xàtiva' } };
const fix = { status: 'located', coordinates: [-0.37, 39.47] };

describe('isCentrePinActive', () => {
  it('is on only while a hub or ping is showing and no bus stop covers it', () => {
    expect(isCentrePinActive({ centreMode: true, selectedStation: hub, selectedBusStop: null })).toBe(true);
    expect(isCentrePinActive({ centreMode: true, selectedStation: ping, selectedBusStop: null })).toBe(true);
    expect(isCentrePinActive({ centreMode: true, selectedStation: metro, selectedBusStop: null })).toBe(false);
    expect(isCentrePinActive({ centreMode: true, selectedStation: null, selectedBusStop: null })).toBe(false);
    expect(isCentrePinActive({ centreMode: true, selectedStation: hub, selectedBusStop: { code: 1 } })).toBe(false);
    expect(isCentrePinActive({ centreMode: false, selectedStation: hub, selectedBusStop: null })).toBe(false);
  });
});

describe('shouldLeaveCentreMode', () => {
  const base = { centreMode: true, userLocation: fix, selectedStation: hub, selectedBusStop: null, hasReturnContext: false };
  it('stays while the hub is showing', () => expect(shouldLeaveCentreMode(base)).toBe(false));
  it('stays while a stop opened from the hub is up (return context held)', () => {
    expect(shouldLeaveCentreMode({ ...base, selectedStation: null, selectedBusStop: { code: 1 }, hasReturnContext: true })).toBe(false);
    expect(shouldLeaveCentreMode({ ...base, selectedStation: metro, hasReturnContext: true })).toBe(false);
  });
  it('leaves when the hub is closed', () => {
    expect(shouldLeaveCentreMode({ ...base, selectedStation: null })).toBe(true);
  });
  it('leaves when the location is cleared (hold-to-hide, dismissed GPS mode)', () => {
    expect(shouldLeaveCentreMode({ ...base, userLocation: null })).toBe(true);
  });
  it('leaves when a station is chosen from the map', () => {
    expect(shouldLeaveCentreMode({ ...base, selectedStation: metro })).toBe(true);
  });
  it('is a no-op when not in centre mode', () => {
    expect(shouldLeaveCentreMode({ ...base, centreMode: false, selectedStation: null })).toBe(false);
  });
});

describe('createUserGestureGate', () => {
  it('schedules a pin update after a hand gesture ends', () => {
    const schedule = vi.fn();
    const gate = createUserGestureGate(schedule);
    gate.onUserStart({ originalEvent: {} });
    gate.onMoveEnd();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
  it('ignores programmatic eases (no originalEvent)', () => {
    const schedule = vi.fn();
    const gate = createUserGestureGate(schedule);
    gate.onUserStart({});
    gate.onMoveEnd();
    expect(schedule).not.toHaveBeenCalled();
  });
  it('does not let one gesture leak into the next programmatic ease', () => {
    const schedule = vi.fn();
    const gate = createUserGestureGate(schedule);
    gate.onUserStart({ originalEvent: {} });
    gate.onMoveEnd();
    gate.onUserStart({});
    gate.onMoveEnd();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
  it('resets on a non-hand moveend, so a flag set during an ease does not leak past it', () => {
    const schedule = vi.fn();
    const gate = createUserGestureGate(schedule);
    gate.onUserStart({ originalEvent: {} });
    gate.onMoveEnd(); // the gesture
    gate.onMoveEnd(); // a later ease ends with no new hand start
    expect(schedule).toHaveBeenCalledTimes(1);
  });
  it('counts a hand gesture that interrupts a programmatic ease', () => {
    const schedule = vi.fn();
    const gate = createUserGestureGate(schedule);
    gate.onUserStart({});                          // ease starts
    gate.onMoveEnd();                              // ease interrupted: its moveend fires first
    gate.onUserStart({ originalEvent: {} });       // dragstart/zoomstart carries the hand event
    gate.onMoveEnd();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
  it('counts a hand start event that arrives without a fresh movestart', () => {
    const schedule = vi.fn();
    const gate = createUserGestureGate(schedule);
    gate.onUserStart({});
    gate.onUserStart({ originalEvent: {} }); // e.g. dragstart without a fresh movestart
    gate.onMoveEnd();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});

describe('live tracker vs the centre pin (#135)', () => {
  const gpsHub = buildGpsHub(fix);
  it('does not refresh the GPS hub while centre mode is on', () => {
    expect(shouldRefreshGpsHub({ selectedStation: gpsHub, selectedBusStop: null, centreMode: true })).toBe(false);
    expect(shouldRefreshGpsHub({ selectedStation: gpsHub, selectedBusStop: null, centreMode: false })).toBe(true);
  });
  it('does not refresh over a centre-pin Map Ping', () => {
    const { station } = buildCentrePing([-0.37, 39.47], 1);
    expect(shouldRefreshGpsHub({ selectedStation: station, selectedBusStop: null, centreMode: true })).toBe(false);
  });
});

describe('locate -> pan -> locate -> close, at state level', () => {
  // Mirrors App: `centre` is {fix}|null; the pin publishes a Map Ping and keeps centre mode on.
  const gpsHub = (f) => buildGpsHub(f);
  const step = (state, ev) => {
    const next = { ...state };
    if (ev.type === 'locate') {
      next.centre = { fix: ev.fix };
      next.userLocation = ev.fix;
      next.selectedStation = gpsHub(ev.fix);
    } else if (ev.type === 'pin') {
      const { station, userLocation } = buildCentrePing(ev.centre, ev.at);
      next.selectedStation = station;
      next.userLocation = { ...userLocation, centrePin: true };
    } else if (ev.type === 'close') {
      next.selectedStation = null;
      next.userLocation = null;
    }
    if (shouldLeaveCentreMode({
      centreMode: Boolean(next.centre),
      userLocation: next.userLocation,
      selectedStation: next.selectedStation,
      selectedBusStop: null,
      hasReturnContext: false,
    })) next.centre = null;
    return next;
  };
  const active = (st) => isCentrePinActive({ centreMode: Boolean(st.centre), selectedStation: st.selectedStation, selectedBusStop: null });

  it('stays active across the pan and a second locate, and ends on close', () => {
    let st = { centre: null, userLocation: null, selectedStation: null };
    st = step(st, { type: 'locate', fix });
    expect(active(st)).toBe(true);
    st = step(st, { type: 'pin', centre: [-0.371, 39.471], at: 2 });
    expect(active(st)).toBe(true);
    expect(isCentrePinRefresh(st.userLocation)).toBe(true);
    expect(st.centre.fix).toBe(fix);
    const fix2 = { status: 'located', coordinates: [-0.38, 39.48] };
    st = step(st, { type: 'locate', fix: fix2 });
    expect(active(st)).toBe(true);
    expect(st.centre.fix).toBe(fix2);
    expect(isCentrePinRefresh(st.userLocation)).toBe(false);
    st = step(st, { type: 'close' });
    expect(st.centre).toBeNull();
    expect(active(st)).toBe(false);
  });
});

describe('no-GPS flow: map tap -> drag -> close', () => {
  const tapState = (st) => {
    const { station, userLocation } = buildCentrePing([-0.37, 39.47], 1);
    return { centre: st.centre || { fix: null }, selectedStation: station, userLocation };
  };
  const leaves = (st) => shouldLeaveCentreMode({ centreMode: Boolean(st.centre), userLocation: st.userLocation, selectedStation: st.selectedStation, selectedBusStop: null, hasReturnContext: false });
  it('a tap without a fix is an active centre pin with no blue dot', () => {
    const st = tapState({});
    expect(st.centre.fix).toBeNull();
    expect(leaves(st)).toBe(false);
    expect(isCentrePinActive({ centreMode: true, selectedStation: st.selectedStation, selectedBusStop: null })).toBe(true);
  });
  it('closing the sheet ends centre mode', () => {
    expect(leaves({ ...tapState({}), selectedStation: null, userLocation: null })).toBe(true);
  });
});

describe('App and MapView wiring (by source: no DOM test env)', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const mapView = readFileSync(new URL('../components/MapView.jsx', import.meta.url), 'utf8');
  const tracker = readFileSync(new URL('../services/liveTracking.js', import.meta.url), 'utf8');

  it('passes the derived centre-pin state and the frozen GPS fix to MapView', () => {
    expect(app).toContain('centrePinActive={centrePinActive}');
    expect(app).toContain('gpsFix={gpsFix}');
    expect(app).toContain('isCentrePinActive(');
  });
  it('enters centre mode on a locate press and leaves via the shared rule', () => {
    expect(app).toContain('enterCentreMode(');
    expect(app).toContain('shouldLeaveCentreMode(');
    expect(app).toContain('setCentre(null)');
  });
  it('enters centre mode on a map tap (no GPS fix needed), but not for the centre pin own republish', () => {
    expect(mapView).toContain('centrePin: true');
    expect(app).toContain('options.centrePin');
    expect(app).toContain('setCentre((prev) => prev || { fix: null })');
    expect(app).not.toMatch(/isMapClick && !options\.centrePin\) setCentre\(null\)/);
  });
  it('enters centre mode for the launch auto-locate fix too', () => {
    expect(app).toMatch(/applyUserLocation\(fix, true\);\s*\/\/[^\n]*\n\s*if \(fix\.status === 'located' && fix\.coordinates\) enterCentreMode\(fix\)/);
  });
  it('draws the one green pin for both the ping marker and the overlay (no emoji)', () => {
    expect(mapView).not.toContain('📍');
    expect(mapView.match(/pinSvg\(\)/g)).toHaveLength(2);
  });
  it('refreshes the hub in place for a centre-pin move: no selection focus or framing ease (#136)', () => {
    expect(mapView).toContain('isCentrePinRefresh(userLocation) && Boolean(selectedStation.isPin)');
    expect(mapView).toContain('if (isCentrePinRefresh(userLocation)) return;');
  });
  it('gates the moveend sync on user gestures', () => {
    expect(mapView).toContain('createUserGestureGate(sync.schedule, {');
    expect(mapView).toContain("'dragstart'");
    expect(mapView).toContain('schedule({ force: true })');
  });
  it('leaves the live tracker untouched by centre mode (ADR-0012)', () => {
    expect(tracker).not.toMatch(/centre/i);
  });
});
