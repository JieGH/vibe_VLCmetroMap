import arrivalStore from './arrivalStore';
import trainPositionEngine from './trainPositionEngine';

export const LEAD_SECONDS = 25;
export const MIN_AGE_MS = 20000;
export const MAX_PER_TICK = 2;
export const TICK_MS = 5000;
export const START_DELAY_MS = 8000;

/** The Station a train reaches after `stationName` on `lineId`, or null at the line's end. */
export function stationAfter(engine, lineId, stationName, isForward) {
  const chain = engine.getLineStations(lineId, isForward);
  const here = engine.findStation(lineId, stationName, isForward);
  if (!here) return null;
  const i = chain.indexOf(here);
  if (i < 0) return null;
  const next = chain[i + (isForward ? 1 : -1)];
  return next ? next.name : null;
}

/**
 * Station names worth refreshing now, most urgent first: for a train due at its target within LEAD_SECONDS,
 * the Station after it; for a dead-reckoned train, the target itself.
 */
export function candidates(trains, after) {
  const out = [];
  const seen = new Set();
  [...trains]
    .filter((t) => t.isLive)
    .sort((a, b) => a.secondsToTarget - b.secondsToTarget)
    .forEach((t) => {
      let name = null;
      if (t.isDeadReckoned) name = t.targetStation;
      else if (t.secondsToTarget <= LEAD_SECONDS) name = after(t.line, t.targetStation, t.isForward !== false);
      if (name && !seen.has(name)) {
        seen.add(name);
        out.push(name);
      }
    });
  return out;
}

export async function tick({
  engine = trainPositionEngine,
  store = arrivalStore,
  now = Date.now(),
} = {}) {
  const trains = engine.getLiveVehiclesFromMemory(now);
  const wanted = candidates(trains, (line, station, fwd) => stationAfter(engine, line, station, fwd))
    .map((name) => {
      const id = store.apiIdForName(name);
      if (id == null) return null;
      const age = store.ageMs(id, now);
      return age == null || age > MIN_AGE_MS ? { name, apiId: id } : null;
    })
    .filter(Boolean)
    .slice(0, MAX_PER_TICK);
  await Promise.all(
    wanted.map((st) => Promise.resolve(store.getStationArrivals(st, { forceRefresh: true })).catch(() => {}))
  );
  return wanted;
}

/** Starts the tracker; returns a stop function. Safe to call from an effect. */
export function startTrainTracker(options = {}) {
  let timer = null;
  let stopped = false;
  const loop = async () => {
    if (stopped) return;
    if (!(typeof document !== 'undefined' && document.hidden)) {
      try { await tick(options); } catch { /* next tick retries */ }
    }
    if (!stopped) timer = setTimeout(loop, TICK_MS);
  };
  timer = setTimeout(loop, START_DELAY_MS);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export default { startTrainTracker, tick, candidates, stationAfter };
