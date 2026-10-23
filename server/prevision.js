// The server's one upstream call: FGV's live prevision feed for a Station.
// `fetch` and the clock are injected so tests need no network, and so the
// next layer (hedging, coalescing, a shared cache) can wrap this call without
// touching the route. Node's built-in fetch reuses keep-alive connections to
// FGV by itself, which is what the Netlify-style per-request proxy lacked.
export const FGV_PREVISION_URL = 'https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3';
// The app abandons an attempt after 4 s, so FGV gets a little less than that.
export const DEADLINE_MS = 3500;

export function createPrevisionClient({
  fetch = globalThis.fetch,
  now = Date.now,
  baseUrl = FGV_PREVISION_URL,
  deadlineMs = DEADLINE_MS,
} = {}) {
  // Resolves to { status, body, contentType, fetchedAt }. FGV's status and body
  // pass through untouched; a hang or network failure becomes 504 / 502.
  return async function getPrevision(stationId) {
    try {
      const res = await fetch(`${baseUrl}/${stationId}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(deadlineMs),
      });
      return {
        status: res.status,
        body: await res.text(),
        contentType: res.headers.get('content-type') || 'application/json',
        fetchedAt: now(),
      };
    } catch (err) {
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return {
        status: timedOut ? 504 : 502,
        body: JSON.stringify({ error: timedOut ? 'FGV did not answer in time' : 'FGV unreachable' }),
        contentType: 'application/json',
        fetchedAt: now(),
      };
    }
  };
}
