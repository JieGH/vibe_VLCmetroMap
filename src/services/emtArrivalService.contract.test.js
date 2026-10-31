// Issue #90: extra contract tests for the EMT SAE service. Mocked fetch only,
// the live EMT endpoint is never called.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchStopArrivals,
  parseEmtArrivalXml,
  calculateDueSeconds,
  clearEmtCache,
  getEmtCachedArrivals,
  getEmtArrivalSnapshot,
  EMT_CACHE_TTL_MS,
  EMT_TIMEOUT_MS,
} from './emtArrivalService';
import { fetchFeederArrivals } from './feederArrivalFetch';

const busXml = (line, minutos, hora = '', dest = 'Dest') =>
  `<bus><linea>${line}</linea><destino><![CDATA[${dest}]]></destino><minutos>${minutos}</minutos><horaLlegada>${hora}</horaLlegada><error/><adaptado>0</adaptado></bus>`;
const wrap = (...buses) => `<?xml version='1.0'?><estimacion><solo_parada>${buses.join('')}</solo_parada></estimacion>`;
const ok = (xml) => ({ ok: true, text: async () => xml });
const at = (h, m) => {
  const d = new Date(2026, 5, 15, h, m, 0, 0);
  return d;
};

beforeEach(() => clearEmtCache());
afterEach(() => {
  clearEmtCache();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('countdown parsing variations (#90)', () => {
  it('parses "15 min." and a clock timestamp "16:25" through the XML parser', () => {
    const xml = wrap(busXml('9', '15 min.'), busXml('7', '', '16:25'), busXml('6', 'Pròxim'));
    const res = parseEmtArrivalXml(xml, at(16, 10));
    expect(res.map((a) => [a.line, a.dueSeconds, a.minutes])).toEqual([
      ['6', 30, 0],
      ['9', 900, 15],
      ['7', 900, 15],
    ]);
  });

  it('prefers minutos over horaLlegada when both are present', () => {
    const res = parseEmtArrivalXml(wrap(busXml('9', '3 min.', '16:25')), at(16, 10));
    expect(res[0].dueSeconds).toBe(180);
  });

  it('flags a bus with unparseable timing as due 0 rather than throwing', () => {
    const res = parseEmtArrivalXml(wrap(busXml('9', '???')), at(12, 0));
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ dueSeconds: 0, minutes: 0, isDue: false });
  });

  it('accepts "Próximo" and "Proxima" spellings', () => {
    expect(calculateDueSeconds('Próximo').isDue).toBe(true);
    expect(calculateDueSeconds('Proxima').dueSeconds).toBe(30);
  });

  it('isDue flips just above one minute', () => {
    expect(calculateDueSeconds('1 min.').isDue).toBe(true);
    expect(calculateDueSeconds('2 min.').isDue).toBe(false);
  });

  it('unwraps CDATA for line and destination names and trims whitespace', () => {
    const xml = wrap(
      '<bus><linea><![CDATA[ C1 ]]></linea><destino><![CDATA[  Pta.de la Mar  ]]></destino><minutos><![CDATA[4 min.]]></minutos></bus>'
    );
    expect(parseEmtArrivalXml(xml, at(10, 0))[0]).toMatchObject({ line: 'C1', destination: 'Pta.de la Mar', minutes: 4 });
  });

  it('wheelchair accepts adaptado 1, true and si', () => {
    const mk = (v) => `<bus><linea>1</linea><destino>x</destino><minutos>1 min.</minutos><adaptado>${v}</adaptado></bus>`;
    expect(parseEmtArrivalXml(wrap(mk('1')))[0].wheelchair).toBe(true);
    expect(parseEmtArrivalXml(wrap(mk('true')))[0].wheelchair).toBe(true);
    expect(parseEmtArrivalXml(wrap(mk('si')))[0].wheelchair).toBe(true);
    expect(parseEmtArrivalXml(wrap(mk('0')))[0].wheelchair).toBe(false);
  });
});

describe('midnight rollover (#90)', () => {
  it('rolls an early-morning time over to tomorrow when it is late evening', () => {
    expect(calculateDueSeconds('', '00:30', at(23, 45)).dueSeconds).toBe(45 * 60);
    expect(calculateDueSeconds('', '05:59', at(20, 0)).minutes).toBe(599);
  });

  it('does not roll over for a same-day later time', () => {
    expect(calculateDueSeconds('', '23:59', at(23, 50)).dueSeconds).toBe(9 * 60);
  });

  it('does not roll over in the morning: 05:40 at 05:50 is overdue, clamped to 0', () => {
    expect(calculateDueSeconds('', '05:40', at(5, 50))).toMatchObject({ dueSeconds: 0, isDue: true });
  });

  it('end to end via the parser: 00:05 seen at 23:58 is 7 minutes away', () => {
    const res = parseEmtArrivalXml(wrap(busXml('9', '', '00:05')), at(23, 58));
    expect(res[0].dueSeconds).toBe(7 * 60);
  });

  // Documents current behaviour: the rollover only fires from 20:00. An early-morning
  // clock time seen before 20:00 is treated as already passed today (clamped to due).
  it('characterization: 00:10 seen at 19:50 is clamped to due, not rolled over', () => {
    expect(calculateDueSeconds('', '00:10', at(19, 50))).toMatchObject({ dueSeconds: 0, isDue: true });
  });
});

describe('20 s TTL cache (#90)', () => {
  it('exposes the original Arrival timestamp without refreshing stale predictions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-31T17:00:00Z'));
    const fetchedAt = Date.now();
    const fetchFn = vi.fn(async () => ok(wrap(busXml('6', '3 min.'))));
    expect(getEmtArrivalSnapshot('2261')).toBeNull();
    await fetchStopArrivals('2261', { fetchFn });
    expect(getEmtArrivalSnapshot('P-2261')).toMatchObject({ fetchedAt, isFresh: true, arrivals: [{ dueSeconds: 180 }] });
    vi.advanceTimersByTime(EMT_CACHE_TTL_MS);
    expect(getEmtCachedArrivals('2261')).toBeNull();
    expect(getEmtArrivalSnapshot('2261')).toMatchObject({ fetchedAt, isFresh: false, arrivals: [{ dueSeconds: 180 }] });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
  it('serves from cache up to the TTL boundary and refetches exactly at it', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn(async () => ok(wrap(busXml('6', '3 min.'))));
    await fetchStopArrivals('2261', { fetchFn });
    vi.advanceTimersByTime(EMT_CACHE_TTL_MS - 1);
    await fetchStopArrivals('2261', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(getEmtCachedArrivals('2261')).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getEmtCachedArrivals('2261')).toBeNull();
    await fetchStopArrivals('2261', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('caches per stop, not globally', async () => {
    const fetchFn = vi.fn(async () => ok(wrap(busXml('6', '3 min.'))));
    await fetchStopArrivals('1', { fetchFn });
    await fetchStopArrivals('2', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('caches an empty (no buses) result so quiet stops are not re-polled within 20 s', async () => {
    const fetchFn = vi.fn(async () => ok(wrap()));
    expect(await fetchStopArrivals('3', { fetchFn })).toEqual([]);
    await fetchStopArrivals('3', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('getEmtCachedArrivals returns null for unknown or blank codes', () => {
    expect(getEmtCachedArrivals('nope')).toBeNull();
    expect(getEmtCachedArrivals('')).toBeNull();
    expect(getEmtCachedArrivals(null)).toBeNull();
  });

  it('a decoy or failed response does not refresh the cache timestamp', async () => {
    vi.useFakeTimers();
    const good = vi.fn(async () => ok(wrap(busXml('6', '3 min.'))));
    await fetchStopArrivals('4', { fetchFn: good });
    vi.advanceTimersByTime(EMT_CACHE_TTL_MS + 1);
    const decoy = vi.fn(async () => ok('<estimacion>Temporalment no disponible</estimacion>'));
    const res = await fetchStopArrivals('4', { fetchFn: decoy });
    expect(res).toHaveLength(1); // stale fallback
    expect(getEmtCachedArrivals('4')).toBeNull(); // still expired
    await fetchStopArrivals('4', { fetchFn: decoy });
    expect(decoy).toHaveBeenCalledTimes(2);
  });
});

describe('in-flight dedupe (#90)', () => {
  it('shares one request across callers and clears the slot afterwards', async () => {
    let release;
    const fetchFn = vi.fn(() => new Promise((r) => { release = r; }));
    const calls = [1, 2, 3, 4].map(() => fetchStopArrivals('P-77', { fetchFn, forceRefresh: true }));
    expect(fetchFn).toHaveBeenCalledTimes(1);
    release(ok(wrap(busXml('6', '3 min.'))));
    const results = await Promise.all(calls);
    results.forEach((r) => expect(r).toEqual(results[0]));
    // forceRefresh after completion starts a fresh request (slot was freed)
    fetchFn.mockImplementation(async () => ok(wrap()));
    await fetchStopArrivals('77', { fetchFn, forceRefresh: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('does not dedupe across different stops', async () => {
    const fetchFn = vi.fn(() => new Promise(() => {}));
    fetchStopArrivals('1', { fetchFn });
    fetchStopArrivals('2', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('a failed shared request resolves every waiter and frees the slot for retry', async () => {
    const failing = vi.fn(async () => { throw new Error('down'); });
    const [a, b] = await Promise.all([
      fetchStopArrivals('5', { fetchFn: failing }),
      fetchStopArrivals('5', { fetchFn: failing }),
    ]);
    expect(failing).toHaveBeenCalledTimes(1);
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    const good = vi.fn(async () => ok(wrap(busXml('6', '3 min.'))));
    expect(await fetchStopArrivals('5', { fetchFn: good })).toHaveLength(1);
  });
});

describe('request shape, errors and decoys (#90)', () => {
  it('requests the SAE endpoint with the stop code and Valencian language', async () => {
    const fetchFn = vi.fn(async () => ok(wrap()));
    await fetchStopArrivals('P-2261', { fetchFn });
    const url = fetchFn.mock.calls[0][0];
    expect(url).toBe(
      'https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=getSAE&parada=2261&adaptados=false&idioma=va'
    );
    expect(fetchFn.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('sends a browser User-Agent when running outside a browser (decoy gate, ADR-0011)', async () => {
    vi.stubGlobal('window', undefined);
    const fetchFn = vi.fn(async () => ok(wrap()));
    await fetchStopArrivals('10', { fetchFn });
    expect(fetchFn.mock.calls[0][1].headers['User-Agent']).toMatch(/^Mozilla\/5\.0/);
  });

  it('leaves User-Agent to the browser when window and navigator exist', async () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { userAgent: 'x' });
    const fetchFn = vi.fn(async () => ok(wrap()));
    await fetchStopArrivals('11', { fetchFn });
    expect(fetchFn.mock.calls[0][1].headers['User-Agent']).toBeUndefined();
  });

  it('returns [] on HTTP errors without throwing', async () => {
    for (const status of [403, 500]) {
      clearEmtCache();
      const fetchFn = vi.fn(async () => ({ ok: false, status, text: async () => 'err' }));
      await expect(fetchStopArrivals('12', { fetchFn })).resolves.toEqual([]);
    }
  });

  it('returns [] on a decoy response with no prior cache, and does not cache it', async () => {
    const decoy = '<estimacion><parada_linea><bus><error><![CDATA[<center>Temporalment no disponible des del pla.</center>]]></error></bus></parada_linea></estimacion>';
    const fetchFn = vi.fn(async () => ok(decoy));
    expect(await fetchStopArrivals('13', { fetchFn })).toEqual([]);
    expect(getEmtCachedArrivals('13')).toBeNull();
    await fetchStopArrivals('13', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns [] when the body is garbage or text() rejects', async () => {
    expect(await fetchStopArrivals('14', { fetchFn: async () => ok('<html>nope</html>') })).toEqual([]);
    clearEmtCache();
    const bad = async () => ({ ok: true, text: async () => { throw new Error('stream'); } });
    expect(await fetchStopArrivals('15', { fetchFn: bad })).toEqual([]);
  });

  it('aborts after the timeout and falls back to empty', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn((url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const p = fetchStopArrivals('16', { fetchFn });
    await vi.advanceTimersByTimeAsync(EMT_TIMEOUT_MS - 1);
    expect(fetchFn.mock.calls[0][1].signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual([]);
    expect(fetchFn.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('honours a custom timeoutMs', async () => {
    vi.useFakeTimers();
    const fetchFn = vi.fn((url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const p = fetchStopArrivals('17', { fetchFn, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100);
    expect(await p).toEqual([]);
  });
});

describe('on-demand only (ADR-0011, #90)', () => {
  it('importing the service and clearing the cache make no network request', () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    clearEmtCache();
    getEmtCachedArrivals('2261');
    parseEmtArrivalXml(wrap(busXml('6', '1 min.')));
    expect(spy).not.toHaveBeenCalled();
  });

  it('blank or null stop codes never reach the network', async () => {
    const fetchFn = vi.fn();
    for (const c of ['', '  ', 'P-', null, undefined]) {
      expect(await fetchStopArrivals(c, { fetchFn })).toEqual([]);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('fetchFeederArrivals with no stops makes no request, and fetches only the stops asked for', async () => {
    const fetchFn = vi.fn(async () => ok(wrap()));
    expect(await fetchFeederArrivals([], { fetchFn })).toEqual({});
    expect(fetchFn).not.toHaveBeenCalled();
    await fetchFeederArrivals(['21', '22'], { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('server-rendering the bus UI does not fetch (no background polling)', async () => {
    const React = (await import('react')).default;
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { default: Board } = await import('../components/BusStopBoard');
    const { default: Section } = await import('../components/ConnectingBusSection');
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    renderToStaticMarkup(React.createElement(Board, { stop: { stopCode: '1', stopName: 'S', lines: ['6'] }, onClose() {} }));
    renderToStaticMarkup(React.createElement(Section, { feeders: [{ stopCode: '2', stopName: 'S', walkMin: 1, lines: ['6'] }] }));
    expect(spy).not.toHaveBeenCalled();
  });
});
