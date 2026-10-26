// EMT València SAE Real-Time Bus Arrival Service
// ADR-0011 & Issue #87: On-demand stop arrival predictions with 20s TTL caching & deduplication.

export const EMT_CACHE_TTL_MS = 20000;
export const EMT_TIMEOUT_MS = 4500;
export const EMT_SAE_BASE_URL = 'https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php';

// In-memory cache: stopCode -> { arrivals: Array, timestamp: number }
const emtCache = new Map();

// In-flight deduplication: stopCode -> Promise<Array>
const inFlightRequests = new Map();

/**
 * Normalizes a bus stop code, stripping "P-" prefixes and whitespace.
 * e.g. "P-2261" -> "2261", 2261 -> "2261".
 */
export function normalizeStopCode(stopCode) {
  if (stopCode === null || stopCode === undefined) return '';
  const str = String(stopCode).trim();
  return str.replace(/^P-/i, '').trim();
}

/**
 * Strips XML CDATA wrappers and trims surrounding whitespace.
 */
export function cleanCdata(text) {
  if (!text) return '';
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim();
}

/**
 * Extracts content from an XML element chunk using regex.
 */
function extractTagContent(chunk, tagName) {
  const match = chunk.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'));
  if (!match) return '';
  return cleanCdata(match[1]);
}

/**
 * Helper to retrieve fallback arrivals from cache or an empty array.
 */
function getFallbackArrivals(code) {
  if (emtCache.has(code)) {
    return emtCache.get(code).arrivals;
  }
  return [];
}

/**
 * Converts EMT wait-time representations into normalized countdown seconds.
 * - "Pròxim" / "Próximo" -> 30 seconds (isDue: true)
 * - "X min." / "X min" / "X" -> X * 60 seconds
 * - "HH:MM" -> delta seconds until target time (handling midnight crossover vs delayed arrivals)
 */
export function calculateDueSeconds(minutos, horaLlegada, now = new Date()) {
  const cleanMin = cleanCdata(minutos);
  const cleanHora = cleanCdata(horaLlegada);

  // 1. "Pròxim" / "Próximo" check
  if (/^pr[oòó]xim[oa]?$/i.test(cleanMin)) {
    return { dueSeconds: 30, minutes: 0, isDue: true };
  }

  // 2. "X min.", "X min" or plain integer "X"
  const minMatch = cleanMin.match(/^(\d+)(?:\s*min\.?)?$/i);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    const dueSeconds = mins * 60;
    return {
      dueSeconds,
      minutes: mins,
      isDue: dueSeconds <= 60,
    };
  }

  // 3. Clock time HH:MM (for late-night arrivals)
  const clockMatch = cleanHora.match(/^(\d{1,2}):(\d{2})$/);
  if (clockMatch) {
    const hh = parseInt(clockMatch[1], 10);
    const mm = parseInt(clockMatch[2], 10);
    const target = new Date(now.getTime());
    target.setHours(hh, mm, 0, 0);

    // Midnight rollover: target is early morning (< 06:00) while current time is late evening (>= 20:00)
    if (hh < 6 && now.getHours() >= 20) {
      target.setDate(target.getDate() + 1);
    }

    const diffSec = Math.round((target.getTime() - now.getTime()) / 1000);
    // Overdue/delayed arrivals clamp to 0 seconds (isDue: true)
    const dueSeconds = Math.max(0, diffSec);
    const minutes = Math.round(dueSeconds / 60);
    return {
      dueSeconds,
      minutes,
      isDue: dueSeconds <= 60,
    };
  }

  return { dueSeconds: null, minutes: null, isDue: false };
}

/**
 * Resiliently parses EMT SAE XML payload into structured arrival objects.
 * Handles CDATA wrappers, missing fields, error tags, and decoy error payloads.
 */
export function parseEmtArrivalXml(xmlString, now = new Date()) {
  if (!xmlString || typeof xmlString !== 'string') return [];

  // Check for municipal decoy anti-scraping response
  if (/Temporalment no disponible/i.test(xmlString)) {
    return [];
  }

  const busBlocks = xmlString.match(/<bus[\s>][\s\S]*?<\/bus>/gi) || [];
  const arrivals = [];

  for (const block of busBlocks) {
    const line = extractTagContent(block, 'linea');
    const errorText = extractTagContent(block, 'error');

    // Skip empty lines or lines flagged with errors (e.g. SENSE ESTIMACIONS)
    if (!line || errorText) continue;

    const destination = extractTagContent(block, 'destino');
    const minutos = extractTagContent(block, 'minutos');
    const horaLlegada = extractTagContent(block, 'horaLlegada');
    const adaptado = extractTagContent(block, 'adaptado');

    const wheelchair = adaptado === '1' || /^(true|si)$/i.test(adaptado);
    const timing = calculateDueSeconds(minutos, horaLlegada, now);

    arrivals.push({
      line,
      destination,
      dueSeconds: timing.dueSeconds !== null ? timing.dueSeconds : 0,
      minutes: timing.minutes !== null ? timing.minutes : 0,
      isDue: timing.isDue,
      isLive: true,
      wheelchair,
    });
  }

  // Sort arrivals in ascending order of arrival time
  arrivals.sort((a, b) => a.dueSeconds - b.dueSeconds);
  return arrivals;
}

/**
 * Clears the in-memory EMT arrival cache and cancels any tracking in flight.
 */
export function clearEmtCache() {
  emtCache.clear();
  inFlightRequests.clear();
}

/**
 * Returns currently cached arrivals for a stop if not expired, or null.
 */
export function getEmtCachedArrivals(stopCode) {
  const code = normalizeStopCode(stopCode);
  if (!code || !emtCache.has(code)) return null;
  const entry = emtCache.get(code);
  if (Date.now() - entry.timestamp < EMT_CACHE_TTL_MS) {
    return entry.arrivals;
  }
  return null;
}

/**
 * Fetches real-time bus arrivals for a stop code from EMT's public SAE endpoint.
 * Enforces 20-second TTL caching, in-flight deduplication, and resilient error handling.
 *
 * @param {string|number} stopCode - EMT stop number (e.g. 2261, "P-2261")
 * @param {Object} [options]
 * @param {boolean} [options.forceRefresh=false] - Bypass cache read
 * @param {number} [options.timeoutMs=EMT_TIMEOUT_MS] - Network timeout
 * @param {Function} [options.fetchFn] - Custom fetch implementation
 * @param {Date} [options.now] - Base reference date for clock parsing
 * @returns {Promise<Array>} List of structured arrival objects
 */
export async function fetchStopArrivals(stopCode, options = {}) {
  const code = normalizeStopCode(stopCode);
  if (!code) return [];

  const {
    forceRefresh = false,
    timeoutMs = EMT_TIMEOUT_MS,
    fetchFn = (typeof globalThis !== 'undefined' && globalThis.fetch) ? globalThis.fetch : fetch,
    now = new Date(),
  } = options;

  // 1. Check in-memory cache
  if (!forceRefresh && emtCache.has(code)) {
    const entry = emtCache.get(code);
    if (Date.now() - entry.timestamp < EMT_CACHE_TTL_MS) {
      return entry.arrivals;
    }
  }

  // 2. Check in-flight deduplication
  if (inFlightRequests.has(code)) {
    return inFlightRequests.get(code);
  }

  // 3. Initiate new fetch
  const requestPromise = (async () => {
    const url = `${EMT_SAE_BASE_URL}?sec=getSAE&parada=${encodeURIComponent(code)}&adaptados=false&idioma=va`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const headers = {
      Accept: 'application/xml, text/xml, */*',
    };
    if (typeof navigator === 'undefined' || typeof window === 'undefined') {
      headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    try {
      const response = await fetchFn(url, {
        signal: controller.signal,
        headers,
      });

      if (!response.ok) {
        return getFallbackArrivals(code);
      }

      const xmlText = await response.text();

      if (/Temporalment no disponible/i.test(xmlText)) {
        return getFallbackArrivals(code);
      }

      const arrivals = parseEmtArrivalXml(xmlText, now);
      emtCache.set(code, {
        arrivals,
        timestamp: Date.now(),
      });
      return arrivals;
    } catch {
      // Graceful fallback on network timeout or abort
      return getFallbackArrivals(code);
    } finally {
      clearTimeout(timer);
      inFlightRequests.delete(code);
    }
  })();

  inFlightRequests.set(code, requestPromise);
  return requestPromise;
}
