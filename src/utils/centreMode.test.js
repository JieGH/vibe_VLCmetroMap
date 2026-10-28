import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  isCentrePinActive,
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
    gate.onMoveStart({ originalEvent: {} });
    gate.onMoveEnd();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
  it('ignores programmatic eases (no originalEvent)', () => {
    const schedule = vi.fn();
    const gate = createUserGestureGate(schedule);
    gate.onMoveStart({});
    gate.onMoveEnd();
    expect(schedule).not.toHaveBeenCalled();
  });
  it('does not let one gesture leak into the next programmatic ease', () => {
    const schedule = vi.fn();
    const gate = createUserGestureGate(schedule);
    gate.onMoveStart({ originalEvent: {} });
    gate.onMoveEnd();
    gate.onMoveStart({});
    gate.onMoveEnd();
    expect(schedule).toHaveBeenCalledTimes(1);
  });
});

describe('App and MapView wiring (by source: no DOM test env)', () => {
  const app = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
  const mapView = readFileSync(new URL('../components/MapView.jsx', import.meta.url), 'utf8');
  const tracker = readFileSync(new URL('../services/liveTracking.js', import.meta.url), 'utf8');

  it('passes the derived centre-pin state and the frozen GPS fix to MapView', () => {
    expect(app).toContain('centrePinActive={centrePinActive}');
    expect(app).toContain('gpsFix={');
    expect(app).toContain('isCentrePinActive(');
  });
  it('enters centre mode on a locate press and leaves via the shared rule', () => {
    expect(app).toContain('enterCentreMode(');
    expect(app).toContain('shouldLeaveCentreMode(');
    expect(app).toContain('setCentreMode(false)');
  });
  it('treats only a map tap (not the centre pin itself) as leaving centre mode', () => {
    expect(mapView).toContain('centrePin: true');
    expect(app).toContain('options.centrePin');
  });
  it('gates the moveend sync on user gestures', () => {
    expect(mapView).toContain('createUserGestureGate(sync.schedule)');
  });
  it('leaves the live tracker untouched by centre mode (ADR-0012)', () => {
    expect(tracker).not.toMatch(/centre/i);
  });
});
