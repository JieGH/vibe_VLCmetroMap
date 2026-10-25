import { describe, it, expect, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ getPlatform: () => 'web' }));
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => bridge.getPlatform() } }));

import { isAndroid } from './platform';

describe('isAndroid', () => {
  it('is true only on the native Android platform', () => {
    bridge.getPlatform = () => 'android';
    expect(isAndroid()).toBe(true);
    bridge.getPlatform = () => 'ios';
    expect(isAndroid()).toBe(false);
    bridge.getPlatform = () => 'web';
    expect(isAndroid()).toBe(false);
  });

  it('is false when the platform cannot be read', () => {
    bridge.getPlatform = () => { throw new Error('no bridge'); };
    expect(isAndroid()).toBe(false);
  });
});
