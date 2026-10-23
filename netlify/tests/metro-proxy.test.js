import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import handler, { resetFgvBlock } from '../functions/metro-proxy.js';

const FGV_URL = /fgv\.es\/fgv\/app\/es\/api\/v1\/V\/horarios-prevision-3\/17$/;

const fgvBody = { previsiones: [{ line: 1, trains: [{ destino: 'Bétera', seconds: 60, vehicle: 1 }] }] };
// What the old relay returns: one flat row per train, not grouped by Line.
const relayBody = {
  previsiones: [
    { line: '1', destino: 'Bétera', seconds: 60, vehicle: 1143 },
    { line: '1', destino: "L'Alcúdia", seconds: 200, vehicle: 1162 },
    { line: '5', destino: 'Marítim', seconds: 90, vehicle: 5113 },
  ],
};

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const unreachable = () => Promise.reject(new TypeError('fetch failed'));
const request = () => new Request('https://site.test/api/metro/horarios-prevision-3/17');

beforeEach(() => resetFgvBlock());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('metro-proxy by default', () => {
  it('asks only the relay, never FGV, and regroups its rows into FGV shape', async () => {
    const fetch = vi.fn(async () => json(relayBody));
    vi.stubGlobal('fetch', fetch);

    const res = await handler(request());

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).not.toMatch(/fgv\.es/);
    expect((await res.json()).previsiones.map(g => g.line)).toEqual(['1', '5']);
  });

  it('treats an unknown METRO_SOURCE as the default', async () => {
    vi.stubEnv('METRO_SOURCE', 'nonsense');
    const fetch = vi.fn(async () => json(relayBody));
    vi.stubGlobal('fetch', fetch);

    await handler(request());

    expect(fetch.mock.calls[0][0]).not.toMatch(/fgv\.es/);
  });

  it('preserves trainTimestamp from the relay so sightings across spaced requests fuse', async () => {
    const fetch = vi.fn(async () => json({
      previsiones: [{ line: '3', destino: 'Aeroport', seconds: 199, vehicle: 3132, trainTimestamp: 1792785266 }],
    }));
    vi.stubGlobal('fetch', fetch);

    const res = await handler(request());
    const body = await res.json();

    expect(body.previsiones[0].trains[0]).toEqual({
      destino: 'Aeroport',
      seconds: 199,
      vehicle: 3132,
      trainTimestamp: 1792785266,
    });
  });
});

describe('metro-proxy with METRO_SOURCE=fgv', () => {
  it('returns 502 when FGV is unreachable, without asking the relay', async () => {
    vi.stubEnv('METRO_SOURCE', 'fgv');
    const fetch = vi.fn(unreachable);
    vi.stubGlobal('fetch', fetch);

    expect((await handler(request())).status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('metro-proxy with METRO_SOURCE=auto', () => {
  beforeEach(() => vi.stubEnv('METRO_SOURCE', 'auto'));

  it('relays FGV untouched when FGV answers', async () => {
    const fetch = vi.fn(async () => json(fgvBody));
    vi.stubGlobal('fetch', fetch);

    const res = await handler(request());

    expect(await res.json()).toEqual(fgvBody);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toMatch(FGV_URL);
  });

  it('falls back to the relay and regroups its rows into FGV shape when FGV is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (FGV_URL.test(url) ? unreachable() : json(relayBody))));

    const res = await handler(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.previsiones.map(g => g.line)).toEqual(['1', '5']);
    expect(body.previsiones[0].trains).toEqual([
      { destino: 'Bétera', seconds: 60, vehicle: 1143 },
      { destino: "L'Alcúdia", seconds: 200, vehicle: 1162 },
    ]);
  });

  it('stops trying FGV for a while after it fails, so later requests are not slowed', async () => {
    const fetch = vi.fn(async (url) => (FGV_URL.test(url) ? unreachable() : json(relayBody)));
    vi.stubGlobal('fetch', fetch);

    await handler(request());
    fetch.mockClear();
    await handler(request());

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).not.toMatch(/fgv\.es/);
  });

  it('passes the relay\'s refusal through, so the app backs off', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (FGV_URL.test(url) ? unreachable() : json({}, 429))));
    expect((await handler(request())).status).toBe(429);
  });

  it('does not fall back on an FGV HTTP error: that is an answer', async () => {
    const fetch = vi.fn(async () => json({}, 503));
    vi.stubGlobal('fetch', fetch);

    const res = await handler(request());

    expect(res.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
