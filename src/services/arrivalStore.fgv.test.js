import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// isNativePlatform decides which URL a fetch goes to, so each test sets it.
const capacitor = vi.hoisted(() => ({ native: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => capacitor.native },
}));

import { arrivalStore } from './arrivalStore';

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

const ANGEL_GUIMERA = { apiId: 17, name: 'Àngel Guimerà' };

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  capacitor.native = false;
  arrivalStore.memory.clear();
  arrivalStore.inFlightRequests.clear();
  arrivalStore.lastRequestTimestamp = 0;
  arrivalStore.rateLimitedUntil = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
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
