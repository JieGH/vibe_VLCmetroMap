import { describe, it, expect } from 'vitest';
import { markerSyncPlan } from './markerSync';

describe('markerSyncPlan (#115)', () => {
  it('rebuilds markers even while the style is mid-update, so closing a sheet never leaves the map empty', () => {
    expect(markerSyncPlan(false).markers).toBe(true);
  });

  it('defers only the style work, and retries it when the map goes idle', () => {
    expect(markerSyncPlan(false)).toEqual({ markers: true, layers: false, retryOnIdle: true });
  });

  it('does everything at once when the style is ready', () => {
    expect(markerSyncPlan(true)).toEqual({ markers: true, layers: true, retryOnIdle: false });
  });
});
