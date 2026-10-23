import { describe, it, expect, afterEach, vi } from 'vitest';
import { hasSeenLatestRelease, markLatestReleaseSeen, WHATS_NEW_STORAGE_KEY } from './whatsNew';
import { CHANGELOG, LATEST_RELEASE_ID } from '../data/changelog';

const stubStorage = (store) => vi.stubGlobal('window', {
  localStorage: {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v; },
  },
});

afterEach(() => vi.unstubAllGlobals());

describe('what\'s new seen state', () => {
  it('is unseen on a first visit and seen after the sheet is closed', () => {
    stubStorage({});
    expect(hasSeenLatestRelease()).toBe(false);
    markLatestReleaseSeen();
    expect(hasSeenLatestRelease()).toBe(true);
  });

  it('brings the banner back when a newer release is announced', () => {
    stubStorage({ [WHATS_NEW_STORAGE_KEY]: '2026-01-01' });
    expect(hasSeenLatestRelease()).toBe(false);
  });

  it('still works when storage throws', () => {
    vi.stubGlobal('window', { localStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } });
    expect(hasSeenLatestRelease()).toBe(false);
    expect(() => markLatestReleaseSeen()).not.toThrow();
  });
});

describe('changelog', () => {
  it('lists newest first, in English and Spanish with the same number of items', () => {
    expect(LATEST_RELEASE_ID).toBe(CHANGELOG[0].id);
    for (const entry of CHANGELOG) {
      expect(entry.en.items.length).toBeGreaterThan(0);
      expect(entry.es.items).toHaveLength(entry.en.items.length);
    }
  });
});
