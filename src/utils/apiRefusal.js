// Telling "my network is refused" apart from "the service is down" (issue #123).
// Pure logic, no fetch and no DOM: a classifier for one failed request, and a
// tracker that decides, from repeated evidence, that an API refuses this
// network, then paces the retries. The clock is injectable so tests need no timers.

/** Blocked answers older than this no longer count towards "refused". */
export const REFUSAL_WINDOW_MS = 60_000;
/** Blocked answers needed, from at least this many different stations. */
export const REFUSAL_MIN_EVENTS = 2;
export const REFUSAL_MIN_STATIONS = 2;
/** While refused, the wait before the next probe doubles from here up to the cap. */
export const BACKOFF_FIRST_MS = 30_000;
export const BACKOFF_MAX_MS = 300_000;

const BLOCKED_STATUSES = new Set([401, 403, 451]);

function isJson(text) {
  try { JSON.parse(text); return true; } catch { return false; }
}

/**
 * Sorts one failed request into blocked | rate-limited | server-error | unreachable.
 * Returns null when nothing failed (a good status with a JSON body).
 *
 * Not knowing what a blocked FGV IP really gets back, a non-JSON body on a 2xx
 * or 4xx answer (an HTML or captcha page) is read as a block. A 5xx is never a
 * block, nor is a timeout: about 6% of FGV requests hang (ADR-0005).
 *
 * @param {{ status?: number, body?: string, headers?: { get?: Function }, error?: unknown }} input
 * @returns {{ kind: string, status: number|null } | null}
 */
export function classifyFetchFailure({ status, body, headers, error } = {}) {
  if (error || typeof status !== 'number') return { kind: 'unreachable', status: null };
  if (BLOCKED_STATUSES.has(status)) return { kind: 'blocked', status };
  if (status === 429) return { kind: 'rate-limited', status };
  if (status >= 500) return { kind: 'server-error', status };
  if (/challenge|block/i.test(headers?.get?.('cf-mitigated') ?? '')) return { kind: 'blocked', status };
  if (typeof body === 'string' && body.trim() !== '' && !isJson(body)) return { kind: 'blocked', status };
  if (status >= 200 && status < 300) return null;
  return { kind: 'server-error', status };
}

/**
 * Decides when an API is refusing this network, and how often to knock again.
 * Refused turns on after REFUSAL_MIN_EVENTS blocked answers from at least
 * REFUSAL_MIN_STATIONS stations inside REFUSAL_WINDOW_MS, and off at the first
 * success. Rate limits, timeouts and server errors never count.
 */
export function createRefusalTracker({ now = () => Date.now() } = {}) {
  let events = []; // { at, station } of blocked answers since the last success
  let refused = false;
  let failedProbes = 0;
  let nextAttemptAt = 0;
  let probing = false;
  const listeners = new Set();

  const delayMs = () => Math.min(BACKOFF_FIRST_MS * 2 ** failedProbes, BACKOFF_MAX_MS);
  const emit = () => listeners.forEach((fn) => { try { fn(refused); } catch { /* ignore */ } });

  return {
    isRefused: () => refused,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    recordFailure(kind, station) {
      if (kind !== 'blocked') return;
      const t = now();
      if (refused) {
        // Only a failed probe lengthens the wait; stragglers from the sweep that
        // was already in flight when the verdict landed do not.
        if (probing) {
          probing = false;
          failedProbes += 1;
          nextAttemptAt = t + delayMs();
        }
        return;
      }
      events = events.filter((e) => t - e.at <= REFUSAL_WINDOW_MS);
      events.push({ at: t, station: String(station ?? '') });
      if (events.length >= REFUSAL_MIN_EVENTS && new Set(events.map((e) => e.station)).size >= REFUSAL_MIN_STATIONS) {
        refused = true;
        failedProbes = 0;
        probing = false;
        nextAttemptAt = t + delayMs();
        emit();
      }
    },

    recordSuccess() {
      events = [];
      failedProbes = 0;
      probing = false;
      nextAttemptAt = 0;
      if (refused) {
        refused = false;
        emit();
      }
    },

    /** True when a request may be sent now, without using up the probe. */
    canAttempt() {
      return !refused || now() >= nextAttemptAt;
    },

    /** Asks leave to send a request: while refused, one probe per backoff step; a forced one always goes. */
    tryAcquire({ force = false } = {}) {
      if (!refused) return true;
      if (!force && now() < nextAttemptAt) return false;
      probing = true;
      nextAttemptAt = now() + delayMs();
      return true;
    },

    /** Milliseconds until the next probe is allowed; 0 when not refused or due. */
    retryInMs() {
      return refused ? Math.max(0, nextAttemptAt - now()) : 0;
    },
  };
}
