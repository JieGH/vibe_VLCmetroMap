import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const capacitor = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => capacitor.native },
}));

import { arrivalStore } from './arrivalStore';
import { BACKOFF_FIRST_MS } from '../utils/apiRefusal';
import { getApiDiagnostics } from '../utils/diagnostics';

const NOW = Date.UTC(2026, 10, 2, 10, 0, 0);
const A = { apiId: 17, name: 'Àngel Guimerà' };
const B = { apiId: 115, name: 'Marítim' };
const C = { apiId: 33, name: 'Torrent' };

const blocked = (status = 403) => vi.fn(async () => ({
  ok: false, status, text: async () => '<html>Access denied</html>',
}));
const htmlOk = () => vi.fn(async () => ({
  ok: true, status: 200, text: async () => '<html>captcha</html>',
}));
const good = () => vi.fn(async () => ({
  ok: true, status: 200, text: async () => JSON.stringify({ previsiones: [] }),
}));

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  capacitor.native = false;
  arrivalStore.memory.clear();
  arrivalStore.inFlightRequests.clear();
  arrivalStore.activeRequests = 0;
  arrivalStore.requestQueue = [];
  arrivalStore.lastRequestTimestamp = 0;
  arrivalStore.rateLimitedUntil = 0;
  arrivalStore.resetApiRefusal();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('train API refusal (#123)', () => {
  it('stays quiet for a single blocked answer', async () => {
    vi.stubGlobal('fetch', blocked());
    await arrivalStore.getStationArrivals(A);
    expect(arrivalStore.isApiRefused()).toBe(false);
  });

  it('turns on after blocked answers from two stations', async () => {
    vi.stubGlobal('fetch', blocked());
    await arrivalStore.getStationArrivals(A);
    await arrivalStore.getStationArrivals(B);
    expect(arrivalStore.isApiRefused()).toBe(true);
  });

  it('reads an HTML page on a 200 as a block', async () => {
    vi.stubGlobal('fetch', htmlOk());
    await arrivalStore.getStationArrivals(A);
    await arrivalStore.getStationArrivals(B);
    expect(arrivalStore.isApiRefused()).toBe(true);
  });

  it('never turns on for 429s, 502s or hangs', async () => {
    for (const status of [429, 502]) {
      vi.stubGlobal('fetch', blocked(status));
      arrivalStore.rateLimitedUntil = 0;
      await arrivalStore.getStationArrivals(A, { forceRefresh: true });
      await arrivalStore.getStationArrivals(B, { forceRefresh: true });
      await arrivalStore.getStationArrivals(C, { forceRefresh: true });
    }
    const hang = (_u, { signal }) => new Promise((_r, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    });
    vi.stubGlobal('fetch', vi.fn(hang));
    for (const s of [A, B, C]) {
      const p = arrivalStore.getStationArrivals(s, { forceRefresh: true });
      await vi.advanceTimersByTimeAsync(9000);
      await p;
    }
    expect(arrivalStore.isApiRefused()).toBe(false);
  });

  it('turns off after one good answer', async () => {
    vi.stubGlobal('fetch', blocked());
    await arrivalStore.getStationArrivals(A);
    await arrivalStore.getStationArrivals(B);
    vi.stubGlobal('fetch', good());
    await arrivalStore.getStationArrivals(C, { forceRefresh: true });
    expect(arrivalStore.isApiRefused()).toBe(false);
  });

  it('sends far fewer requests while refused, then probes after the backoff', async () => {
    const fetch = blocked();
    vi.stubGlobal('fetch', fetch);
    await arrivalStore.getStationArrivals(A);
    await arrivalStore.getStationArrivals(B);
    expect(fetch).toHaveBeenCalledTimes(2);

    // A sweep every 10 s for 25 s: nothing goes out.
    for (let i = 0; i < 3; i++) {
      await vi.advanceTimersByTimeAsync(8_000);
      const r = await arrivalStore.getStationArrivals(C);
      expect(r.fetchError).toMatch(/refused/i);
    }
    expect(fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(BACKOFF_FIRST_MS);
    await arrivalStore.getStationArrivals(C);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('lets a manual refresh through at once', async () => {
    const fetch = blocked();
    vi.stubGlobal('fetch', fetch);
    await arrivalStore.getStationArrivals(A);
    await arrivalStore.getStationArrivals(B);
    await arrivalStore.getStationArrivals(C, { forceRefresh: true });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('skips the background sweep while backing off', async () => {
    const fetch = blocked();
    vi.stubGlobal('fetch', fetch);
    await arrivalStore.getStationArrivals(A);
    await arrivalStore.getStationArrivals(B);
    fetch.mockClear();
    const result = await arrivalStore.syncNetwork();
    expect(fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ fetched: 0, skipped: 0 });
  });

  it('records the failure class and status for diagnostics, without any address', async () => {
    vi.stubGlobal('fetch', blocked(403));
    await arrivalStore.getStationArrivals(A);
    const diag = getApiDiagnostics();
    expect(diag.train).toMatchObject({ kind: 'blocked', status: 403 });
    expect(typeof diag.train.at).toBe('string');
    expect(JSON.stringify(diag)).not.toMatch(/\d+\.\d+\.\d+\.\d+/);
  });

  it('tells subscribers when the state flips', async () => {
    vi.stubGlobal('fetch', blocked());
    const listener = vi.fn();
    arrivalStore.subscribe(listener);
    await arrivalStore.getStationArrivals(A);
    await arrivalStore.getStationArrivals(B);
    await vi.advanceTimersByTimeAsync(10);
    expect(listener).toHaveBeenCalled();
  });
});
