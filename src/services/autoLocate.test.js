import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));

import { createAutoLocator, RESUME_AFTER_HIDDEN_MS } from './autoLocate';
import { resetPermissionCache, AUTO_LOCATE_PROMPTED_KEY } from './userLocation';

const NEAR_BENIMACLET = [-0.3623333275, 39.4875];
const OFF_NETWORK = [-0.3, 39.3];

const fix = (coordinates, accuracy = 12) => ({
  coords: { longitude: coordinates[0], latitude: coordinates[1], accuracy },
});

const fakeProvider = ({ permission = 'granted', requested = 'granted', position = fix(NEAR_BENIMACLET), error = null } = {}) => ({
  checkPermissions: vi.fn(async () => ({ location: permission })),
  requestPermissions: vi.fn(async () => ({ location: requested })),
  getCurrentPosition: vi.fn(async () => {
    if (error) throw error;
    return position;
  }),
});

const memoryStorage = () => {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
};

const fakeDoc = () => {
  const listeners = new Set();
  return {
    hidden: false,
    addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn),
    set(hidden) {
      this.hidden = hidden;
      listeners.forEach((fn) => fn());
    },
    listeners,
  };
};

// Lets the awaited permission check and fix settle without real time passing.
const settle = () => vi.advanceTimersByTimeAsync(0);

describe('createAutoLocator', () => {
  let storage;
  let doc;
  let clock;
  let onFix;

  const make = (provider, { isNative = false } = {}) => {
    const locator = createAutoLocator({
      provider, isNative, storage, doc, now: () => clock, onFix,
    });
    return locator;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    resetPermissionCache();
    storage = memoryStorage();
    doc = fakeDoc();
    clock = 0;
    onFix = vi.fn();
  });

  afterEach(() => vi.useRealTimers());

  it('granted: selects the Nearest Station once the map is ready', async () => {
    const locator = make(fakeProvider());
    locator.start();
    await settle();
    expect(onFix).not.toHaveBeenCalled();
    locator.setReady();
    expect(onFix).toHaveBeenCalled();
    expect(onFix.mock.calls.at(-1)[0].nearestStation.properties.name).toBe('Benimaclet');
  });

  it('web prompt state: makes no request of any kind', async () => {
    const provider = fakeProvider({ permission: 'prompt' });
    const locator = make(provider);
    locator.setReady();
    locator.start();
    await settle();
    expect(provider.requestPermissions).not.toHaveBeenCalled();
    expect(provider.getCurrentPosition).not.toHaveBeenCalled();
    expect(onFix).not.toHaveBeenCalled();
  });

  it('native first launch: asks once, sets the flag, then locates', async () => {
    const provider = fakeProvider({ permission: 'prompt' });
    const locator = make(provider, { isNative: true });
    locator.setReady();
    locator.start();
    await settle();
    expect(provider.requestPermissions).toHaveBeenCalledTimes(1);
    expect(storage.data[AUTO_LOCATE_PROMPTED_KEY]).toBe('1');
    expect(onFix).toHaveBeenCalled();
  });

  it('native second launch after a deny: no request', async () => {
    storage.setItem(AUTO_LOCATE_PROMPTED_KEY, '1');
    const provider = fakeProvider({ permission: 'prompt' });
    const locator = make(provider, { isNative: true });
    locator.setReady();
    locator.start();
    await settle();
    expect(provider.requestPermissions).not.toHaveBeenCalled();
    expect(onFix).not.toHaveBeenCalled();
  });

  it('denied, timeout, imprecise and out-of-range all stay silent and move nothing', async () => {
    const denied = Object.assign(new Error('denied'), { code: 1 });
    const providers = [
      fakeProvider({ permission: 'denied' }),
      fakeProvider({ error: denied }),
      fakeProvider({ position: fix(NEAR_BENIMACLET, 900) }),
      fakeProvider({ position: fix(OFF_NETWORK) }),
    ];
    for (const provider of providers) {
      resetPermissionCache();
      const locator = make(provider);
      locator.setReady();
      locator.start();
      await settle();
      locator.stop();
    }
    expect(onFix).not.toHaveBeenCalled();
  });

  it('a viewer interaction before a late fix wins', async () => {
    const locator = make(fakeProvider());
    locator.start();
    locator.interrupt();
    await settle();
    locator.setReady();
    expect(onFix).not.toHaveBeenCalled();
  });

  it('the locate button interrupting a run drops its result', async () => {
    const locator = make(fakeProvider());
    locator.setReady();
    locator.start();
    locator.interrupt();
    await settle();
    expect(onFix).not.toHaveBeenCalled();
  });

  it('does not start a second run while one is in flight', async () => {
    const resolveFn = vi.fn(() => new Promise(() => {}));
    const locator = createAutoLocator({
      provider: fakeProvider(), isNative: true, storage, doc, now: () => clock, onFix, resolveFn,
    });
    locator.start();
    doc.set(true);
    clock = RESUME_AFTER_HIDDEN_MS;
    doc.set(false);
    await settle();
    expect(resolveFn).toHaveBeenCalledTimes(1);
  });

  describe('resume on native', () => {
    const resumeAfter = async (provider, ms) => {
      const locator = make(provider, { isNative: true });
      locator.setReady();
      locator.start();
      await settle();
      const launchCalls = provider.getCurrentPosition.mock.calls.length;
      doc.set(true);
      clock += ms;
      doc.set(false);
      await settle();
      return provider.getCurrentPosition.mock.calls.length - launchCalls;
    };

    it('locates again after 5 minutes hidden', async () => {
      expect(await resumeAfter(fakeProvider(), RESUME_AFTER_HIDDEN_MS)).toBeGreaterThan(0);
    });

    it('does not locate after less than 5 minutes hidden', async () => {
      expect(await resumeAfter(fakeProvider(), RESUME_AFTER_HIDDEN_MS - 1)).toBe(0);
    });

    it('does not listen for visibility on the web', () => {
      make(fakeProvider(), { isNative: false }).start();
      expect(doc.listeners.size).toBe(0);
    });

    it('stop removes the listener', () => {
      const locator = make(fakeProvider(), { isNative: true });
      locator.start();
      expect(doc.listeners.size).toBe(1);
      locator.stop();
      expect(doc.listeners.size).toBe(0);
    });
  });
});
