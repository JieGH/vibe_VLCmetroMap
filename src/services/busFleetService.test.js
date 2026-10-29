import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fixture from '../data/fixtures/emt_line19_recording.json';
import {
  getLineFleet,
  normalizeFecha,
  clearBusFleetCache,
  isBusFleetInFlight,
  busFleetRefusal,
  BUS_FLEET_ALLOWED_LINES,
  BUS_FLEET_CACHE_TTL_MS,
  BUS_FLEET_TIMEOUT_MS,
  BUS_FLEET_BASE_URL,
  isPartialSnapshot,
} from './busFleetService';
import { getApiDiagnostics } from '../utils/diagnostics';

const polls = fixture.polls;

function geoJson(poll, line = '19') {
  return {
    type: 'FeatureCollection',
    features: poll.buses.map((b) => ({
      type: 'Feature',
      properties: { gid: b.gid, linea: line, trayecto: b.trayecto, fecha: b.fecha },
      geometry: { type: 'Point', coordinates: [b.lon, b.lat] },
    })),
  };
}

function response(poll, { status = 200, line } = {}) {
  const body = JSON.stringify(geoJson(poll, line));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ date: new Date(poll.serverDateMs).toUTCString() }),
    text: async () => body,
    json: async () => JSON.parse(body),
  };
}

const fetchOf = (poll, opts) => vi.fn(async () => response(poll, opts));

describe('normalizeFecha (ADR-0014)', () => {
  const now = polls[0].serverDateMs;

  it('subtracts the Madrid offset when fecha is in the future (+1 h, CET)', () => {
    const fecha = now + 3600000 - 20000;
    expect(normalizeFecha(fecha, now)).toBe(now - 20000);
  });

  it('keeps fecha when it is already true UTC (offset 0)', () => {
    expect(normalizeFecha(now - 20000, now)).toBe(now - 20000);
  });

  it('uses +2 h in summer time (CEST)', () => {
    const summerNow = Date.UTC(2027, 5, 15, 10, 0, 0);
    expect(normalizeFecha(summerNow + 7200000 - 15000, summerNow)).toBe(summerNow - 15000);
  });

  it('clamps to nowMs', () => {
    expect(normalizeFecha(now + 1000, now)).toBeLessThanOrEqual(now);
  });

  it('uses the offset in force at the fix, around the autumn DST change', () => {
    // 2026-10-25 01:00 UTC is when CEST ends. Fix at 00:59:30 UTC (still CEST, wall 02:59:30)
    // arrives in a poll at 01:00:10 UTC (now CET).
    const nowMs = Date.UTC(2026, 9, 25, 1, 0, 10);
    const trueFix = Date.UTC(2026, 9, 25, 0, 59, 30);
    const fecha = trueFix + 7200000;
    expect(normalizeFecha(fecha, nowMs)).toBe(trueFix);
  });

  it('resolves every row of the recording to a 0..120 s age and flips whole responses', () => {
    const flips = [16, 25, 27, 33, 34, 36];
    polls.forEach((p, i) => {
      if (!p.buses.length) return;
      const ages = p.buses.map((b) => (p.serverDateMs - normalizeFecha(b.fecha, p.serverDateMs)) / 1000);
      ages.forEach((a) => {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(70);
      });
      const raw = p.buses.map((b) => b.fecha - p.serverDateMs);
      const offsetZero = raw.every((r) => r < 0);
      expect(offsetZero).toBe(flips.includes(i));
    });
  });
});

describe('isPartialSnapshot', () => {
  it('flags empty and fewer-than-half responses, never the first snapshot', () => {
    expect(isPartialSnapshot(0, 6)).toBe(true);
    expect(isPartialSnapshot(1, 6)).toBe(true);
    expect(isPartialSnapshot(2, 6)).toBe(true);
    expect(isPartialSnapshot(3, 6)).toBe(false);
    expect(isPartialSnapshot(6, 6)).toBe(false);
    expect(isPartialSnapshot(0, 0)).toBe(false);
  });
});

describe('getLineFleet', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(polls[0].serverDateMs);
    clearBusFleetCache();
  });
  afterEach(() => {
    vi.useRealTimers();
    clearBusFleetCache();
  });

  it('exports the specification constants', () => {
    expect(BUS_FLEET_CACHE_TTL_MS).toBe(30000);
    expect(BUS_FLEET_TIMEOUT_MS).toBe(4500);
    expect(BUS_FLEET_ALLOWED_LINES['19']).toBeTruthy();
    expect(BUS_FLEET_BASE_URL).toContain('Seguimiento_EMT/MapServer/384/query');
  });

  it('returns plain bus records with a normalised fix time and age', async () => {
    const fetchFn = fetchOf(polls[0]);
    const fleet = await getLineFleet('19', { fetchFn });
    expect(fleet).toHaveLength(6);
    const first = fleet[0];
    expect(Object.keys(first).sort()).toEqual(['ageSeconds', 'fixTimeMs', 'gid', 'linea', 'lonLat', 'trayecto']);
    expect(first.linea).toBe('19');
    expect(first.gid).toBe(1683652350);
    expect(first.lonLat).toEqual([-0.344381, 39.458534]);
    expect(first.fixTimeMs).toBe(normalizeFecha(1793312115000, polls[0].serverDateMs));
    expect(first.ageSeconds).toBe(Math.round((polls[0].serverDateMs - first.fixTimeMs) / 1000));
    expect(first.ageSeconds).toBeGreaterThanOrEqual(0);
    expect(first.ageSeconds).toBeLessThan(70);
  });

  it('queries layer 384 filtered by the line, with a browser User-Agent outside a browser', async () => {
    const fetchFn = fetchOf(polls[0]);
    await getLineFleet('19', { fetchFn });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain(BUS_FLEET_BASE_URL);
    expect(decodeURIComponent(url)).toContain("where=linea='19'");
    expect(url).toContain('f=geoJSON');
    expect(init.headers['User-Agent']).toMatch(/Mozilla\/5\.0/);
  });

  it('normalises an offset-0 response the same as a +1 h one', async () => {
    const zero = await getLineFleet('19', { fetchFn: fetchOf(polls[16]) });
    zero.forEach((b) => {
      expect(b.ageSeconds).toBeGreaterThanOrEqual(0);
      expect(b.ageSeconds).toBeLessThan(70);
    });
  });

  it('rejects lines outside the allowlist without a request', async () => {
    const fetchFn = fetchOf(polls[0]);
    expect(await getLineFleet('99', { fetchFn })).toEqual([]);
    expect(await getLineFleet("19' OR 1=1", { fetchFn })).toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('serves from cache within the 30 s TTL, then refetches', async () => {
    const fetchFn = fetchOf(polls[0]);
    await getLineFleet('19', { fetchFn });
    vi.advanceTimersByTime(BUS_FLEET_CACHE_TTL_MS - 1);
    await getLineFleet('19', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await getLineFleet('19', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('keeps counting ageSeconds while serving from cache', async () => {
    const fetchFn = fetchOf(polls[0]);
    const a = await getLineFleet('19', { fetchFn });
    vi.advanceTimersByTime(10000);
    const b = await getLineFleet('19', { fetchFn });
    expect(b[0].ageSeconds).toBe(a[0].ageSeconds + 10);
  });

  it('force bypasses the cache', async () => {
    const fetchFn = fetchOf(polls[0]);
    await getLineFleet('19', { fetchFn });
    await getLineFleet('19', { fetchFn, force: true });
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('dedups concurrent requests', async () => {
    const fetchFn = fetchOf(polls[0]);
    const p1 = getLineFleet('19', { fetchFn });
    expect(isBusFleetInFlight('19')).toBe(true);
    const p2 = getLineFleet('19', { fetchFn });
    const [a, b] = await Promise.all([p1, p2]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(isBusFleetInFlight('19')).toBe(false);
  });

  it('ignores a partial response (poll 2) and keeps the last good snapshot', async () => {
    const good = await getLineFleet('19', { fetchFn: fetchOf(polls[1]) });
    expect(good).toHaveLength(6);
    vi.advanceTimersByTime(30001);
    const after = await getLineFleet('19', { fetchFn: fetchOf(polls[2]) });
    expect(after).toHaveLength(6);
    expect(after.map((b) => b.gid)).toEqual(good.map((b) => b.gid));
  });

  it('ignores an empty response (poll 41) and keeps the last good snapshot', async () => {
    const good = await getLineFleet('19', { fetchFn: fetchOf(polls[40]) });
    expect(good.length).toBeGreaterThan(0);
    vi.advanceTimersByTime(30001);
    const fetchFn = fetchOf(polls[41]);
    const after = await getLineFleet('19', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(after.map((b) => b.gid)).toEqual(good.map((b) => b.gid));
    // the ignored response still paces the next request: no refetch inside the TTL
    await getLineFleet('19', { fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('returns [] for an empty first response, and then accepts a real snapshot', async () => {
    expect(await getLineFleet('19', { fetchFn: fetchOf(polls[41]) })).toEqual([]);
    const next = await getLineFleet('19', { fetchFn: fetchOf(polls[0]), force: true });
    expect(next).toHaveLength(6);
  });

  it('accepts a new good snapshot over the old one', async () => {
    await getLineFleet('19', { fetchFn: fetchOf(polls[0]) });
    vi.advanceTimersByTime(30001);
    const next = await getLineFleet('19', { fetchFn: fetchOf(polls[3]) });
    expect(next.map((b) => b.gid)).toEqual(polls[3].buses.map((b) => b.gid));
  });

  it('ignores features of other lines', async () => {
    const fleet = await getLineFleet('19', { fetchFn: fetchOf(polls[0], { line: '4' }) });
    expect(fleet).toEqual([]);
  });

  it('drops malformed features', async () => {
    const body = {
      features: [
        { properties: { gid: 1, linea: '19', trayecto: 'A - B', fecha: polls[0].serverDateMs - 5000 }, geometry: { coordinates: [-0.37, 39.47] } },
        { properties: { gid: 2, linea: '19', trayecto: 'A - B', fecha: null }, geometry: { coordinates: [-0.37, 39.47] } },
        { properties: { gid: 3, linea: '19', trayecto: 'A - B', fecha: 1 }, geometry: null },
      ],
    };
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(body) }));
    const fleet = await getLineFleet('19', { fetchFn });
    expect(fleet.map((b) => b.gid)).toEqual([1]);
  });

  it('falls back to Date.now() when the Date header is missing', async () => {
    const body = { features: [{ properties: { gid: 1, linea: '19', trayecto: 'A - B', fecha: Date.now() - 12000 }, geometry: { coordinates: [-0.37, 39.47] } }] };
    const fetchFn = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => JSON.stringify(body) }));
    const fleet = await getLineFleet('19', { fetchFn });
    expect(fleet[0].ageSeconds).toBe(12);
  });

  describe('failures', () => {
    it('returns the last good snapshot on a network error and records the failure', async () => {
      const good = await getLineFleet('19', { fetchFn: fetchOf(polls[0]) });
      const fetchFn = vi.fn(async () => { throw new Error('boom'); });
      const after = await getLineFleet('19', { fetchFn, force: true });
      expect(after.map((b) => b.gid)).toEqual(good.map((b) => b.gid));
      expect(JSON.stringify(getApiDiagnostics())).toContain('unreachable');
    });

    it('returns [] on failure with nothing cached', async () => {
      const fetchFn = vi.fn(async () => { throw new Error('boom'); });
      expect(await getLineFleet('19', { fetchFn })).toEqual([]);
    });

    it('aborts after the timeout', async () => {
      const fetchFn = vi.fn((url, { signal }) => new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      }));
      const p = getLineFleet('19', { fetchFn });
      await vi.advanceTimersByTimeAsync(BUS_FLEET_TIMEOUT_MS + 1);
      expect(await p).toEqual([]);
    });

    it('treats a decoy or HTML answer as a refusal, and trips the tracker on repeats', async () => {
      const html = vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), text: async () => '<!doctype html><html></html>' }));
      expect(await getLineFleet('19', { fetchFn: html })).toEqual([]);
      expect(busFleetRefusal.isRefused()).toBe(false);
      vi.advanceTimersByTime(1000);
      await getLineFleet('19', { fetchFn: html, force: true });
      expect(busFleetRefusal.isRefused()).toBe(true);
    });

    it('treats 403 as blocked and backs off while refused', async () => {
      const blocked = vi.fn(async () => ({ ok: false, status: 403, headers: new Headers(), text: async () => 'no' }));
      await getLineFleet('19', { fetchFn: blocked, force: true });
      vi.advanceTimersByTime(1000);
      await getLineFleet('19', { fetchFn: blocked, force: true });
      expect(busFleetRefusal.isRefused()).toBe(true);
      blocked.mockClear();
      vi.advanceTimersByTime(10000);
      await getLineFleet('19', { fetchFn: blocked });
      expect(blocked).not.toHaveBeenCalled();
    });

    it('a success clears the refusal', async () => {
      const blocked = vi.fn(async () => ({ ok: false, status: 403, headers: new Headers(), text: async () => 'no' }));
      await getLineFleet('19', { fetchFn: blocked, force: true });
      vi.advanceTimersByTime(1000);
      await getLineFleet('19', { fetchFn: blocked, force: true });
      await getLineFleet('19', { fetchFn: fetchOf(polls[0]), force: true });
      expect(busFleetRefusal.isRefused()).toBe(false);
    });
  });
});
