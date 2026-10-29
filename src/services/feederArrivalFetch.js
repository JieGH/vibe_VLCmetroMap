// Which feeder stops may fetch EMT arrivals right now (#109).
// A dense area has ~34 stops inside the walking shed, but the split view shows a handful
// of cards, so only the nearest batch is fetched and the rest wait until scrolled into view.
import { fetchStopArrivals } from './emtArrivalService';

// Cards that fit on screen without scrolling, with a little slack.
export const FEEDER_FETCH_BATCH = 4;

/**
 * Stop codes (nearest first) that may fetch now. Nothing while the bus list is out of
 * view (inactive) or the page is hidden.
 */
export function visibleFeederCodes(codes, { limit = FEEDER_FETCH_BATCH, active = true, pageHidden = false } = {}) {
  if (!active || pageHidden || !Array.isArray(codes)) return [];
  return codes.slice(0, Math.max(0, limit));
}

// Requests in flight at once, so the nearest stops are not queued behind far ones (browsers
// allow about 6 connections per host, and the rest of the app shares them).
export const FEEDER_FETCH_CONCURRENCY = 4;

/**
 * Fetches arrivals for the given stops (nearest first) through the shared 20 s cache and
 * in-flight dedupe, so stops still fresh from an earlier anchor cost no request. At most
 * `concurrency` requests run at once, started in the order given. `onArrivals(code, arrivals)`
 * fires as each stop answers, so a slow stop never holds the others back. `shouldContinue()` is
 * checked before each request starts, so a caller whose position moved on stops queueing old stops.
 * A stop that fails normally answers with its cached or empty arrivals; one that throws is left out.
 * @returns {Promise<Object>} map of stop code -> arrivals
 */
export async function fetchFeederArrivals(codes, options = {}) {
  const { onArrivals, shouldContinue = () => true, concurrency = FEEDER_FETCH_CONCURRENCY, ...fetchOptions } = options;
  const map = {};
  let next = 0;
  const worker = async () => {
    while (next < codes.length && shouldContinue()) {
      const code = codes[next];
      next += 1;
      try {
        const arrivals = await fetchStopArrivals(code, fetchOptions);
        map[code] = arrivals;
        if (onArrivals) onArrivals(code, arrivals);
      } catch {
        // a failed stop is left out; the others carry on
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), codes.length) }, worker));
  return map;
}

/**
 * Latest-wins guard for the hub's background bus fetch (#136): each pin position takes a ticket,
 * and a response is applied only while its ticket is still the newest, so a slow answer for a
 * position the pin has left never overwrites the current one.
 */
export function createLatestGuard() {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (ticket) => ticket === latest,
    invalidate: () => { latest += 1; },
  };
}
