// Arrival Memory Store: Client-side cache, wall-clock countdown memory & Hub Seeder
// Manages the API rate budget, 60s memory pause, and minimal 3-hub initial network seeding.
import { Capacitor } from '@capacitor/core';
import metroData from '../data/metro_lines.json';
import imageLineColors from '../data/line_colors_from_image.json';
import paradasApi from '../data/paradas_api.json';
import liveStations from '../data/live_stations.json';

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

// How often a Network Sync sweeps the Major Stations. Long enough to stay well
// inside the upstream rate budget, short enough that no prediction reaches the
// 18-minute age-out before being replaced. It lives here rather than with the
// timer that fires it because it is also the cadence a position's confidence is
// judged against: one interval unheard is healthy, more is not.
export const NETWORK_SYNC_INTERVAL_MS = 120000;

const CACHE_TTL_MS = 60000; // 60 seconds strict memory pause per station
const MIN_REFRESH_COOLDOWN_MS = 30000; // 30 seconds cooldown between manual refreshes
const MAX_CONCURRENT_REQUESTS = 4; // prevision requests one client keeps in flight at once
const DWELL_GRACE_PERIOD_MS = 40000; // 40 seconds dwell before train rolls off

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
      const data = response.ok ? await response.json().catch(() => null) : null;
      return { response, data };
    } catch (err) {
      if (attempt >= FGV_ATTEMPTS) throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Returns the Propagation Lag in ms for a given line ID string. */
function propagationLagMs(lineId) {
  return TRAM_LINE_IDS.has(lineId) ? TRAM_PROPAGATION_LAG_MS : METRO_PROPAGATION_LAG_MS;
}


class ArrivalStore {
  constructor() {
    this.memory = new Map();
    this.inFlightRequests = new Map();
    this.listeners = new Set();
    this.activeRequests = 0;
    this.requestQueue = [];
    this.rateLimitedUntil = 0;
    this.isSyncingNetwork = false;
    this.lastNetworkSyncAt = 0;

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
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      const raw = sessionStorage.getItem('metrovalencia_arrival_memory');
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
      if (typeof window === 'undefined' || !window.sessionStorage) return;
      const obj = {};
      const now = Date.now();
      for (const [k, v] of this.memory.entries()) {
        if (v && Array.isArray(v.arrivals) && v.arrivals.some(a => (a.targetTimestamp + DWELL_GRACE_PERIOD_MS) > now)) {
          obj[k] = v;
        }
      }
      sessionStorage.setItem('metrovalencia_arrival_memory', JSON.stringify(obj));
    } catch {
      // Ignore storage errors
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach((fn) => {
      try { fn(); } catch { /* ignore */ }
    });
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
    if (this.activeRequests < MAX_CONCURRENT_REQUESTS) {
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
    this.isSyncingNetwork = true;

    let fetched = 0;
    let skipped = 0;

    const hubIds = new Set(STRATEGIC_HUBS.map(h => String(h.id)));
    const ordered = [
      ...STRATEGIC_HUBS,
      ...MAJOR_STATIONS.filter(s => !hubIds.has(String(s.id))),
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
      await Promise.all(Array.from({ length: MAX_CONCURRENT_REQUESTS }, worker));
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

    // Create execution promise
    const fetchPromise = (async () => {
      // Never more than MAX_CONCURRENT_REQUESTS prevision requests in flight
      await this.acquireRequestSlot();

      try {
        // FGV's CORS policy admits only FGV's own sites, so a browser has to
        // reach it through the same-origin /api/metro proxy (Vite in dev, a
        // Netlify Function in production). The native app has no such limit:
        // CapacitorHttp (enabled in capacitor.config.json) runs fetch over
        // native networking, so it calls FGV directly. See ADR-0005.
        const url = Capacitor.isNativePlatform()
          ? `${FGV_PREVISION_URL}/${stationId}`
          : `/api/metro/horarios-prevision-3/${stationId}`;
        const { response, data } = await fetchPrevision(url);

        if (!response.ok) {
          if (response.status === 429) {
            this.rateLimitedUntil = Date.now() + 20000; // 20s backoff
          }
          throw new Error(`HTTP ${response.status}`);
        }

        if (data && Array.isArray(data.previsiones)) {
          const fetchTime = Date.now();
          // FGV groups trains under each Line; flatten them, carrying the
          // group's Line onto each train. A train without a destination or a
          // countdown cannot be placed, so it is dropped rather than shown.
          const trains = data.previsiones.flatMap((group) =>
            (Array.isArray(group?.trains) ? group.trains : []).map(t => ({ ...t, line: group.line ?? group.line_id }))
          ).filter(t => t.destino && typeof t.seconds === 'number' && Number.isFinite(t.seconds));
          const parsedArrivals = trains.map((p) => {
            const seconds = p.seconds;
            const lineId = String(p.line ?? '');
            const lineFeature = metroData.features.find(
              f => f.properties.line === lineId && f.geometry.type === 'LineString'
            );
            const lineName = lineFeature ? lineFeature.properties.name : `Line ${lineId}`;
            const defaultColor = lineFeature ? lineFeature.properties.color : (lineId === '1' ? '#FFD100' : lineId === '3' ? '#E2001A' : lineId === '5' ? '#00994D' : '#8F6DB8');
            const lineColor = (imageLineColors && imageLineColors[lineId]) ? imageLineColors[lineId] : defaultColor;

            // FGV sends only seconds-to-arrival, so the Target Arrival
            // Timestamp is anchored on the response time. Every sighting from
            // one sweep shares the client clock, which keeps them on one
            // timeline for fusing.
            //
            // Propagation Lag correction: the feed lags the physical train
            // (15 s for metro, 10 s for trams). Subtracting the lag brings the
            // displayed vehicle position forward to match reality.
            const targetTimestamp = fetchTime + (seconds * 1000) - propagationLagMs(lineId);

            return {
              line: lineId,
              lineName,
              lineColor,
              destination: p.destino,
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
          this.memory.set(key, updatedEntry);
          this.persistToSessionStorage();
          this.notify();

          const projected = this.projectArrivals(updatedEntry, fetchTime);
          return Object.assign(projected, {
            isFromCache: false,
            fetchedAt: fetchTime,
            fetchError: null,
          });
        }

        throw new Error('Malformed API payload');
      } catch (_err) {
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
