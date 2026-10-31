import arrivalStore, { CACHE_TTL_MS } from './arrivalStore';
import { EMT_CACHE_TTL_MS, fetchStopArrivals, getEmtArrivalSnapshot } from './emtArrivalService';
import { journeyLegCalls } from './journeySession';

const normalized = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** Read-only schedule plus separate Line predictions; never identifies the passenger's Vehicle. */
export function createJourneyArrivals({ railMemory = arrivalStore,
  fetchBusArrivals = fetchStopArrivals, getBusSnapshot = getEmtArrivalSnapshot, now = Date.now,
  isVisible = () => typeof document === 'undefined' || !document.hidden } = {}) {
  let context = null;
  let disposed = false;
  let error = null;
  let unsubscribe = null;
  const pending = new Map();
  const listeners = new Set();
  const busCode = stop => /^emt:(\d+)$/.exec(String(stop?.stopId))?.[1] || null;
  const cachedFor = (leg, stop) => leg.mode === 'BUS' ? (busCode(stop) ? getBusSnapshot(busCode(stop)) : null) :
    railMemory.getCachedArrivals({ name: stop.name }, now());
  const getSnapshot = () => {
    if (!context) return { stop: null, predictions: [], isLoading: false, tripConfirmed: false };
    const { leg, stop, scheduledTime, key } = context;
    const cached = cachedFor(leg, stop);
    const at = now();
    const freshnessMs = leg.mode === 'BUS' ? EMT_CACHE_TTL_MS : CACHE_TTL_MS;
    const targetFor = arrival => leg.mode === 'BUS' ? cached.fetchedAt + arrival.dueSeconds * 1000 : arrival.targetTimestamp;
    const predictions = (cached?.arrivals || []).filter(arrival =>
      arrival.isLive === true &&
      String(arrival.line) === String(leg.route?.shortName) &&
      (!leg.route?.headsign || normalized(arrival.destination) === normalized(leg.route.headsign)) &&
      (leg.mode !== 'BUS' || arrival.dueSeconds > 0 || arrival.isDue) &&
      Number.isFinite(targetFor(arrival)) && targetFor(arrival) >= at).map(arrival => ({
      line: String(arrival.line), destination: arrival.destination,
      targetTimestamp: targetFor(arrival), seconds: Math.max(0, Math.ceil((targetFor(arrival) - at) / 1000)),
      source: cached.isFresh && at - cached.fetchedAt < freshnessMs && !cached.fetchError ? 'live' : 'stale', tripConfirmed: false,
    })).sort((a, b) => a.targetTimestamp - b.targetTimestamp);
    return { legId: leg.id, mode: leg.mode, line: leg.route?.shortName, stop, scheduledTime,
      predictions, tripConfirmed: false, isLoading: pending.has(key), error };
  };
  const publish = () => { if (!disposed) listeners.forEach(listener => listener(getSnapshot())); };
  return {
    select({ journey, legIndex = 0, callIndex = 0 } = {}) {
      const legs = journey?.legs || [];
      const next = legs.findIndex((leg, index) => index >= legIndex && leg.mode !== 'WALK');
      const leg = legs[next];
      const call = leg ? journeyLegCalls(leg)[next === legIndex ? callIndex : 0] : null;
      const key = call ? `${journey.id}:${leg.id}:${call.stopId || call.name}` : null;
      if (key !== context?.key) error = null;
      context = call ? { key, leg, stop: call, scheduledTime: call.departureTime ?? call.arrivalTime } : null;
      publish();
      return getSnapshot();
    },
    getSnapshot,
    refresh() {
      if (disposed || !context || !isVisible()) return Promise.resolve(getSnapshot());
      const selected = context;
      if (pending.has(selected.key)) return pending.get(selected.key);
      if (selected.leg.mode === 'BUS' && !busCode(selected.stop)) return Promise.resolve(getSnapshot());
      error = null;
      const work = (async () => {
        try {
          if (selected.leg.mode === 'BUS') await fetchBusArrivals(busCode(selected.stop));
          else await railMemory.getStationArrivals({ name: selected.stop.name });
          const cached = cachedFor(selected.leg, selected.stop);
          if (context?.key === selected.key && (!cached?.isFresh || cached.fetchError)) error = 'unavailable';
        } catch { if (context?.key === selected.key) error = 'unavailable'; }
      })().finally(() => { pending.delete(selected.key); publish(); });
      pending.set(selected.key, work);
      publish();
      return work.then(getSnapshot);
    },
    subscribe(listener) {
      listeners.add(listener);
      if (!unsubscribe) unsubscribe = railMemory.subscribe(publish);
      return () => {
        listeners.delete(listener);
        if (!listeners.size && unsubscribe) { unsubscribe(); unsubscribe = null; }
      };
    },
    dispose() { disposed = true; unsubscribe?.(); unsubscribe = null; listeners.clear(); context = null; },
  };
}
