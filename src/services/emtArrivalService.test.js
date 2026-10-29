import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchStopArrivals,
  parseEmtArrivalXml,
  calculateDueSeconds,
  normalizeStopCode,
  cleanCdata,
  clearEmtCache,
  getEmtCachedArrivals,
  EMT_CACHE_TTL_MS,
  EMT_TIMEOUT_MS,
  EMT_SAE_BASE_URL,
  emtRefusal,
} from './emtArrivalService';
import { getApiDiagnostics } from '../utils/diagnostics';

describe('EMT Arrival Service (ADR-0011 / Issue #87)', () => {
  beforeEach(() => {
    clearEmtCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearEmtCache();
  });

  describe('constants', () => {
    it('exports expected constants matching specification', () => {
      expect(EMT_CACHE_TTL_MS).toBe(20000);
      expect(EMT_TIMEOUT_MS).toBe(4500);
      expect(EMT_SAE_BASE_URL).toBe('https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php');
    });
  });

  describe('normalizeStopCode', () => {
    it('strips P- prefix and trims whitespace', () => {
      expect(normalizeStopCode('P-2261')).toBe('2261');
      expect(normalizeStopCode('p-1002 ')).toBe('1002');
      expect(normalizeStopCode('2277')).toBe('2277');
      expect(normalizeStopCode(2277)).toBe('2277');
    });

    it('returns empty string for null, undefined or empty input', () => {
      expect(normalizeStopCode(null)).toBe('');
      expect(normalizeStopCode(undefined)).toBe('');
      expect(normalizeStopCode('')).toBe('');
      expect(normalizeStopCode('   ')).toBe('');
    });
  });

  describe('cleanCdata', () => {
    it('strips CDATA wrappers and trims text', () => {
      expect(cleanCdata('<![CDATA[Pta.de la Mar]]>')).toBe('Pta.de la Mar');
      expect(cleanCdata('<![CDATA[  Est.del Nord  ]]>')).toBe('Est.del Nord');
      expect(cleanCdata('Torrefiel')).toBe('Torrefiel');
      expect(cleanCdata('')).toBe('');
      expect(cleanCdata(null)).toBe('');
    });
  });

  describe('calculateDueSeconds', () => {
    it('handles Pròxim / Próximo as 20s isDue', () => {
      const p1 = calculateDueSeconds('Pròxim');
      expect(p1).toEqual({ dueSeconds: 20, minutes: 0, isDue: true });

      const p2 = calculateDueSeconds('Próximo');
      expect(p2).toEqual({ dueSeconds: 20, minutes: 0, isDue: true });

      const p3 = calculateDueSeconds('proxim');
      expect(p3).toEqual({ dueSeconds: 20, minutes: 0, isDue: true });
    });

    it('handles X min. / X min formats', () => {
      const res5 = calculateDueSeconds('5 min.');
      expect(res5).toEqual({ dueSeconds: 300, minutes: 5, isDue: false });

      const res1 = calculateDueSeconds('1 min');
      expect(res1).toEqual({ dueSeconds: 60, minutes: 1, isDue: true });

      const res0 = calculateDueSeconds('0 min.');
      expect(res0).toEqual({ dueSeconds: 0, minutes: 0, isDue: true });
    });

    it('handles plain integer minutes', () => {
      const res4 = calculateDueSeconds('4');
      expect(res4).toEqual({ dueSeconds: 240, minutes: 4, isDue: false });
    });

    it('handles clock time HH:MM relative to reference date', () => {
      const baseDate = new Date();
      baseDate.setHours(14, 0, 0, 0);

      const res = calculateDueSeconds('', '14:15', baseDate);
      expect(res.dueSeconds).toBe(900);
      expect(res.minutes).toBe(15);
      expect(res.isDue).toBe(false);
    });

    it('handles midnight rollover for late-night clock times', () => {
      const baseDate = new Date();
      baseDate.setHours(23, 50, 0, 0);

      const res = calculateDueSeconds('', '00:10', baseDate);
      // 20 minutes delta from 23:50 to 00:10
      expect(res.dueSeconds).toBe(1200);
      expect(res.minutes).toBe(20);
      expect(res.isDue).toBe(false);
    });

    it('clamps overdue or delayed arrivals to 0 seconds and isDue true instead of rolling over to tomorrow', () => {
      const baseDate = new Date();
      baseDate.setHours(14, 3, 0, 0);

      // Bus was scheduled for 14:00 (3 minutes overdue)
      const res = calculateDueSeconds('', '14:00', baseDate);
      expect(res.dueSeconds).toBe(0);
      expect(res.minutes).toBe(0);
      expect(res.isDue).toBe(true);
    });

    it('returns null timing for empty or unparseable input', () => {
      const res = calculateDueSeconds('', '');
      expect(res).toEqual({ dueSeconds: null, minutes: null, isDue: false });
    });
  });

  describe('parseEmtArrivalXml', () => {
    it('parses valid EMT SAE XML payload with mixed formats and accessibility flags', () => {
      const sampleXml = `<?xml version='1.0' encoding='UTF-8'?>
<estimacion parada="2261">
  <solo_parada>
    <bus>
      <linea>6</linea>
      <destino><![CDATA[Torrefiel]]></destino>
      <minutos>Pròxim</minutos>
      <horaLlegada/>
      <error/>
      <adaptado>1</adaptado>
    </bus>
    <info/>
    <bus>
      <linea>8</linea>
      <destino><![CDATA[Pta.de la Mar]]></destino>
      <minutos>5 min.</minutos>
      <horaLlegada/>
      <error/>
      <adaptado>0</adaptado>
    </bus>
    <info/>
    <bus>
      <linea>19</linea>
      <destino><![CDATA[Est.del Nord]]></destino>
      <minutos>8 min.</minutos>
      <horaLlegada/>
      <error/>
    </bus>
  </solo_parada>
</estimacion>`;

      const arrivals = parseEmtArrivalXml(sampleXml);
      expect(arrivals).toHaveLength(3);

      expect(arrivals[0]).toEqual({
        line: '6',
        destination: 'Torrefiel',
        dueSeconds: 20,
        minutes: 0,
        isDue: true,
        isLive: true,
        wheelchair: true,
      });

      expect(arrivals[1]).toEqual({
        line: '8',
        destination: 'Pta.de la Mar',
        dueSeconds: 300,
        minutes: 5,
        isDue: false,
        isLive: true,
        wheelchair: false,
      });

      expect(arrivals[2]).toEqual({
        line: '19',
        destination: 'Est.del Nord',
        dueSeconds: 480,
        minutes: 8,
        isDue: false,
        isLive: true,
        wheelchair: false,
      });
    });

    it('sorts arrivals in ascending order of arrival time', () => {
      const unsortedXml = `<?xml version='1.0' encoding='UTF-8'?>
<estimacion parada="2277">
  <solo_parada>
    <bus>
      <linea>72</linea>
      <destino><![CDATA[Sant Isidre]]></destino>
      <minutos>12 min.</minutos>
    </bus>
    <bus>
      <linea>11</linea>
      <destino><![CDATA[Patraix]]></destino>
      <minutos>2 min.</minutos>
    </bus>
    <bus>
      <linea>31</linea>
      <destino><![CDATA[Est.J.Sorolla]]></destino>
      <minutos>Pròxim</minutos>
    </bus>
  </solo_parada>
</estimacion>`;

      const arrivals = parseEmtArrivalXml(unsortedXml);
      expect(arrivals.map((a) => a.line)).toEqual(['31', '11', '72']);
      expect(arrivals.map((a) => a.dueSeconds)).toEqual([20, 120, 720]);
    });

    it('ignores bus entries with errors or missing line numbers', () => {
      const errorXml = `<?xml version='1.0' encoding='UTF-8'?>
<estimacion parada="2277">
  <solo_parada>
    <bus>
      <linea>11</linea>
      <destino><![CDATA[Patraix]]></destino>
      <minutos>4 min.</minutos>
    </bus>
    <bus>
      <linea>99</linea>
      <destino><![CDATA[Malva-rosa]]></destino>
      <error>SENSE ESTIMACIONS</error>
    </bus>
    <bus>
      <linea></linea>
      <destino><![CDATA[Ghost line]]></destino>
      <minutos>2 min.</minutos>
    </bus>
  </solo_parada>
</estimacion>`;

      const arrivals = parseEmtArrivalXml(errorXml);
      expect(arrivals).toHaveLength(1);
      expect(arrivals[0].line).toBe('11');
    });

    it('returns empty array on municipal decoy anti-scraping error payload', () => {
      const decoyXml = `<?xml version="1.0" encoding="utf-8"?>
<estimacion>
  <parada_linea>
    <bus>
      <error><![CDATA[<center>Temporalment no disponible des del pla.<br/>Consulta les estimacions d'arribada des de la <a href="/ciudadano/index.php?lang=ca">Home</a> o des de la nostra APP.</center>]]></error>
    </bus>
  </parada_linea>
</estimacion>`;

      const arrivals = parseEmtArrivalXml(decoyXml);
      expect(arrivals).toEqual([]);
    });

    it('returns empty array on malformed or empty xml', () => {
      expect(parseEmtArrivalXml('')).toEqual([]);
      expect(parseEmtArrivalXml(null)).toEqual([]);
      expect(parseEmtArrivalXml('not xml at all')).toEqual([]);
    });
  });

  describe('fetchStopArrivals caching and deduplication', () => {
    const validXml = `<?xml version='1.0' encoding='UTF-8'?>
<estimacion parada="2261">
  <solo_parada>
    <bus>
      <linea>6</linea>
      <destino><![CDATA[Torrefiel]]></destino>
      <minutos>3 min.</minutos>
    </bus>
  </solo_parada>
</estimacion>`;

    it('fetches arrivals and returns structured objects', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => validXml,
      });

      const arrivals = await fetchStopArrivals('2261', { fetchFn: mockFetch });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain('parada=2261');
      expect(arrivals).toHaveLength(1);
      expect(arrivals[0].line).toBe('6');
      expect(arrivals[0].destination).toBe('Torrefiel');
      expect(arrivals[0].dueSeconds).toBe(180);
      expect(arrivals[0].minutes).toBe(3);
    });

    it('returns cached arrivals within 20s window without secondary network calls', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => validXml,
      });

      const res1 = await fetchStopArrivals('P-2261', { fetchFn: mockFetch });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Call again within TTL window
      const res2 = await fetchStopArrivals('2261', { fetchFn: mockFetch });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(res2).toEqual(res1);

      // Inspection helper also returns cached data
      expect(getEmtCachedArrivals('2261')).toEqual(res1);
    });

    it('refetches when cache TTL expires', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          text: async () => validXml,
        });
      });

      vi.useFakeTimers();
      try {
        await fetchStopArrivals('2261', { fetchFn: mockFetch });
        expect(callCount).toBe(1);

        // Advance 10s (still cached)
        vi.advanceTimersByTime(10000);
        await fetchStopArrivals('2261', { fetchFn: mockFetch });
        expect(callCount).toBe(1);

        // Advance past 20s TTL (total 21s)
        vi.advanceTimersByTime(11000);
        await fetchStopArrivals('2261', { fetchFn: mockFetch });
        expect(callCount).toBe(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it('bypasses cache when forceRefresh is true', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => validXml,
      });

      await fetchStopArrivals('2261', { fetchFn: mockFetch });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      await fetchStopArrivals('2261', { fetchFn: mockFetch, forceRefresh: true });
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('deduplicates concurrent in-flight requests to a single network call', async () => {
      let resolveFetch;
      const deferredPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      const mockFetch = vi.fn().mockReturnValue(deferredPromise);

      // Trigger 3 simultaneous calls
      const p1 = fetchStopArrivals('2261', { fetchFn: mockFetch });
      const p2 = fetchStopArrivals('P-2261', { fetchFn: mockFetch });
      const p3 = fetchStopArrivals(2261, { fetchFn: mockFetch });

      // Exactly 1 fetch initiated
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Resolve the single network call
      resolveFetch({
        ok: true,
        text: async () => validXml,
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toEqual(r2);
      expect(r2).toEqual(r3);
      expect(r1).toHaveLength(1);
    });

    it('falls back to prior cached arrivals on network failure without throwing', async () => {
      const mockFetchSuccess = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => validXml,
      });

      // 1. Successful initial fetch
      const initial = await fetchStopArrivals('2261', { fetchFn: mockFetchSuccess });
      expect(initial).toHaveLength(1);

      // 2. Subsequent call fails with network error
      const mockFetchFail = vi.fn().mockRejectedValue(new Error('Network timeout'));
      const fallback = await fetchStopArrivals('2261', {
        fetchFn: mockFetchFail,
        forceRefresh: true,
      });

      expect(fallback).toEqual(initial);
    });

    it('returns empty array when network fails with no prior cache without throwing', async () => {
      const mockFetchFail = vi.fn().mockRejectedValue(new Error('DNS resolution failed'));
      const result = await fetchStopArrivals('9999', { fetchFn: mockFetchFail });
      expect(result).toEqual([]);
    });

    it('falls back to prior cache when decoy error payload is received', async () => {
      const mockFetchSuccess = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => validXml,
      });

      const initial = await fetchStopArrivals('2261', { fetchFn: mockFetchSuccess });

      const decoyXml = '<estimacion><error>Temporalment no disponible</error></estimacion>';
      const mockFetchDecoy = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => decoyXml,
      });

      const result = await fetchStopArrivals('2261', {
        fetchFn: mockFetchDecoy,
        forceRefresh: true,
      });

      expect(result).toEqual(initial);
    });
  });
  describe('refusal detection (#123)', () => {
    const xmlOk = '<estimacion><parada_linea><bus><linea>9</linea><destino>X</destino><minutos>3 min.</minutos></bus></parada_linea></estimacion>';
    const decoy = { ok: true, status: 200, text: async () => '<estimacion><error>Temporalment no disponible</error></estimacion>' };
    const html403 = { ok: false, status: 403, text: async () => '<html>denied</html>' };

    it('records a decoy answer as blocked', async () => {
      await fetchStopArrivals('2261', { fetchFn: vi.fn().mockResolvedValue(decoy) });
      expect(getApiDiagnostics().bus).toMatchObject({ kind: 'blocked' });
    });

    it('stops sending once two stops are refused, and a success clears it', async () => {
      const fetchFn = vi.fn().mockResolvedValue(html403);
      await fetchStopArrivals('1', { fetchFn });
      await fetchStopArrivals('2', { fetchFn });
      expect(emtRefusal.isRefused()).toBe(true);
      await fetchStopArrivals('3', { fetchFn });
      expect(fetchFn).toHaveBeenCalledTimes(2);

      const ok = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => xmlOk });
      await fetchStopArrivals('3', { fetchFn: ok, forceRefresh: true });
      expect(emtRefusal.isRefused()).toBe(false);
    });

    it('does not count a timeout', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      await fetchStopArrivals('1', { fetchFn });
      await fetchStopArrivals('2', { fetchFn });
      expect(emtRefusal.isRefused()).toBe(false);
      expect(getApiDiagnostics().bus).toMatchObject({ kind: 'unreachable' });
    });
  });
});
