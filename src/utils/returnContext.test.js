import { describe, it, expect } from 'vitest';
import { isHubStation, captureReturnContext, resolveReturn } from './returnContext';

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

  it('closing the hub itself leaves nothing to restore', () => {
    expect(resolveReturn(captureReturnContext({}))).toBeNull();
  });

  it('metro opened from a hub: hub captured, restored with its location', () => {
    const ctx = captureReturnContext({ selectedStation: ping, userLocation: pingLoc });
    expect(ctx).not.toBeNull();
    expect(resolveReturn(ctx)).toEqual({ selectedStation: ping, userLocation: pingLoc });
  });
});
