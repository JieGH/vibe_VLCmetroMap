import { buildCentrePing } from './centrePin';
import { describe, it, expect } from 'vitest';
import { isHubStation, captureReturnContext, resolveReturn, reconcileReturnContext, buildGpsHub, isGpsHub, shouldRefreshGpsHub, stationPanelKey } from './returnContext';

const ping = { isPin: true, properties: { name: 'Map Ping' } };
const gps = { properties: { name: "Where you're at" } };
const metro = { properties: { name: 'Xàtiva' } };
const pingLoc = { isMapClick: true, coordinates: [-0.37, 39.47] };

describe('returnContext', () => {
  it('recognises hubs but not real metro stations', () => {
    expect(isHubStation(ping)).toBe(true);
    expect(isHubStation(gps)).toBe(true);
    expect(isHubStation({ properties: { isPin: true } })).toBe(true);
    expect(isHubStation(metro)).toBe(false);
    expect(isHubStation(null)).toBe(false);
  });

  it('hub -> stop -> close restores the hub', () => {
    const ctx = captureReturnContext({ selectedStation: gps, userLocation: { status: 'located' } });
    expect(resolveReturn(ctx)).toEqual({ selectedStation: gps, userLocation: { status: 'located' } });
  });

  it('keeps the ping location intact', () => {
    const ctx = captureReturnContext({ selectedStation: ping, userLocation: pingLoc });
    expect(resolveReturn(ctx).userLocation).toBe(pingLoc);
    expect(resolveReturn(ctx).selectedStation).toBe(ping);
  });

  it('a stop opened from the map (no hub selected) closes to the map', () => {
    expect(captureReturnContext({ selectedStation: null, userLocation: pingLoc })).toBeNull();
    expect(captureReturnContext({ selectedStation: metro, userLocation: null })).toBeNull();
    expect(resolveReturn(null)).toBeNull();
  });

  it('live GPS hub restores the latest fix, a ping keeps its own location', () => {
    const old = { status: 'located', coordinates: [1, 1] };
    const fresh = { status: 'located', coordinates: [2, 2] };
    expect(resolveReturn({ station: gps, userLocation: old }, fresh).userLocation).toBe(fresh);
    expect(resolveReturn({ station: ping, userLocation: pingLoc }, fresh).userLocation).toBe(pingLoc);
  });

  describe('reconcileReturnContext', () => {
    const ctx = { station: ping, userLocation: pingLoc };
    it('keeps it while the stop or metro station opened from the hub shows', () => {
      expect(reconcileReturnContext(ctx, { selectedBusStop: { stopCode: '1' } })).toBe(ctx);
      expect(reconcileReturnContext(ctx, { selectedStation: metro })).toBe(ctx);
    });
    it('drops it when a line inspector opens over the stop', () => {
      expect(reconcileReturnContext(ctx, { selectedBusStop: { stopCode: '1' }, activeBusLine: { id: 'c1' } })).toBeNull();
    });
    it('drops it when the sidebar/closing leaves nothing selected', () => {
      expect(reconcileReturnContext(ctx, {})).toBeNull();
    });
    it('drops it when a new hub is selected (e.g. a fresh GPS fix)', () => {
      expect(reconcileReturnContext(ctx, { selectedStation: gps })).toBeNull();
    });
    it('stays null with no context', () => {
      expect(reconcileReturnContext(null, { selectedBusStop: {} })).toBeNull();
    });
  });

  it('metro opened from a hub: hub captured, restored with its location', () => {
    const ctx = captureReturnContext({ selectedStation: ping, userLocation: pingLoc });
    expect(ctx).not.toBeNull();
    expect(resolveReturn(ctx)).toEqual({ selectedStation: ping, userLocation: pingLoc });
  });
});

describe('GPS hub refresh (#104)', () => {
  const fix = { coordinates: [-0.37, 39.47], nearestStation: { properties: { name: 'Xàtiva' } } };

  it('buildGpsHub makes the single GPS hub shape', () => {
    const hub = buildGpsHub(fix);
    expect(isGpsHub(hub)).toBe(true);
    expect(isHubStation(hub)).toBe(true);
    expect(hub.geometry.coordinates).toEqual(fix.coordinates);
    expect(hub.properties.nearestStation).toBe(fix.nearestStation);
  });

  it('refreshes only when the GPS hub itself is showing', () => {
    const hub = buildGpsHub(fix);
    expect(shouldRefreshGpsHub({ selectedStation: hub, selectedBusStop: null })).toBe(true);
    expect(shouldRefreshGpsHub({ selectedStation: hub, selectedBusStop: { stopCode: 1 } })).toBe(false);
    expect(shouldRefreshGpsHub({ selectedStation: null, selectedBusStop: { stopCode: 1 } })).toBe(false);
    expect(shouldRefreshGpsHub({ selectedStation: { properties: { name: 'Map Ping', isPin: true } } })).toBe(false);
  });

  it('a refreshed hub does not drop the remembered context while a stop is showing', () => {
    const ctx = captureReturnContext({ selectedStation: buildGpsHub(fix), userLocation: fix });
    expect(reconcileReturnContext(ctx, { selectedStation: null, selectedBusStop: { stopCode: 1 } })).toBe(ctx);
  });

  it('returning to a GPS hub rebuilds it from the latest fix', () => {
    const ctx = captureReturnContext({ selectedStation: buildGpsHub(fix), userLocation: fix });
    const later = { coordinates: [-0.371, 39.471], nearestStation: { properties: { name: 'Colón' } } };
    const back = resolveReturn(ctx, later);
    expect(back.selectedStation.geometry.coordinates).toEqual(later.coordinates);
    expect(back.selectedStation.properties.nearestStation).toBe(later.nearestStation);
  });
});

describe('geolocation sheet identity', () => {
  it('keeps one sheet mounted when the GPS camera settles and publishes the centre pin', () => {
    const fix = { coordinates: [-0.377, 39.47], nearestStation: metro };
    const gpsHub = buildGpsHub(fix);
    const centreHub = buildCentrePing(fix.coordinates, 123, metro).station;
    // Changing this key remounts StationPanel and replays stationPanelSlideUp.
    expect(stationPanelKey(centreHub)).toBe(stationPanelKey(gpsHub));
    expect(stationPanelKey(buildGpsHub({ ...fix, coordinates: [-0.378, 39.471] })))
      .toBe(stationPanelKey(centreHub));
  });
  it('still resets the sheet when selecting a different real station', () => {
    expect(stationPanelKey(metro)).not.toBe(stationPanelKey({ properties: { name: 'Colón' } }));
    expect(stationPanelKey(metro)).not.toBe(stationPanelKey(buildGpsHub({ coordinates: [-0.377, 39.47] })));
  });
});
