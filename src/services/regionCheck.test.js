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
