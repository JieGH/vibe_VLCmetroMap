// One shared bus fleet store (issue #152): the single poller + tracker behind the map layer, the stop
// board and the bus sheet. Focus is still decided by the caller (a line 19 stop or the chip), so nothing
// is fetched until setFocused(true) (ADR-0011/0014). The poller is built lazily, on first use.
import { createBusFleetPoller } from './busFleetPoller';
import { createBusTracker } from './busTracker';

export function createBusFleetStore({
  createPoller = createBusFleetPoller,
  tracker = createBusTracker(),
  now = Date.now,
} = {}) {
  const listeners = new Set();
  let buses = [];
  let poller = null;
  let lastResponseAt = null;
  let error = false;
  const statusListeners = new Set();
  // The bus each board row refers to, per row owner; the latest claim wins (map emphasis only).
  const claims = new Map();
  const nextBusListeners = new Set();

  const status = () => ({ lastResponseAt, error, empty: lastResponseAt != null && !error && buses.length === 0 });
  const notifyStatus = () => { const s = status(); statusListeners.forEach((fn) => fn(s)); };
  const nextBus = () => {
    let last = null;
    claims.forEach((v) => { last = v; });
    return last;
  };

  function ensurePoller() {
    if (!poller) {
      poller = createPoller({
        tracker,
        onBuses: (next) => {
          buses = next;
          listeners.forEach((fn) => fn(buses));
          notifyStatus();
        },
        onResponse: () => { lastResponseAt = now(); error = false; notifyStatus(); },
        onError: () => { error = true; notifyStatus(); },
      });
    }
    return poller;
  }

  return {
    setFocused(focused) {
      ensurePoller().setFocused(focused);
      if (!focused && (lastResponseAt != null || error)) {
        lastResponseAt = null;
        error = false;
        notifyStatus();
      }
    },
    setForeground: (foreground) => ensurePoller().setForeground(foreground),
    subscribe(fn) {
      listeners.add(fn);
      if (buses.length > 0) fn(buses);
      return () => { listeners.delete(fn); };
    },
    getBuses: () => buses,
    /** { lastResponseAt, error, empty }: empty only after a good response with no live bus (never on error). */
    getStatus: status,
    subscribeStatus(fn) {
      statusListeners.add(fn);
      return () => { statusListeners.delete(fn); };
    },
    getNextBus: nextBus,
    /** A board row claims (or, with null, releases) the bus it shows: { busId, stopsAway }. */
    setNextBus(owner, info) {
      const before = nextBus();
      if (info) { claims.delete(owner); claims.set(owner, info); } else claims.delete(owner);
      const after = nextBus();
      if (before?.busId === after?.busId && before?.stopsAway === after?.stopsAway) return;
      nextBusListeners.forEach((fn) => fn(after));
    },
    subscribeNextBus(fn) {
      nextBusListeners.add(fn);
      return () => { nextBusListeners.delete(fn); };
    },
    nearestApproaching: (stopCode, directionId = null) => tracker.nearestApproaching(stopCode, now(), directionId),
  };
}

export const busFleet = createBusFleetStore();
