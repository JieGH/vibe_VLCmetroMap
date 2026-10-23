import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// isNativePlatform decides which URL a fetch goes to, so each test sets it.
const capacitor = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => capacitor.native },
}));

import { arrivalStore, STRATEGIC_HUBS, MAJOR_STATIONS, RELAY_STRATEGIC_HUBS, RELAY_MAJOR_STATIONS } from './arrivalStore';

const NOW = Date.UTC(2026, 9, 20, 17, 30, 0);
const FGV_PREVISION = 'https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3/';

// The shape FGV's horarios-prevision-3 returns: trains grouped under each
// Line, no timestamp of its own. Captured from Àngel Guimerà on 2026-10-20.
const fgvPayload = (lines) => ({
  previsiones: lines.map(([line, trains]) => ({
    line, line_id: line, linea_id_interna: 40 + line,
    trains: trains.map(([destino, seconds, vehicle]) => ({
      cabecera: false, destino, latitude: null, longitude: null, meters: null,
      seconds, vehicle, capacity: 397, line_id: line,
    })),
  })),
  aforo_bloqueado: { desde: null, hasta: null },
});

const respondWith = (body) => vi.fn(async () => ({
  ok: true, status: 200, json: async () => body,
}));

// About 6% of FGV requests never answer at all: no status, no error, until
// the caller gives up. This stands in for one.
const hang = (_url, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
});

const ANGEL_GUIMERA = { apiId: 17, name: 'Àngel Guimerà' };

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  capacitor.native = false;
  arrivalStore.memory.clear();
  arrivalStore.inFlightRequests.clear();
  arrivalStore.activeRequests = 0;
  arrivalStore.requestQueue = [];
  arrivalStore.lastRequestTimestamp = 0;
  arrivalStore.rateLimitedUntil = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('live Arrivals fetched from FGV', () => {
  it('turns every train in every Line group into one Arrival, soonest first', async () => {
    vi.stubGlobal('fetch', respondWith(fgvPayload([
      [5, [['Marítim', 137, 5113], ['Aeroport', 529, 5118]]],
      [1, [['Bétera', 216, 1143]]],
    ])));

    const arrivals = await arrivalStore.getStationArrivals(ANGEL_GUIMERA);

    expect(arrivals.map(a => [a.line, a.destination, a.vehicleId, a.initialSeconds])).toEqual([
      ['5', 'Marítim', '5113', 137],
      ['1', 'Bétera', '1143', 216],
      ['5', 'Aeroport', '5118', 529],
    ]);
    expect(arrivals.fetchError).toBeNull();
  });

  it('reports a Station with no trains predicted as empty, not broken', async () => {
    vi.stubGlobal('fetch', respondWith(fgvPayload([])));

    const arrivals = await arrivalStore.getStationArrivals(ANGEL_GUIMERA);

    expect(arrivals).toHaveLength(0);
    expect(arrivals.fetchError).toBeNull();
  });

  it('drops a train it cannot place and keeps the rest of the Station', async () => {
    vi.stubGlobal('fetch', respondWith(fgvPayload([
      [3, [['', 90, 3114], ['Aeroport', null, 3115], ['Rafelbunyol', 425, 3113]]],
    ])));

    const arrivals = await arrivalStore.getStationArrivals(ANGEL_GUIMERA);

    expect(arrivals.map(a => a.vehicleId)).toEqual(['3113']);
  });

  // The feed lags the physical train: 10 s on every tram Line, 15 s on metro.
  it.each([
    ['4', 10], ['6', 10], ['8', 10], ['10', 10],
    ['1', 15], ['2', 15], ['3', 15], ['5', 15], ['7', 15], ['9', 15],
  ])('pulls a Line %s Arrival %i s forward for Propagation Lag', async (line, lagSeconds) => {
    vi.stubGlobal('fetch', respondWith(fgvPayload([[Number(line), [['Somewhere', 300, 9999]]]])));

    const [arrival] = await arrivalStore.getStationArrivals(ANGEL_GUIMERA);

    expect(arrival.targetTimestamp).toBe(NOW + (300 - lagSeconds) * 1000);
  });

  it('gives up on a request that hangs and asks once more', async () => {
    const fetch = vi.fn(hang).mockImplementationOnce(hang)
      .mockImplementationOnce(respondWith(fgvPayload([[3, [['Aeroport', 529, 3114]]]])));
    vi.stubGlobal('fetch', fetch);

    const pending = arrivalStore.getStationArrivals(ANGEL_GUIMERA);
    await vi.advanceTimersByTimeAsync(10_000);
    const arrivals = await pending;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(arrivals.map(a => a.vehicleId)).toEqual(['3114']);
    expect(arrivals.fetchError).toBeNull();
  });

  it('keeps counting down from Arrival Memory when both attempts hang', async () => {
    // Heard from 90 s ago, so past the memory pause and due a refresh.
    arrivalStore.memory.set('17', {
      stationId: 17, stationName: 'Àngel Guimerà', fetchedAt: NOW - 90_000,
      arrivals: [{ line: '1', destination: 'Bétera', vehicleId: '1143', targetTimestamp: NOW + 120_000, isLive: true }],
    });
    const fetch = vi.fn(hang);
    vi.stubGlobal('fetch', fetch);

    const pending = arrivalStore.getStationArrivals(ANGEL_GUIMERA);
    await vi.advanceTimersByTimeAsync(10_000);
    const arrivals = await pending;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(arrivals.map(a => a.vehicleId)).toEqual(['1143']);
    expect(arrivals.isFromCache).toBe(true);
    expect(arrivals.fetchError).toBeTruthy();
  });

  it('reports the Station unavailable when both attempts hang and nothing is remembered', async () => {
    const fetch = vi.fn(hang);
    vi.stubGlobal('fetch', fetch);

    const pending = arrivalStore.getStationArrivals(ANGEL_GUIMERA);
    await vi.advanceTimersByTimeAsync(10_000);
    const arrivals = await pending;

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(arrivals).toHaveLength(0);
    expect(arrivals.fetchError).toBeTruthy();
  });

  it('takes an HTTP error as an answer and does not ask again', async () => {
    const fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => null }));
    vi.stubGlobal('fetch', fetch);

    const arrivals = await arrivalStore.getStationArrivals(ANGEL_GUIMERA);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(arrivals.fetchError).toBeTruthy();
  });

  it('goes through the same-origin proxy on the web', async () => {
    const fetch = respondWith(fgvPayload([]));
    vi.stubGlobal('fetch', fetch);

    await arrivalStore.getStationArrivals(ANGEL_GUIMERA);

    expect(fetch.mock.calls[0][0]).toBe('/api/metro/horarios-prevision-3/17');
  });

  it('calls FGV directly from the native app', async () => {
    capacitor.native = true;
    const fetch = respondWith(fgvPayload([]));
    vi.stubGlobal('fetch', fetch);

    await arrivalStore.getStationArrivals(ANGEL_GUIMERA);

    expect(fetch.mock.calls[0][0]).toBe(`${FGV_PREVISION}17`);
  });
});

describe('booting the live network', () => {
  it('fetches every Major Station straight away, Strategic Hubs first, each once', async () => {
    const fetch = respondWith(fgvPayload([]));
    vi.stubGlobal('fetch', fetch);

    const boot = arrivalStore.bootNetwork();
    await vi.runAllTimersAsync();
    await boot;

    const fetchedIds = fetch.mock.calls.map(([url]) => Number(url.split('/').pop()));
    const hubIds = STRATEGIC_HUBS.map(s => s.id);
    expect(fetchedIds.slice(0, hubIds.length)).toEqual(hubIds);
    expect([...fetchedIds].sort((a, b) => a - b))
      .toEqual(MAJOR_STATIONS.map(s => s.id).sort((a, b) => a - b));
  });
});

describe('booting twice back to back', () => {
  it('dispatches each Station at most once', async () => {
    const fetch = respondWith(fgvPayload([]));
    vi.stubGlobal('fetch', fetch);

    const first = arrivalStore.bootNetwork();
    const second = arrivalStore.bootNetwork();
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);

    const fetchedIds = fetch.mock.calls.map(([url]) => Number(url.split('/').pop()));
    expect(new Set(fetchedIds).size).toBe(fetchedIds.length);
  });
});

describe('the bounded parallel queue', () => {
  // A fetch that answers only when the test lets it, so requests pile up in flight.
  const gatedFetch = () => {
    const gate = { inFlight: 0, peak: 0, total: 0, pending: [] };
    gate.fetch = vi.fn(() => new Promise((resolve) => {
      gate.inFlight += 1; gate.total += 1;
      gate.peak = Math.max(gate.peak, gate.inFlight);
      gate.pending.push(() => {
        gate.inFlight -= 1;
        resolve({ ok: true, status: 200, json: async () => fgvPayload([]) });
      });
    }));
    gate.drain = async () => {
      while (gate.total < MAJOR_STATIONS.length || gate.pending.length) {
        await vi.advanceTimersByTimeAsync(0);
        gate.pending.splice(0).forEach(answer => answer());
      }
    };
    return gate;
  };

  it('never has more than 8 requests in flight during a sync on the web', async () => {
    const gate = gatedFetch();
    vi.stubGlobal('fetch', gate.fetch);

    const sync = arrivalStore.syncNetwork();
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.inFlight).toBe(8);
    await gate.drain();
    const result = await sync;

    expect(gate.peak).toBe(8);
    expect(result).toEqual({ fetched: MAJOR_STATIONS.length, skipped: 0 });
  });

  it('stays at 4 in flight on native, which calls FGV directly with no shared bound', async () => {
    capacitor.native = true;
    vi.resetModules();
    const { arrivalStore: nativeStore, MAJOR_STATIONS: stations } = await import('./arrivalStore');
    const gate = gatedFetch();
    vi.stubGlobal('fetch', gate.fetch);

    const sync = nativeStore.syncNetwork();
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.inFlight).toBe(4);
    while (gate.total < stations.length || gate.pending.length) {
      await vi.advanceTimersByTimeAsync(0);
      gate.pending.splice(0).forEach(answer => answer());
    }
    await sync;
    expect(gate.peak).toBe(4);
  });

  it('skips Stations inside their memory pause and survives a failing Station', async () => {
    const fresh = MAJOR_STATIONS[5];
    const broken = MAJOR_STATIONS[7];
    arrivalStore.memory.set(String(fresh.id), { arrivals: [], fetchedAt: NOW });
    const fetch = vi.fn(async (url) => {
      if (url.endsWith(`/${broken.id}`)) throw new Error('boom');
      return { ok: true, status: 200, json: async () => fgvPayload([]) };
    });
    vi.stubGlobal('fetch', fetch);

    const sync = arrivalStore.syncNetwork();
    await vi.runAllTimersAsync();
    const result = await sync;

    const fetchedIds = fetch.mock.calls.map(([url]) => Number(url.split('/').pop()));
    expect(fetchedIds).not.toContain(Number(fresh.id));
    expect(result.skipped).toBe(1);
    expect(result.fetched + result.skipped).toBe(MAJOR_STATIONS.length);
  });

  it('shares the same bound with single-Station requests', async () => {
    const gate = gatedFetch();
    vi.stubGlobal('fetch', gate.fetch);

    const taps = MAJOR_STATIONS.slice(0, 10).map(s =>
      arrivalStore.getStationArrivals({ apiId: s.id, name: s.name }));
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.inFlight).toBe(8);
    while (gate.pending.length || gate.total < 10) {
      await vi.advanceTimersByTimeAsync(0);
      gate.pending.splice(0).forEach(answer => answer());
    }
    await Promise.all(taps);
    expect(gate.peak).toBe(8);
  });
});

describe('the server cache age contract', () => {
  const withAge = (age) => vi.fn(async () => ({
    ok: true, status: 200,
    headers: new Headers(age === undefined ? {} : { 'X-Prevision-Age-Ms': age }),
    json: async () => fgvPayload([[3, [['Aeroport', 300, 3114]]]]),
  }));

  it('places Arrivals exactly as much earlier as the answer is old', async () => {
    vi.stubGlobal('fetch', withAge('5000'));
    const [aged] = await arrivalStore.getStationArrivals(ANGEL_GUIMERA);
    expect(aged.targetTimestamp).toBe(NOW + 285_000 - 5000);
    expect(arrivalStore.memory.get('17').fetchedAt).toBe(NOW - 5000);
  });

  it.each([[undefined], ['abc'], ['-3'], [''], ['1.5'], ['1e3']])('treats a missing or invalid age (%s) as fresh', async (age) => {
    vi.stubGlobal('fetch', withAge(age));
    const [fresh] = await arrivalStore.getStationArrivals(ANGEL_GUIMERA);
    expect(fresh.targetTimestamp).toBe(NOW + 285_000);
    expect(arrivalStore.memory.get('17').fetchedAt).toBe(NOW);
  });
});

describe('Netlify relay mode (old API data)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_METRO_SOURCE', 'relay');
  });

  it('sweeps the relay Strategic Hubs and Major Stations sequentially with 1s spacing', async () => {
    const dispatchTimes = [];
    const fetch = vi.fn(async () => {
      dispatchTimes.push(Date.now());
      return { ok: true, status: 200, json: async () => fgvPayload([]) };
    });
    vi.stubGlobal('fetch', fetch);

    const sync = arrivalStore.syncNetwork();
    await vi.runAllTimersAsync();
    const result = await sync;

    const hubIds = RELAY_STRATEGIC_HUBS.map(s => s.id);
    const expectedIds = [...new Set([...hubIds, ...RELAY_MAJOR_STATIONS.map(s => s.id)])];
    expect(result).toEqual({ fetched: expectedIds.length, skipped: 0 });
    const fetchedIds = fetch.mock.calls.map(([url]) => Number(url.split('/').pop()));
    expect(fetchedIds.slice(0, hubIds.length)).toEqual(hubIds);
    expect([...fetchedIds].sort((a, b) => a - b))
      .toEqual([...expectedIds].sort((a, b) => a - b));
    for (let i = 1; i < dispatchTimes.length; i++) {
      expect(dispatchTimes[i] - dispatchTimes[i - 1]).toBeGreaterThanOrEqual(1000);
    }
  });

  it('prefers server trainTimestamp when present so spaced relay sightings share one timeline', async () => {
    const serverEpochSec = Math.floor(NOW / 1000) + 240;
    vi.stubGlobal('fetch', respondWith({
      previsiones: [{
        line: '3',
        line_id: '3',
        trains: [{ destino: 'Aeroport', seconds: 200, vehicle: 3132, trainTimestamp: serverEpochSec }],
      }],
    }));

    const [arrival] = await arrivalStore.getStationArrivals(ANGEL_GUIMERA);
    expect(arrival.targetTimestamp).toBe(serverEpochSec * 1000 - 15_000);
  });
});

