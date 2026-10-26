import { describe, it, expect } from 'vitest';
import { isHubStation, captureReturnContext, resolveReturn, reconcileReturnContext } from './returnContext';

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
