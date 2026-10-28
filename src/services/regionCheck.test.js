import { describe, it, expect, vi } from 'vitest';
import { isOutsideSpain, fetchCountry } from './regionCheck';

describe('isOutsideSpain', () => {
  it.each(['US', 'de', 'FR', 'T1'])('is true for %s', (c) => expect(isOutsideSpain(c)).toBe(true));
  it.each(['ES', 'es', 'XX', '', null, undefined, 'Spain'])('is false for %s', (c) => expect(isOutsideSpain(c)).toBe(false));
});

describe('fetchCountry', () => {
  it('returns the country code from /api/region', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ country: 'DE' }) });
    expect(await fetchCountry(fetchFn)).toBe('DE');
  });

  it('returns null on a bad status, a bad body or a network error', async () => {
    expect(await fetchCountry(vi.fn().mockResolvedValue({ ok: false }))).toBeNull();
    expect(await fetchCountry(vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))).toBeNull();
    expect(await fetchCountry(vi.fn().mockRejectedValue(new Error('offline')))).toBeNull();
  });
});

describe('re-checking while the page stays open', () => {
  it('notices a VPN switched on after the first answer, and a return to Spain', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('window', { location: { search: '' }, addEventListener: () => {} });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} });
    const answers = ['ES', 'DE', 'ES'];
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ country: answers.shift() }) })));
    const m = await import('./regionCheck');
    m.startRegionCheck();
    await vi.advanceTimersByTimeAsync(0);
    expect(m.getOutsideSpain()).toBe(false);
    await vi.advanceTimersByTimeAsync(m.RECHECK_MS);
    expect(m.getOutsideSpain()).toBe(true);
    await vi.advanceTimersByTimeAsync(m.RECHECK_MS);
    expect(m.getOutsideSpain()).toBe(false);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the last answer when a lookup fails', async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.stubGlobal('window', { location: { search: '' }, addEventListener: () => {} });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {} });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ country: 'DE' }) })
      .mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', fetchMock);
    const m = await import('./regionCheck');
    m.startRegionCheck();
    await vi.advanceTimersByTimeAsync(m.RECHECK_MS);
    expect(m.getOutsideSpain()).toBe(true);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
