import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';

const BIG_JS = `console.log(${JSON.stringify('metro '.repeat(2000))});`;
const PMTILES = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
const fgvBody = JSON.stringify({ previsiones: [{ line: 1, trains: [{ destino: 'Bétera', seconds: 60, vehicle: 1 }] }] });

let dir, server, base, upstream;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'serve-'));
  fs.mkdirSync(path.join(dir, 'dist/assets'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'dist/basemap'));
  fs.writeFileSync(path.join(dir, 'secret.txt'), 'outside dist');
  fs.writeFileSync(path.join(dir, 'dist/index.html'), '<!doctype html><title>app</title>' + '<p>x</p>'.repeat(200));
  fs.writeFileSync(path.join(dir, 'dist/assets/index-AbCd1234.js'), BIG_JS);
  fs.writeFileSync(path.join(dir, 'dist/line4.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [], pad: 'z'.repeat(500) }));
  fs.writeFileSync(path.join(dir, 'dist/favicon.png'), 'png');
  fs.writeFileSync(path.join(dir, 'dist/basemap/valencia.pmtiles'), PMTILES);

  upstream = vi.fn(async () => new Response(fgvBody, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-cache, private, max-age=31536000' } }));
  server = createApp({ root: path.join(dir, 'dist'), fetch: (...a) => upstream(...a) }).server();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

// fetch() would decode content-encoding for us; keep bodies raw.
const get = (p, headers = {}, method = 'GET') => fetch(base + p, { method, headers: { 'accept-encoding': 'identity', ...headers } });

describe('compression', () => {
  it('serves brotli when accepted, and the body decodes to the original', async () => {
    const res = await get('/assets/index-AbCd1234.js', { 'accept-encoding': 'br, gzip' });
    expect(res.headers.get('content-encoding')).toBe('br');
    expect(res.headers.get('vary')).toBe('Accept-Encoding');
    expect(res.headers.get('content-type')).toMatch(/^text\/javascript/);
    const raw = Buffer.from(await res.arrayBuffer());
    // undici already decoded it; the transferred length proves it was compressed
    expect(raw.toString()).toBe(BIG_JS);
    expect(Number(res.headers.get('content-length'))).toBeLessThan(BIG_JS.length);
  });

  it('falls back to gzip, then to identity', async () => {
    expect((await get('/assets/index-AbCd1234.js', { 'accept-encoding': 'gzip' })).headers.get('content-encoding')).toBe('gzip');
    const plain = await get('/assets/index-AbCd1234.js');
    expect(plain.headers.get('content-encoding')).toBeNull();
    expect(plain.headers.get('vary')).toBe('Accept-Encoding');
    expect(await plain.text()).toBe(BIG_JS);
  });

  it('compresses geojson too, and never an image', async () => {
    expect((await get('/line4.geojson', { 'accept-encoding': 'br' })).headers.get('content-encoding')).toBe('br');
    expect((await get('/favicon.png', { 'accept-encoding': 'br, gzip' })).headers.get('content-encoding')).toBeNull();
  });

  it('gives each encoding its own strong ETag', async () => {
    const [br, gz, id] = await Promise.all(['br', 'gzip', 'identity'].map(e => get('/index.html', { 'accept-encoding': e })));
    const tags = [br, gz, id].map(r => r.headers.get('etag'));
    expect(new Set(tags).size).toBe(3);
    expect(tags.every(t => /^"[^"]+"$/.test(t))).toBe(true);
  });
});

describe('caching', () => {
  it('marks hashed assets immutable', async () => {
    expect((await get('/assets/index-AbCd1234.js')).headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('revalidates index.html and unhashed files, answering If-None-Match with 304', async () => {
    for (const p of ['/', '/index.html', '/line4.geojson']) {
      const first = await get(p);
      expect(first.headers.get('cache-control')).toBe('no-cache');
      const etag = first.headers.get('etag');
      const again = await get(p, { 'if-none-match': etag });
      expect(again.status).toBe(304);
      expect(await again.text()).toBe('');
    }
    expect((await get('/index.html', { 'if-none-match': '"stale"' })).status).toBe(200);
  });

  it('304s on the encoded variant tag', async () => {
    const etag = (await get('/index.html', { 'accept-encoding': 'br' })).headers.get('etag');
    expect((await get('/index.html', { 'accept-encoding': 'br', 'if-none-match': etag })).status).toBe(304);
  });
});

describe('PMTiles archive', () => {
  const url = '/basemap/valencia.pmtiles';

  it('answers a range with a plain 206 and the right Content-Range', async () => {
    const res = await get(url, { range: 'bytes=10-19', 'accept-encoding': 'br, gzip' });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 10-19/1000');
    expect(res.headers.get('content-length')).toBe('10');
    expect(res.headers.get('content-encoding')).toBeNull();
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('content-type')).toBe('application/vnd.pmtiles');
    expect(res.headers.get('etag')).toBeTruthy();
    expect(Buffer.from(await res.arrayBuffer()).equals(PMTILES.subarray(10, 20))).toBe(true);
  });

  it('supports open-ended and suffix ranges and clamps the end', async () => {
    expect((await get(url, { range: 'bytes=990-' })).headers.get('content-range')).toBe('bytes 990-999/1000');
    expect((await get(url, { range: 'bytes=-5' })).headers.get('content-range')).toBe('bytes 995-999/1000');
    expect((await get(url, { range: 'bytes=900-5000' })).headers.get('content-range')).toBe('bytes 900-999/1000');
  });

  it('answers an unsatisfiable range with 416', async () => {
    const res = await get(url, { range: 'bytes=1000-' });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */1000');
  });

  it('serves the whole archive uncompressed without a Range header', async () => {
    const res = await get(url, { 'accept-encoding': 'br, gzip' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-encoding')).toBeNull();
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(Buffer.from(await res.arrayBuffer()).equals(PMTILES)).toBe(true);
  });
});

describe('paths', () => {
  it('refuses path traversal, plain and encoded', async () => {
    for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/assets/..%2f..%2fsecret.txt', '/%00']) {
      const res = await get(p, { accept: 'text/html' });
      expect([400, 404]).toContain(res.status);
      expect(await res.text()).not.toContain('outside dist');
    }
    // fetch() normalises "/../", so send the raw request line too
    const raw = await new Promise(resolve => {
      import('node:net').then(({ default: net }) => {
        const s = net.connect(server.address().port, '127.0.0.1', () => s.write('GET /../secret.txt HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
        let out = '';
        s.on('data', d => (out += d)).on('close', () => resolve(out));
      });
    });
    expect(raw).toMatch(/^HTTP\/1.1 (400|404)/);
    expect(raw).not.toContain('outside dist');
  });

  it('falls back to index.html for navigations only', async () => {
    const nav = await get('/some/station/17', { accept: 'text/html,application/xhtml+xml' });
    expect(nav.status).toBe(200);
    expect(await nav.text()).toContain('<title>app</title>');
    expect((await get('/some/station/17', { accept: '*/*' })).status).toBe(404);
    expect((await get('/assets/missing-12345678.js', { accept: 'text/html' })).status).toBe(404);
    expect((await get('/missing.png')).status).toBe(404);
  });

  it('answers HEAD without a body', async () => {
    const res = await get('/index.html', {}, 'HEAD');
    expect(res.status).toBe(200);
    expect(Number(res.headers.get('content-length'))).toBeGreaterThan(0);
    expect(await res.text()).toBe('');
  });
});

describe('FGV prevision proxy', () => {
  // The server caches per Station, so every test uses Stations of its own.
  // Only setTimeout and Date are faked: sockets and promises stay real.
  let fgv;
  const api = (id) => get(`/api/metro/horarios-prevision-3/${id}`);
  const ok = (body = fgvBody) => new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
  // An upstream attempt that stays open until aborted; `aborted` records which ones were.
  const hangs = () => {
    const h = { aborted: 0 };
    h.fn = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => { h.aborted++; reject(new DOMException('aborted', 'AbortError')); }));
    return h;
  };
  // The HTTP request reaches the handler over a real socket, so wait for the upstream call itself.
  const reached = async (calls) => { for (let i = 0; i < 500 && fgv.mock.calls.length < calls; i++) await new Promise(r => setImmediate(r)); };
  const tick = (ms) => vi.advanceTimersByTimeAsync(ms);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: 1_000_000 });
    upstream.mockReset().mockImplementation(async () => ok());
    fgv = upstream;
  });
  afterEach(() => vi.useRealTimers());

  it('forwards a numeric Station id to FGV and passes the answer through', async () => {
    const res = await api(1000);
    expect(fgv).toHaveBeenCalledTimes(1);
    expect(fgv.mock.calls[0][0]).toBe('https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3/1000');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-prevision-age-ms')).toBe('0');
    expect(await res.text()).toBe(fgvBody);
  });

  it('shares one upstream request between concurrent requests for a Station', async () => {
    let release;
    fgv.mockImplementation(() => new Promise(r => { release = () => r(ok()); }));
    const both = Promise.all([api(1100), api(1100)]);
    await reached(1);
    await tick(50);
    release();
    const [a, b] = await both;
    expect(fgv).toHaveBeenCalledTimes(1);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await b.text()).toBe(fgvBody);
  });

  it('serves a cached answer for 10 s with its age, then asks FGV again', async () => {
    await (await api(1200)).text();
    await tick(4000);
    const cached = await api(1200);
    expect(fgv).toHaveBeenCalledTimes(1);
    expect(cached.headers.get('x-prevision-age-ms')).toBe('4000');
    expect(await cached.text()).toBe(fgvBody);

    await tick(6000);
    const fresh = await api(1200);
    expect(fgv).toHaveBeenCalledTimes(2);
    expect(fresh.headers.get('x-prevision-age-ms')).toBe('0');
    await fresh.text();
  });

  it('answers 502 when building the reply throws', async () => {
    const broken = createApp({ root: path.join(dir, 'dist'), fetch: async () => ({ status: 200, headers: { get: () => null }, text: async () => 42 }) }).server();
    await new Promise(r => broken.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${broken.address().port}/api/metro/horarios-prevision-3/1360`);
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: 'proxy failed' });
    } finally {
      broken.close();
    }
  });

  it('caches each Station separately', async () => {
    await (await api(1300)).text();
    await (await api(1301)).text();
    expect(fgv).toHaveBeenCalledTimes(2);
  });

  it('sends one duplicate after 1200 ms, takes the first answer and aborts the other', async () => {
    const slow = hangs();
    fgv.mockImplementationOnce(slow.fn).mockImplementationOnce(async () => ok());
    const pending = api(1400);
    await reached(1);
    await tick(1199);
    expect(fgv).toHaveBeenCalledTimes(1);
    await tick(1);
    const res = await pending;
    expect(fgv).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(fgvBody);
    expect(slow.aborted).toBe(1);
  });

  it('lets the first attempt win when it answers after the duplicate went out', async () => {
    let first;
    fgv.mockImplementationOnce(() => new Promise(r => { first = () => r(ok('{"who":"first"}')); })).mockImplementationOnce(hangs().fn);
    const pending = api(1500);
    await reached(1);
    await tick(1200);
    first();
    expect(await (await pending).text()).toBe('{"who":"first"}');
  });

  it('answers 504 once 3500 ms pass with no answer, and aborts both attempts', async () => {
    const h = hangs();
    fgv.mockImplementation(h.fn);
    const pending = api(1600);
    await reached(1);
    await tick(3499);
    await tick(1);
    const res = await pending;
    expect(res.status).toBe(504);
    expect(fgv).toHaveBeenCalledTimes(2);
    expect(h.aborted).toBe(2);
    expect(await res.json()).toEqual({ error: 'FGV did not answer in time' });
  });

  it('does not cache a 504', async () => {
    fgv.mockImplementationOnce(hangs().fn).mockImplementationOnce(hangs().fn);
    const pending = api(1700);
    await reached(1);
    await tick(3500);
    expect((await pending).status).toBe(504);
    const next = await api(1700);
    expect(next.status).toBe(200);
    await next.text();
  });

  it('passes an FGV error status through, without retrying or caching it', async () => {
    fgv.mockResolvedValueOnce(new Response('{"error":"nope"}', { status: 429, headers: { 'content-type': 'application/json' } }));
    const res = await api(1800);
    expect(res.status).toBe(429);
    expect(res.headers.get('x-prevision-age-ms')).toBeNull();
    expect(await res.text()).toBe('{"error":"nope"}');
    expect(fgv).toHaveBeenCalledTimes(1);
    const next = await api(1800);
    expect(next.status).toBe(200);
    await next.text();
    expect(fgv).toHaveBeenCalledTimes(2);
  });

  it('retries a network failure once at once, and answers 502 when both fail', async () => {
    fgv.mockRejectedValue(new TypeError('fetch failed'));
    const res = await api(1900);
    expect(res.status).toBe(502);
    expect(fgv).toHaveBeenCalledTimes(2);
  });

  it('keeps at most 8 requests to FGV in flight and starts a waiting one as a slot frees', async () => {
    const releases = [];
    let open = 0, peak = 0;
    fgv.mockImplementation(() => new Promise(r => {
      open++; peak = Math.max(peak, open);
      releases.push(() => { open--; r(ok()); });
    }));
    const all = Array.from({ length: 10 }, (_, i) => api(2000 + i));
    await reached(8);
    await tick(500);
    expect(fgv).toHaveBeenCalledTimes(8);
    releases.shift()();
    await tick(10);
    expect(fgv).toHaveBeenCalledTimes(9);
    while (releases.length || fgv.mock.calls.length < 10) { releases.shift()?.(); await tick(10); }
    expect((await Promise.all(all)).map(r => r.status)).toEqual(Array(10).fill(200));
    expect(peak).toBe(8);
  });

  it('returns 404 for every other /api path and never calls FGV', async () => {
    for (const p of ['/api/metro/horarios-prevision-3/abc', '/api/metro/horarios-prevision-3/17/extra', '/api/metro/horarios-prevision-3/', '/api/metro/other/2100', '/api/metro/horarios-prevision-3/17%2f..%2fx', '/api/other', '/api/']) {
      const res = await get(p);
      expect([400, 404], p).toContain(res.status);
    }
    expect(fgv).not.toHaveBeenCalled();
  });

  it('only allows GET on the route', async () => {
    const res = await get('/api/metro/horarios-prevision-3/2200', {}, 'POST');
    expect(res.status).toBe(405);
  });
});

describe('feedback API', () => {
  it('accepts POST /api/feedback with a valid message and returns 200', async () => {
    const res = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Great app!', email: 'user@example.com' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('rejects POST /api/feedback when message is missing or empty', async () => {
    const res = await fetch(`${base}/api/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('message is required');
  });

  it('rejects non-POST methods with 405', async () => {
    const res = await fetch(`${base}/api/feedback`, { method: 'GET' });
    expect(res.status).toBe(405);
  });
});
