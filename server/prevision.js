// The server's one upstream call: FGV's live prevision feed for a Station.
// `fetch` and the clock are injected so tests need no network. Node's built-in
// fetch reuses keep-alive connections to FGV by itself, which is what the
// Netlify-style per-request proxy lacked. On top of that call sit:
//  - coalescing: concurrent requests for a Station share one upstream request
//  - hedging: an attempt FGV has not answered by HEDGE_AFTER_MS (about its p90)
//    gets one duplicate; the first answer wins and the loser is aborted
//  - a deadline, kept under the app's own 4 s attempt timeout
//  - a short shared cache, so many clients cost FGV one request per Station
//  - a cap on upstream requests in flight, across every client
export const FGV_PREVISION_URL = 'https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3';
export const DEADLINE_MS = 3500;
export const HEDGE_AFTER_MS = 1000;
export const SERVER_CACHE_TTL_MS = 10_000;
export const MAX_UPSTREAM_IN_FLIGHT = 4;

const failure = (status, error, now) => ({
  status,
  body: JSON.stringify({ error }),
  contentType: 'application/json',
  fetchedAt: now(),
});

export function createPrevisionClient({
  fetch = globalThis.fetch,
  now = () => Date.now(),
  baseUrl = FGV_PREVISION_URL,
  deadlineMs = DEADLINE_MS,
  hedgeAfterMs = HEDGE_AFTER_MS,
  cacheTtlMs = SERVER_CACHE_TTL_MS,
  maxInFlight = MAX_UPSTREAM_IN_FLIGHT,
} = {}) {
  const cache = new Map(); // stationId -> successful result
  const pending = new Map(); // stationId -> shared promise

  let inFlight = 0;
  const waiting = [];
  // Resolves once an upstream slot is free, or rejects if `signal` aborts first.
  function acquire(signal) {
    if (signal.aborted) return Promise.reject(signal.reason);
    if (inFlight < maxInFlight) {
      inFlight++;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const entry = { resolve: () => { signal.removeEventListener('abort', onAbort); resolve(); } };
      const onAbort = () => { waiting.splice(waiting.indexOf(entry), 1); reject(signal.reason); };
      signal.addEventListener('abort', onAbort, { once: true });
      waiting.push(entry);
    });
  }
  function release() {
    const next = waiting.shift();
    if (next) next.resolve(); // the slot passes straight to the next in line
    else inFlight--;
  }

  async function attempt(stationId, signal) {
    await acquire(signal);
    try {
      const res = await fetch(`${baseUrl}/${stationId}`, { headers: { Accept: 'application/json' }, signal });
      return {
        status: res.status,
        body: await res.text(),
        contentType: res.headers.get('content-type') || 'application/json',
        fetchedAt: now(),
      };
    } finally {
      release();
    }
  }

  // One upstream lookup with hedging and a deadline. FGV's status and body pass
  // through untouched; a hang becomes 504 and a network failure 502.
  function lookup(stationId) {
    return new Promise((resolve) => {
      const controllers = [];
      let settled = false;
      let started = 0;
      let failed = 0;
      let hedgeTimer;

      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(hedgeTimer);
        clearTimeout(deadlineTimer);
        controllers.forEach(c => c.abort()); // aborts the loser; a no-op for the winner
        resolve(result);
      };
      const start = () => {
        const controller = new AbortController();
        controllers.push(controller);
        started++;
        attempt(stationId, controller.signal).then(finish, () => {
          if (settled) return;
          failed++;
          // A failed first attempt is hedged at once; all attempts failed is a 502.
          if (started === 1) { clearTimeout(hedgeTimer); start(); }
          else if (failed === started) finish(failure(502, 'FGV unreachable', now));
        });
      };

      const deadlineTimer = setTimeout(() => finish(failure(504, 'FGV did not answer in time', now)), deadlineMs);
      hedgeTimer = setTimeout(() => { if (started === 1) start(); }, hedgeAfterMs);
      start();
    });
  }

  // Resolves to { status, body, contentType, fetchedAt }; fetchedAt is when FGV
  // answered, so a cached reply's age is `now() - fetchedAt`.
  return function getPrevision(stationId) {
    const cached = cache.get(stationId);
    if (cached) {
      if (now() - cached.fetchedAt < cacheTtlMs) return Promise.resolve(cached);
      cache.delete(stationId);
    }
    let shared = pending.get(stationId);
    if (!shared) {
      shared = lookup(stationId).then((result) => {
        // Only a good answer is worth sharing; an error status is passed on, not cached.
        if (result.status === 200) cache.set(stationId, result);
        return result;
      }).finally(() => pending.delete(stationId));
      pending.set(stationId, shared);
    }
    return shared;
  };
}
