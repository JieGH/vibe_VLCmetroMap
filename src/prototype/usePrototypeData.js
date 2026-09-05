// PROTOTYPE — throwaway. See ./README.md.
//
// One read-only feed of real data for all three variants, so each is judged on
// real density rather than lorem ipsum. Data fetching lives here, above the
// switcher; only the rendered subtree changes per variant.
import { useEffect, useState } from 'react';
import arrivalStore, { MAJOR_STATIONS, NETWORK_SYNC_INTERVAL_MS } from '../services/arrivalStore';
import trainPositionEngine from '../services/trainPositionEngine';
import lineColors from '../data/line_colors_from_image.json';
import metroData from '../data/metro_lines.json';

export const lineColor = (id) => lineColors[String(id)] || '#8a8a8a';

export const lineName = (id) => {
  const f = metroData.features.find(
    (x) => x.properties && x.properties.line === String(id) && x.geometry.type === 'LineString'
  );
  return f ? f.properties.name : `Line ${id}`;
};

// Every line the network runs, for the variants that show network-wide state.
export const ALL_LINES = Array.from({ length: 10 }, (_, i) => String(i + 1));

/** "4 min" / "<1 min" / "Due" — the countdown convention, in one place. */
export const countdown = (seconds) => {
  if (seconds <= 0) return 'Due';
  if (seconds < 60) return '<1 min';
  return `${Math.round(seconds / 60)} min`;
};

/** The same arrival as a wall clock time, for variants that show both. */
export const clockTime = (timestamp) =>
  new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function usePrototypeData() {
  const [now, setNow] = useState(Date.now());
  const [, forceRender] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const bump = () => { if (!cancelled) forceRender((n) => n + 1); };
    const unsubscribe = arrivalStore.subscribe(bump);

    (async () => {
      await arrivalStore.seedStrategicHubs();
      await arrivalStore.syncNetwork();
    })();

    const sync = setInterval(() => arrivalStore.syncNetwork(), NETWORK_SYNC_INTERVAL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);

    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(sync);
      clearInterval(tick);
    };
  }, []);

  const stations = MAJOR_STATIONS.map((s) => {
    const cached = arrivalStore.getCachedArrivals({ apiId: s.id, name: s.name }, now);
    return {
      ...s,
      arrivals: cached ? cached.arrivals : [],
      fetchedAt: cached ? cached.fetchedAt : null,
    };
  });

  const departures = stations
    .flatMap((s) => s.arrivals.map((a) => ({ ...a, stationName: s.name })))
    .sort((a, b) => a.seconds - b.seconds);

  const vehicles = trainPositionEngine.getAllVehicles(now);
  const live = vehicles.filter((v) => v.isLive);
  const lastSyncAt = stations.reduce((max, s) => Math.max(max, s.fetchedAt || 0), 0);

  return { now, stations, departures, vehicles, live, lastSyncAt };
}
