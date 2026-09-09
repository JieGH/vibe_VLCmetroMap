// Arrival Memory Store: Client-side cache, wall-clock countdown memory & Hub Seeder
// Manages the API rate budget, 60s memory pause, and minimal 3-hub initial network seeding.
import { Capacitor } from '@capacitor/core';
import metroData from '../data/metro_lines.json';
import imageLineColors from '../data/line_colors_from_image.json';
import paradasApi from '../data/paradas_api.json';

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

// 3 Strategic Hubs that cover all major corridors with minimal API calls.
// Every id here must be the station's id in paradas_api.json — 122 is Francesc
// Cubells, not Marítim, and seeding it left lines 5 and 7 with no live trains
// at all. `npm test` guards this.
export const STRATEGIC_HUBS = [
  { id: 17, name: 'Àngel Guimerà', lines: ['1', '2', '3', '5', '9'] },
  { id: 115, name: 'Marítim', lines: ['5', '6', '7', '8'] },
  { id: 33, name: 'Torrent', lines: ['1', '2', '7'] },
];

// Fetched together by a Network Sync. Four stations would cover all ten lines
// (Benimaclet, Torrent Avinguda, Dr. Lluch, Alacant); the rest are termini and
// interchanges added for geographic spread, because a train far from every
// queried station has a long chain to walk and accumulates more error.
export const MAJOR_STATIONS = [
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

// How often a Network Sync sweeps the Major Stations. Long enough to stay well
// inside the upstream rate budget, short enough that no prediction reaches the
// 18-minute age-out before being replaced. It lives here rather than with the
// timer that fires it because it is also the cadence a position's confidence is
// judged against: one interval unheard is healthy, more is not.
export const NETWORK_SYNC_INTERVAL_MS = 120000;

const CACHE_TTL_MS = 60000; // 60 seconds strict memory pause per station
const MIN_REFRESH_COOLDOWN_MS = 30000; // 30 seconds cooldown between manual refreshes
const MIN_DISPATCH_INTERVAL_MS = 1000; // 1 second minimum delay between outbound API requests
const DWELL_GRACE_PERIOD_MS = 40000; // 40 seconds dwell before train rolls off

// Propagation Lag — real-world observation (2026-09-09): the map displays vehicle
// positions behind their true location because the API timestamp already lags the
// physical train. Subtracting the lag from the Target Arrival Timestamp at fetch
// time moves the displayed position forward to match reality.
//   Metro lines (1–3, 5, 7–10): 15 s behind reality
//   Tram lines 4 and 6:         10 s behind reality
const METRO_PROPAGATION_LAG_MS = 15_000;
const TRAM_PROPAGATION_LAG_MS  = 10_000;
const TRAM_LINE_IDS = new Set(['4', '6']);

/** Returns the Propagation Lag in ms for a given line ID string. */
function propagationLagMs(lineId) {
  return TRAM_LINE_IDS.has(lineId) ? TRAM_PROPAGATION_LAG_MS : METRO_PROPAGATION_LAG_MS;
}


class ArrivalStore {
  constructor() {
    this.memory = new Map();
    this.inFlightRequests = new Map();
    this.listeners = new Set();
    this.lastRequestTimestamp = 0;
    this.rateLimitedUntil = 0;
    this.isSeedingHubs = false;
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
   * Seeds the network with the minimal 3-hub stations on initial map boot.
   * Dispatches sequentially with a 1.2s delay to respect rate limits.
   */
  async seedStrategicHubs() {
    if (this.isSeedingHubs) return;
    const now = Date.now();

    // Skip network seeding if memory already contains fresh predictions (< 60s)
    const hasFreshHubs = STRATEGIC_HUBS.every(h => {
      const entry = this.memory.get(String(h.id));
      return entry && (now - entry.fetchedAt) < CACHE_TTL_MS;
    });
    if (hasFreshHubs) return;

    this.isSeedingHubs = true;

    for (let i = 0; i < STRATEGIC_HUBS.length; i++) {
      const hub = STRATEGIC_HUBS[i];
      try {
        await this.getStationArrivals({ apiId: hub.id, name: hub.name }, { forceRefresh: false });
      } catch {
        // Continue to next hub on failure
      }
      if (i < STRATEGIC_HUBS.length - 1) {
        await new Promise(r => setTimeout(r, 1200));
      }
    }

    this.isSeedingHubs = false;
  }

  /**
   * Fetch every Major Station in one pass.
   *
   * Without this the map only ever holds the three boot hubs, so every live
   * train ages out roughly 18 minutes after load and the whole network silently
   * reverts to simulated trains. Stations still inside their memory pause cost
   * no request, so a repeat sync is cheap.
   */
  async syncNetwork() {
    if (this.isSyncingNetwork) return { fetched: 0, skipped: 0 };
    this.isSyncingNetwork = true;

    let fetched = 0;
    let skipped = 0;

    try {
      for (const station of MAJOR_STATIONS) {
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
      // Respect dispatch pacing between requests
      const timeSinceLast = Date.now() - this.lastRequestTimestamp;
      if (timeSinceLast < MIN_DISPATCH_INTERVAL_MS) {
        await new Promise(r => setTimeout(r, MIN_DISPATCH_INTERVAL_MS - timeSinceLast));
      }
      this.lastRequestTimestamp = Date.now();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      try {
        // The API requires a User-Agent containing contact=, which browser
        // fetch can never set (a forbidden header, unconditionally, in every
        // browser). A browser context has no way around that but a Node-side
        // relay, so it goes through the dev-server proxy below. The native
        // app has no such server to relay through, but CapacitorHttp (enabled
        // in capacitor.config.json) patches fetch to run over native
        // networking instead of the WebView's, which is not subject to the
        // forbidden-header list, so it can set User-Agent directly.
        const isNative = Capacitor.isNativePlatform();
        const url = isNative
          ? `https://metroapi.alexbadi.es/prevision/${stationId}/parse`
          : `/api/metro/prevision/${stationId}/parse`;
        const response = await fetch(url, {
          signal: controller.signal,
          headers: isNative
            ? { 'Accept': 'application/json', 'User-Agent': 'vib-metro-valencia/1.0 (Native iOS; contact=dev@example.com)' }
            : { 'Accept': 'application/json' },
        });

        if (!response.ok) {
          if (response.status === 429) {
            this.rateLimitedUntil = Date.now() + 20000; // 20s backoff
          }
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json().catch(() => null);
        if (data && Array.isArray(data.previsiones)) {
          const fetchTime = Date.now();
          const parsedArrivals = data.previsiones.map((p) => {
            const seconds = Number(p.seconds ?? 0);
            const lineId = String(p.line || p.line_id || '');
            const lineFeature = metroData.features.find(
              f => f.properties.line === lineId && f.geometry.type === 'LineString'
            );
            const lineName = lineFeature ? lineFeature.properties.name : `Line ${lineId}`;
            const defaultColor = lineFeature ? lineFeature.properties.color : (lineId === '1' ? '#FFD100' : lineId === '3' ? '#E2001A' : lineId === '5' ? '#00994D' : '#8F6DB8');
            const lineColor = (imageLineColors && imageLineColors[lineId]) ? imageLineColors[lineId] : defaultColor;

            // The API stamps each prediction with the absolute epoch it expects
            // the train to arrive. Preferring it over fetchTime + seconds keeps
            // countdowns honest when the client clock is off, and keeps two
            // sightings of the same train on one timeline so they can be fused.
            //
            // Propagation Lag correction: the API timestamp itself lags the
            // physical train (15 s for metro, 10 s for trams 4 & 6). Subtracting
            // the lag brings the displayed vehicle position forward to match reality.
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
              fetchError: 'Live update paused (rate limit). Showing countdown from earlier sync.',
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
        clearTimeout(timeoutId);
        this.inFlightRequests.delete(key);
      }
    })();

    this.inFlightRequests.set(key, fetchPromise);
    return fetchPromise;
  }
}

export const arrivalStore = new ArrivalStore();
export default arrivalStore;
