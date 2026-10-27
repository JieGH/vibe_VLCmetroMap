// Arrival Memory Store: Client-side cache, wall-clock countdown memory & Hub Seeder
// Manages the API rate budget, 60s memory pause, and minimal 3-hub initial network seeding.
import { Capacitor } from '@capacitor/core';
import metroData from '../data/metro_lines.json';
import imageLineColors from '../data/line_colors_from_image.json';
import paradasApi from '../data/paradas_api.json';
import liveStations from '../data/live_stations.json';
import { classifyFetchFailure, createRefusalTracker } from '../utils/apiRefusal';
import { recordApiFailure } from '../utils/diagnostics';

// Build complete 141-station API ID map
export const STATION_ID_MAP = {};
if (Array.isArray(paradasApi)) {
  for (const p of paradasApi) {
    if (p.nombre && p.id !== undefined) {
      STATION_ID_MAP[p.nombre] = p.id;
      STATION_ID_MAP[p.nombre.toLowerCase().trim()] = p.id;
    }
  }
}
// Known spelling variations & aliases
STATION_ID_MAP['Fira València'] = 68;
STATION_ID_MAP['fira valència'] = 68;
STATION_ID_MAP['Pl. Espanya'] = 51;
STATION_ID_MAP['pl. espanya'] = 51;
STATION_ID_MAP['Plaça Espanya'] = 51;
STATION_ID_MAP['plaça espanya'] = 51;

// The Strategic Hubs (queried at boot) and Major Stations (fetched together by
// a Network Sync) live in live_stations.json so that `npm run sweep` measures
// exactly the sets the app uses. Every id there must be the station's id in
// paradas_api.json — 122 is Francesc Cubells, not Marítim, and seeding it
// left lines 5 and 7 with no live trains at all. `npm test` guards this.
export const STRATEGIC_HUBS = liveStations.strategicHubs;
export const MAJOR_STATIONS = liveStations.majorStations;

// On Netlify (where FGV refuses connections and the function proxies the
// metroapi.alexbadi.es relay), use the 3 Strategic Hubs and 9 Major Stations
// from the relay configuration, dispatched sequentially at 1 req/s so the
// relay never rate-limits the sweep with HTTP 429.
export const RELAY_STRATEGIC_HUBS = [
  { id: 17, name: 'Àngel Guimerà', lines: ['1', '2', '3', '5', '9'] },
  { id: 115, name: 'Marítim', lines: ['5', '6', '7', '8'] },
  { id: 33, name: 'Torrent', lines: ['1', '2', '7'] },
];

export const RELAY_MAJOR_STATIONS = [
  { id: 12, name: 'Benimaclet' },
  { id: 34, name: 'Torrent Avinguda' },
  { id: 83, name: 'Dr. Lluch' },
  { id: 190, name: 'Alacant' },
  { id: 17, name: 'Àngel Guimerà' },
  { id: 115, name: 'Marítim' },
  { id: 121, name: 'Aeroport' },
  { id: 186, name: 'Riba-roja de Túria' },
  { id: 1, name: 'Rafelbunyol' },
];

const RELAY_MIN_DISPATCH_INTERVAL_MS = 1000;

export function isRelaySource() {
  if (Capacitor.isNativePlatform()) return false;
  if (import.meta.env?.VITE_METRO_SOURCE === 'relay') return true;
  if (typeof window !== 'undefined' && /\.netlify\.app$/i.test(window.location?.hostname || '')) return true;
  return false;
}

// How often a Network Sync sweeps the Major Stations. Long enough to stay well
// inside the upstream rate budget, short enough that no prediction reaches the
// 18-minute age-out before being replaced. It lives here rather than with the
// timer that fires it because it is also the cadence a position's confidence is
// judged against: one interval unheard is healthy, more is not.
export const NETWORK_SYNC_INTERVAL_MS = 120000;

export const CACHE_TTL_MS = 60000; // 60 seconds strict memory pause per station
const MIN_REFRESH_COOLDOWN_MS = 30000; // 30 seconds cooldown between manual refreshes
// Prevision requests one client keeps in flight at once. The web build sits behind
// the local server's global upstream cap and shared cache, so it can go wider;
// native calls FGV directly with no shared bound, so it stays courteous at 4.
const MAX_CONCURRENT_REQUESTS = Capacitor.isNativePlatform() ? 4 : 8;
const DWELL_GRACE_PERIOD_MS = 20000; // 20 seconds dwell before train rolls off

// Live predictions for one Station, from the endpoint FGV's own app uses.
// Undocumented: it can move without notice. See ADR-0005.
const FGV_PREVISION_URL = 'https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3';

// Propagation Lag — real-world observation (2026-09-09): the map displays vehicle
// positions behind their true location because the feed already lags the
// physical train. Subtracting the lag from the Target Arrival Timestamp at fetch
// time moves the displayed position forward to match reality.
//   Metro lines (1–3, 5, 7, 9): 15 s behind reality
//   Tram lines (4, 6, 8, 10):   10 s behind reality
// The tram figure was observed on 4 and 6 and holds for every tram Line.
const METRO_PROPAGATION_LAG_MS = 15_000;
const TRAM_PROPAGATION_LAG_MS  = 10_000;
const TRAM_LINE_IDS = new Set(['4', '6', '8', '10']);

// Arrival Countdown Lead — real-world observation (2026-10-24): trains reach the
// platform ~10 s before the countdown hits zero. Applied once, on the Target
// Arrival Timestamp, so the countdown, the status badges and the map's Vehicle
// positions all shift together on every surface (LAN, Netlify, iOS, Android).
export const ARRIVAL_COUNTDOWN_LEAD_SECONDS = 10;
const ARRIVAL_COUNTDOWN_LEAD_MS = ARRIVAL_COUNTDOWN_LEAD_SECONDS * 1000;

// About 6% of FGV requests never answer at all — no status, no error — while
// the median answer takes ~0.4 s and p90 ~0.9 s (sweep of 2026-10-20). So an
// attempt is abandoned well past p90 and tried exactly once more.
const FGV_ATTEMPT_TIMEOUT_MS = 4000;
const FGV_ATTEMPTS = 2;

/**
 * Fetch one Station's predictions, retrying once when an attempt hangs or the
 * network fails. An HTTP error status is an answer, so it is returned as-is,
 * never retried. The body is read inside the same timeout as the request.
 */
async function fetchPrevision(url) {
  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FGV_ATTEMPT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      // The raw text is kept so a refusal can be told apart: a block page is
      // HTML, not JSON (#123).
      let bodyText = null;
      let data = null;
      if (typeof response.text === 'function') {
        bodyText = await response.text().catch(() => null);
        if (response.ok && bodyText) {
          try { data = JSON.parse(bodyText); } catch { /* not JSON */ }
        }
      } else if (response.ok) {
        data = await response.json().catch(() => null);
      }
      return { response, data, bodyText };
    } catch (err) {
      if (attempt >= FGV_ATTEMPTS) throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Returns the Propagation Lag plus Arrival Countdown Lead in ms for a given line ID string. */
function propagationLagMs(lineId) {
  const lag = TRAM_LINE_IDS.has(lineId) ? TRAM_PROPAGATION_LAG_MS : METRO_PROPAGATION_LAG_MS;
  return lag + ARRIVAL_COUNTDOWN_LEAD_MS;
}


class ArrivalStore {
  constructor() {
    this.memory = new Map();
    this.inFlightRequests = new Map();
    this.listeners = new Set();
    this.activeRequests = 0;
    this.requestQueue = [];
    this.lastRequestTimestamp = 0;
    this.notifyPending = false;
    this.rateLimitedUntil = 0;
    this.isSyncingNetwork = false;
    this.lastNetworkSyncAt = 0;
    // Whether FGV is refusing this network (VPN, blocked IP), judged from repeated
    // evidence, and the backoff that follows. See src/utils/apiRefusal.js (#123).
    this.refusal = createRefusalTracker();
    this.refusal.subscribe(() => this.notify());

    // Hydrate from sessionStorage if available
    this.hydrateFromSessionStorage();
  }

  getStationKey(stationProps) {
    if (!stationProps) return null;
    if (stationProps.apiId) return String(stationProps.apiId);
    const mapped = this.getStationApiId(stationProps);
    if (mapped) return String(mapped);
    return stationProps.name || null;
  }

  getStationApiId(stationProps) {
    if (!stationProps) return null;
    if (stationProps.apiId) return Number(stationProps.apiId);
    if (stationProps.name) {
      const direct = STATION_ID_MAP[stationProps.name];
      if (direct !== undefined) return Number(direct);
      const lower = STATION_ID_MAP[stationProps.name.toLowerCase().trim()];
      if (lower !== undefined) return Number(lower);
    }
    return null;
  }

  hydrateFromSessionStorage() {
    try {
      if (typeof window === 'undefined') return;
      const raw = (window.localStorage && window.localStorage.getItem('metrovalencia_arrival_memory')) ||
                  (window.sessionStorage && window.sessionStorage.getItem('metrovalencia_arrival_memory'));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const now = Date.now();
      for (const [k, v] of Object.entries(parsed)) {
        if (v && Array.isArray(v.arrivals) && v.arrivals.some(a => (a.targetTimestamp + DWELL_GRACE_PERIOD_MS) > now)) {
          this.memory.set(k, v);
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  persistToSessionStorage() {
    try {
      if (typeof window === 'undefined') return;
      const obj = {};
      const now = Date.now();
      for (const [k, v] of this.memory.entries()) {
        if (v && Array.isArray(v.arrivals) && v.arrivals.some(a => (a.targetTimestamp + DWELL_GRACE_PERIOD_MS) > now)) {
          obj[k] = v;
        }
      }
      const serialized = JSON.stringify(obj);
      if (window.localStorage) {
        window.localStorage.setItem('metrovalencia_arrival_memory', serialized);
      }
      if (window.sessionStorage) {
        window.sessionStorage.setItem('metrovalencia_arrival_memory', serialized);
      }
    } catch {
      // Ignore storage errors
    }
  }

  /** True when the train API is refusing this network; the app tells the user. */
  isApiRefused() {
    return this.refusal.isRefused();
  }

  /** Forgets any refusal verdict (tests, and a fresh start after a network change). */
  resetApiRefusal() {
    this.refusal.recordSuccess();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // Answers often land in bursts; listeners hear about a burst once, on the
  // next frame (or a microtask where there are no frames, as in tests / SSR).
  notify() {
    if (this.notifyPending) return;
    this.notifyPending = true;
    const flush = () => {
      this.notifyPending = false;
      this.listeners.forEach((fn) => {
        try { fn(); } catch { /* ignore */ }
      });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
    else if (typeof queueMicrotask === 'function') queueMicrotask(flush);
    else setTimeout(flush, 0);
  }

  /**
   * Opens the live network with one full Network Sync. The sweep dispatches the
   * Strategic Hubs first, so the busiest picture lands within the first round
   * of requests, and the other Major Stations follow without a gap.
   */
  async bootNetwork() {
    await this.syncNetwork();
  }

  /**
   * Waits for one of the MAX_CONCURRENT_REQUESTS prevision slots. Slots are
   * handed out in arrival order, so a sweep's dispatch order is its fetch order.
   */
  acquireRequestSlot() {
    const limit = isRelaySource() ? 1 : MAX_CONCURRENT_REQUESTS;
    if (this.activeRequests < limit) {
      this.activeRequests += 1;
      return Promise.resolve();
    }
    return new Promise(resolve => this.requestQueue.push(resolve));
  }

  releaseRequestSlot() {
    const next = this.requestQueue.shift();
    if (next) next(); // the slot passes straight to the next waiter
    else this.activeRequests -= 1;
  }

  /**
   * Fetch every Major Station in one pass, Strategic Hubs first, through a
   * bounded parallel queue.
   *
   * Without this the map only ever holds the Strategic Hubs, so every live
   * train ages out roughly 18 minutes after load and the whole network silently
   * reverts to simulated trains. Stations still inside their memory pause cost
   * no request, so a repeat sync is cheap.
   */
  async syncNetwork() {
    if (this.isSyncingNetwork) return { fetched: 0, skipped: 0 };
    // A refused network is knocked on by the backoff probe, not by the sweep.
    if (!this.refusal.canAttempt()) return { fetched: 0, skipped: 0 };
    this.isSyncingNetwork = true;

    let fetched = 0;
    let skipped = 0;

    const relay = isRelaySource();
    const hubs = relay ? RELAY_STRATEGIC_HUBS : STRATEGIC_HUBS;
    const majors = relay ? RELAY_MAJOR_STATIONS : MAJOR_STATIONS;
    const concurrency = relay ? 1 : MAX_CONCURRENT_REQUESTS;

    const hubIds = new Set(hubs.map(h => String(h.id)));
    const ordered = [
      ...hubs,
      ...majors.filter(s => !hubIds.has(String(s.id))),
    ];
    let next = 0;
    const worker = async () => {
      while (next < ordered.length) {
        const station = ordered[next++];
        const entry = this.memory.get(String(station.id));
        if (entry && (Date.now() - entry.fetchedAt) < CACHE_TTL_MS) {
          skipped += 1;
          continue;
        }
        try {
          await this.getStationArrivals({ apiId: station.id, name: station.name });
          fetched += 1;
        } catch {
          // One station failing must not abandon the rest of the sweep.
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: concurrency }, worker));
    } finally {
      this.isSyncingNetwork = false;
      this.lastNetworkSyncAt = Date.now();
      this.notify();
    }

    return { fetched, skipped };
  }

  /**
   * Project stored predictions to current wall-clock time
   */
  projectArrivals(entry, now = Date.now()) {
    if (!entry || !Array.isArray(entry.arrivals)) return [];

    const projected = [];
    for (const arr of entry.arrivals) {
      const elapsedSinceTarget = now - arr.targetTimestamp;
      if (elapsedSinceTarget > DWELL_GRACE_PERIOD_MS) {
        continue;
      }

      const remainingSeconds = Math.max(0, Math.round((arr.targetTimestamp - now) / 1000));
      const minutes = Math.max(0, Math.round(remainingSeconds / 60));

      let status = 'On Time';
      if (remainingSeconds <= 0) {
        status = 'At Platform';
      } else if (remainingSeconds <= 120) {
        status = 'Approaching';
      }

      projected.push({
        ...arr,
        seconds: remainingSeconds,
        minutes,
        status,
        targetTimestamp: arr.targetTimestamp,
        isCached: true,
        fetchedAt: entry.fetchedAt,
      });
    }

    return projected.sort((a, b) => a.seconds - b.seconds);
  }

  /**
   * Synchronous check for cached arrival memory (instant render, zero loading spinner)
   */
  getCachedArrivals(stationProps, now = Date.now()) {
    const key = this.getStationKey(stationProps);
    if (!key) return null;
    const entry = this.memory.get(key);
    if (!entry) return null;

    const projected = this.projectArrivals(entry, now);
    if (projected.length === 0) return null;

    const isFresh = (now - entry.fetchedAt) < CACHE_TTL_MS;
    return {
      arrivals: projected,
      isFresh,
      fetchedAt: entry.fetchedAt,
      fetchError: entry.fetchError || null,
    };
  }

  /**
   * Main fetch method with 60s memory pause, rate budgeting, and in-flight deduplication.
   */
  /** FGV api id for a Station name, or null when it has no live endpoint. */
  apiIdForName(name) {
    return this.getStationApiId({ name });
  }

  /** Milliseconds since this Station (by FGV id) was last heard from; null when never. */
  ageMs(apiId, now = Date.now()) {
    const entry = this.memory.get(String(apiId));
    return entry ? now - entry.fetchedAt : null;
  }

  async getStationArrivals(stationProps, { forceRefresh = false } = {}) {
    if (!stationProps) return [];
    const key = this.getStationKey(stationProps);
    const stationId = this.getStationApiId(stationProps);
    const now = Date.now();

    const entry = key ? this.memory.get(key) : null;
    const timeSinceFetch = entry ? (now - entry.fetchedAt) : Infinity;

    // 1. Strict 60-Second Memory Pause:
    // If fetched less than 60s ago, NEVER make a network call (return memory data).
    if (entry && !forceRefresh && timeSinceFetch < CACHE_TTL_MS) {
      const projected = this.projectArrivals(entry, now);
      return Object.assign(projected, {
        isFromCache: true,
        fetchedAt: entry.fetchedAt,
        fetchError: entry.fetchError || null,
      });
    }

    // 2. Manual Refresh Cooldown:
    // Even if user clicks Refresh, enforce a 30s pause to prevent button spamming.
    if (entry && forceRefresh && timeSinceFetch < MIN_REFRESH_COOLDOWN_MS) {
      const projected = this.projectArrivals(entry, now);
      return Object.assign(projected, {
        isFromCache: true,
        fetchedAt: entry.fetchedAt,
        fetchError: 'Refreshed recently. Showing countdown from memory.',
      });
    }

    // 3. If no API endpoint exists for this station, return empty with notice
    if (!stationId) {
      return Object.assign([], {
        fetchError: 'N/A — this station has no live prediction endpoint.',
        isFromCache: false,
        fetchedAt: now,
      });
    }

    // 4. Deduplicate in-flight requests for the same station
    if (this.inFlightRequests.has(key)) {
      return this.inFlightRequests.get(key);
    }

    // 5. Rate-limit backoff check
    if (this.rateLimitedUntil > now && !forceRefresh) {
      if (entry) {
        const projected = this.projectArrivals(entry, now);
        return Object.assign(projected, {
          isFromCache: true,
          fetchedAt: entry.fetchedAt,
          fetchError: 'Live rate limit active. Counting down from previous sync.',
        });
      }
    }

    // 6. Refused-network backoff: while FGV refuses this network, one probe per
    // backoff step (30 s up to 5 min). A manual refresh always gets through.
    if (!this.refusal.tryAcquire({ force: forceRefresh })) {
      const message = 'Train service refused this network. Counting down from previous sync.';
      if (entry) {
        const projected = this.projectArrivals(entry, now);
        return Object.assign(projected, { isFromCache: true, fetchedAt: entry.fetchedAt, fetchError: message });
      }
      return Object.assign([], { fetchError: message, isFromCache: false, fetchedAt: now });
    }

    // Create execution promise
    const fetchPromise = (async () => {
      // Never more than MAX_CONCURRENT_REQUESTS prevision requests in flight
      await this.acquireRequestSlot();

      // When using the old API relay (Netlify), enforce 1s spacing between
      // outbound requests so metroapi.alexbadi.es never rate-limits with 429.
      if (isRelaySource()) {
        const timeSinceLastDispatch = Date.now() - this.lastRequestTimestamp;
        if (this.lastRequestTimestamp > 0 && timeSinceLastDispatch < RELAY_MIN_DISPATCH_INTERVAL_MS) {
          const delay = RELAY_MIN_DISPATCH_INTERVAL_MS - timeSinceLastDispatch;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        this.lastRequestTimestamp = Date.now();
      }

      try {
        // FGV's CORS policy admits only FGV's own sites, so a browser has to
        // reach it through the same-origin /api/metro proxy (Vite in dev, a
        // Netlify Function in production). The native app has no such limit:
        // CapacitorHttp (enabled in capacitor.config.json) runs fetch over
        // native networking, so it calls FGV directly. See ADR-0005.
        const url = Capacitor.isNativePlatform()
          ? `${FGV_PREVISION_URL}/${stationId}`
          : `/api/metro/horarios-prevision-3/${stationId}`;
        const { response, data, bodyText } = await fetchPrevision(url);

        if (!response.ok) {
          if (response.status === 429) {
            this.rateLimitedUntil = Date.now() + 20000; // 20s backoff
          }
          throw Object.assign(new Error(`HTTP ${response.status}`), {
            verdict: classifyFetchFailure({ status: response.status, body: bodyText, headers: response.headers }),
          });
        }

        if (data && Array.isArray(data.previsiones)) {
          // The local server may answer from its short cache and says how old
          // the answer is. Anchoring on when FGV actually answered keeps a
          // cached reply from displacing Vehicles; no header (Netlify, the Vite
          // proxy, the native app's direct call) means a fresh answer.
          const ageHeader = response.headers?.get?.('X-Prevision-Age-Ms');
          const ageMs = /^\d+$/.test(ageHeader ?? '') ? Number(ageHeader) : 0;
          const fetchTime = Date.now() - ageMs;
          // FGV groups trains under each Line; the old relay returns flat rows
          // (or regrouped rows with trainTimestamp). Support both shapes.
          const trains = data.previsiones.flatMap((group) => {
            if (Array.isArray(group?.trains)) {
              return group.trains.map(t => ({ ...t, line: group.line ?? group.line_id }));
            }
            return group && typeof group === 'object' ? [{ ...group, line: group.line ?? group.line_id }] : [];
          }).filter(t => (t.destino || t.destination) && typeof t.seconds === 'number' && Number.isFinite(t.seconds));
          const parsedArrivals = trains.map((p) => {
            const seconds = p.seconds;
            const lineId = String(p.line ?? '');
            const lineFeature = metroData.features.find(
              f => f.properties.line === lineId && f.geometry.type === 'LineString'
            );
            const lineName = lineFeature ? lineFeature.properties.name : `Line ${lineId}`;
            const defaultColor = lineFeature ? lineFeature.properties.color : (lineId === '1' ? '#FFD100' : lineId === '3' ? '#E2001A' : lineId === '5' ? '#00994D' : '#8F6DB8');
            const lineColor = (imageLineColors && imageLineColors[lineId]) ? imageLineColors[lineId] : defaultColor;

            // When the old API relay provides trainTimestamp (epoch seconds),
            // prefer it so sightings across sequential 1s-spaced requests share
            // one server timeline and fuse into Confirmed vehicles. FGV omits
            // trainTimestamp, so it anchors on fetchTime + seconds * 1000.
            //
            // Propagation Lag correction: the feed lags the physical train
            // (15 s for metro, 10 s for trams). Subtracting the lag brings the
            // displayed vehicle position forward to match reality.
            const serverTimestamp = Number(p.trainTimestamp) * 1000;
            const rawTimestamp = Number.isFinite(serverTimestamp) && serverTimestamp > 0
              ? serverTimestamp
              : fetchTime + (seconds * 1000);
            const targetTimestamp = rawTimestamp - propagationLagMs(lineId);

            return {
              line: lineId,
              lineName,
              lineColor,
              destination: p.destino || p.destination,
              targetTimestamp,
              initialSeconds: seconds,
              isLive: true,
              vehicleId: p.vehicle !== undefined && p.vehicle !== null ? String(p.vehicle) : undefined,
            };
          });

          // Store in memory
          const updatedEntry = {
            stationId,
            stationName: stationProps.name,
            fetchedAt: fetchTime,
            arrivals: parsedArrivals,
            fetchError: null,
          };
          this.refusal.recordSuccess();
          this.memory.set(key, updatedEntry);
          this.persistToSessionStorage();
          this.notify();

          const projected = this.projectArrivals(updatedEntry, Date.now());
          return Object.assign(projected, {
            isFromCache: false,
            fetchedAt: fetchTime,
            fetchError: null,
          });
        }

        // A 2xx that is not JSON is a block page; JSON of the wrong shape is a
        // broken feed, not a refusal.
        throw Object.assign(new Error('Malformed API payload'), {
          verdict: classifyFetchFailure({ status: response.status, body: bodyText, headers: response.headers })
            ?? { kind: 'server-error', status: response.status },
        });
      } catch (err) {
        const verdict = err?.verdict ?? classifyFetchFailure({ error: err });
        recordApiFailure('train', verdict);
        this.refusal.recordFailure(verdict.kind, key);

        // Resilient Fallback: If network/rate limit failed, check if we have prior memory!
        const existingEntry = this.memory.get(key);
        if (existingEntry) {
          const projected = this.projectArrivals(existingEntry, Date.now());
          if (projected.length > 0) {
            return Object.assign(projected, {
              isFromCache: true,
              fetchedAt: existingEntry.fetchedAt,
              fetchError: 'Live update failed. Showing countdown from earlier sync.',
            });
          }
        }

        // No prior memory
        return Object.assign([], {
          fetchError: 'Live predictions are currently unavailable.',
          isFromCache: false,
          fetchedAt: Date.now(),
        });
      } finally {
        this.releaseRequestSlot();
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, fetchPromise);
    return fetchPromise;
  }
}

export const arrivalStore = new ArrivalStore();
export default arrivalStore;
