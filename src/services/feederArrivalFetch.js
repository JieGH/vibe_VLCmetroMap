// Which feeder stops may fetch EMT arrivals right now (#109).
// A dense area has ~34 stops inside the walking shed, but the split view shows a handful
// of cards, so only the nearest batch is fetched and the rest wait until scrolled into view.
import { fetchStopArrivals } from './emtArrivalService';

// Cards that fit on screen without scrolling, with a little slack.
export const FEEDER_FETCH_BATCH = 8;

/**
 * Stop codes (nearest first) that may fetch now. Nothing while the bus list is out of
 * view (inactive) or the page is hidden.
 */
export function visibleFeederCodes(codes, { limit = FEEDER_FETCH_BATCH, active = true, pageHidden = false } = {}) {
  if (!active || pageHidden || !Array.isArray(codes)) return [];
  return codes.slice(0, Math.max(0, limit));
}

/**
 * Fetches arrivals for the given stops through the shared 20 s cache and in-flight dedupe,
 * so stops still fresh from an earlier anchor cost no request.
 * @returns {Promise<Object>} map of stop code -> arrivals (failed stops are left out)
 */
export async function fetchFeederArrivals(codes, options = {}) {
  const results = await Promise.allSettled(
    codes.map(async (code) => [code, await fetchStopArrivals(code, options)])
  );
  const map = {};
  for (const res of results) {
    if (res.status === 'fulfilled') map[res.value[0]] = res.value[1];
  }
  return map;
}
