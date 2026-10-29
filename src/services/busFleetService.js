// Live bus fleet service (issue #148, spec #146, ADR-0014, builds on ADR-0011).
// On-demand only: nothing here polls. A caller asks for one line's buses with
// getLineFleet(line) and gets plain records. Layer 384 (Seguimiento_EMT) is
// rewritten about every 30 s, so responses are cached 30 s and concurrent
// calls share one request.

import { classifyFetchFailure, createRefusalTracker } from '../utils/apiRefusal';
import { recordApiFailure, recordApiRequest, recordApiSuccess } from '../utils/diagnostics';

export const BUS_FLEET_CACHE_TTL_MS = 30000;
export const BUS_FLEET_TIMEOUT_MS = 4500;
export const BUS_FLEET_BASE_URL = 'https://geoportal.valencia.es/server/rest/services/EMT/Seguimiento_EMT/MapServer/384/query';

/**
 * Lines that may be tracked. To add a line, add one entry here (the key is the
 * `linea` value of the layer, which is also what is sent in the query). The
 * allowlist also keeps arbitrary text out of the `where` clause.
 */
export const BUS_FLEET_ALLOWED_LINES = {
  19: { name: 'Line 19' },
};

/** Fewer than this share of the last good snapshot's buses means a rewrite in progress (ADR-0014). */
export const PARTIAL_SHARE = 0.5;

// line -> { buses: [{gid, linea, trayecto, lonLat, fixTimeMs}], serverNowMs, fetchedAt (local ms of the last good snapshot) }
const lastGood = new Map();
// line -> local ms of the last answered request (good or ignored), for the TTL
const lastAnswerAt = new Map();
const inFlight = new Map();

// Whether the municipal server is refusing this network (see emtArrivalService).
export const busFleetRefusal = createRefusalTracker();

let requestSeq = 0;

/** Europe/Madrid UTC offset in ms at a UTC instant (3600000 or 7200000), from Intl. */
function madridOffsetMs(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Madrid',
    hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return wall - Math.floor(utcMs / 1000) * 1000;
}

/**
 * ADR-0014 rule: `fecha` is the Valencia wall clock read as UTC, but some whole
 * responses arrive as true UTC. Pure. Returns the true UTC time of the fix.
 *
 * @param {number} fechaMs raw `fecha`
 * @param {number} nowMs the response's HTTP Date (or Date.now())
 */
export function normalizeFecha(fechaMs, nowMs) {
  const ageMs = nowMs - fechaMs;
  // Offset at the fix's own wall-clock instant, one fixed-point step from now's offset.
  const offsetMs = madridOffsetMs(fechaMs - madridOffsetMs(nowMs));
  if (ageMs >= -(offsetMs / 2)) return Math.min(fechaMs, nowMs);
  // The wall clock repeats for an hour when DST ends, so more than one offset can
  // fit. Of the consistent candidates take the one closest to (and not after) now.
  const candidates = [3600000, 7200000]
    .filter((off) => madridOffsetMs(fechaMs - off) === off)
    .map((off) => fechaMs - off)
    .filter((c) => c <= nowMs);
  if (candidates.length) return Math.max(...candidates);
  return Math.min(fechaMs - offsetMs, nowMs);
}

/**
 * True when a response with `count` buses must be ignored because the last good
 * snapshot had `previousCount`: an empty one, or one with fewer than half the
 * tracked buses. With no previous snapshot nothing is partial.
 */
export function isPartialSnapshot(count, previousCount) {
  if (!previousCount) return false;
  return count === 0 || count < previousCount * PARTIAL_SHARE;
}

function isLinePlausible(line) {
  return Object.prototype.hasOwnProperty.call(BUS_FLEET_ALLOWED_LINES, line);
}

function parseBuses(json, line, nowMs) {
  const features = Array.isArray(json?.features) ? json.features : [];
  const buses = [];
  for (const f of features) {
    const p = f?.properties;
    const c = f?.geometry?.coordinates;
    if (!p || String(p.linea).trim() !== line) continue;
    if (!Number.isFinite(p.fecha) || !Array.isArray(c) || !Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
    buses.push({
      gid: p.gid,
      linea: line,
      trayecto: String(p.trayecto ?? '').trim(),
      lonLat: [c[0], c[1]],
      fixTimeMs: normalizeFecha(p.fecha, nowMs),
    });
  }
  return buses;
}

function toRecords(snapshot) {
  const nowMs = snapshot.serverNowMs + (Date.now() - snapshot.fetchedAt);
  return snapshot.buses.map((b) => ({
    gid: b.gid,
    linea: b.linea,
    trayecto: b.trayecto,
    lonLat: [...b.lonLat],
    fixTimeMs: b.fixTimeMs,
    ageSeconds: Math.max(0, Math.round((nowMs - b.fixTimeMs) / 1000)),
  }));
}

function fallback(line) {
  const snap = lastGood.get(line);
  return snap ? toRecords(snap) : [];
}

function noteFailure(verdict) {
  recordApiFailure('bus', verdict);
  // The refusal tracker wants distinct "stations"; one line has one, so each request counts as its own.
  busFleetRefusal.recordFailure(verdict.kind, `fleet-${requestSeq++}`);
}

/** Clears snapshots, timers and refusal state (tests). */
export function clearBusFleetCache() {
  lastGood.clear();
  lastAnswerAt.clear();
  inFlight.clear();
  requestSeq = 0;
  busFleetRefusal.recordSuccess();
}

/** True while a request for this line is running. */
export function isBusFleetInFlight(line) {
  return inFlight.has(String(line));
}

/**
 * The buses of one allowlisted line, on demand.
 *
 * Within 30 s of the last answer this serves the last good snapshot without a
 * request. Partial or empty responses are ignored (the last good snapshot is
 * kept); failures and refusals also return the last good snapshot, or [].
 *
 * @param {string|number} line allowlisted line, e.g. '19'
 * @param {{ force?: boolean, timeoutMs?: number, fetchFn?: Function }} [options]
 * @returns {Promise<Array<{gid:number, linea:string, trayecto:string, lonLat:[number,number], fixTimeMs:number, ageSeconds:number}>>}
 */
export async function getLineFleet(line, options = {}) {
  const key = String(line).trim();
  if (!isLinePlausible(key)) return [];

  const {
    force = false,
    timeoutMs = BUS_FLEET_TIMEOUT_MS,
    fetchFn = (typeof globalThis !== 'undefined' && globalThis.fetch) ? globalThis.fetch : fetch,
  } = options;

  if (!force && lastAnswerAt.has(key) && Date.now() - lastAnswerAt.get(key) < BUS_FLEET_CACHE_TTL_MS) {
    return fallback(key);
  }
  if (inFlight.has(key)) return inFlight.get(key);
  if (!busFleetRefusal.tryAcquire({ force })) return fallback(key);

  const promise = (async () => {
    const params = new URLSearchParams({ where: `linea='${key}'`, outFields: '*', f: 'geoJSON' });
    const url = `${BUS_FLEET_BASE_URL}?${params.toString()}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Accept: 'application/json, */*' };
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    try {
      recordApiRequest('bus');
      const response = await fetchFn(url, { signal: controller.signal, headers });
      const text = await response.text?.().catch(() => '') ?? '';

      const verdict = response.ok
        ? classifyFetchFailure({ status: response.status ?? 200, body: text, headers: response.headers })
        : classifyFetchFailure({ status: response.status, body: text, headers: response.headers });
      if (verdict) {
        noteFailure(verdict);
        return fallback(key);
      }

      let json;
      try { json = JSON.parse(text); } catch { json = null; }
      // ArcGIS reports query errors as a 200 with an `error` object and no features.
      if (!json || json.error || !Array.isArray(json.features)) {
        noteFailure({ kind: 'server-error', status: response.status ?? 200 });
        return fallback(key);
      }

      busFleetRefusal.recordSuccess();
      recordApiSuccess('bus');
      lastAnswerAt.set(key, Date.now());

      const dateHeader = Date.parse(response.headers?.get?.('date') ?? '');
      const serverNowMs = Number.isFinite(dateHeader) ? dateHeader : Date.now();
      const buses = parseBuses(json, key, serverNowMs);
      const previous = lastGood.get(key);
      if (isPartialSnapshot(buses.length, previous?.buses.length ?? 0)) return fallback(key);
      if (!buses.length) return [];

      const snapshot = { buses, serverNowMs, fetchedAt: Date.now() };
      lastGood.set(key, snapshot);
      return toRecords(snapshot);
    } catch (error) {
      noteFailure(classifyFetchFailure({ error }));
      return fallback(key);
    } finally {
      clearTimeout(timer);
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}
