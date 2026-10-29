// React glue for the shared bus fleet store (issues #151, #152). `focused` is derived by the caller (a
// line 19 stop selected, or its chip tapped); nothing is fetched while it is false. Buses go to `onBuses`
// (a ref'd callback that feeds the map layer), never through React state, so a poll does not re-render
// the app. The board and the bus sheet read the same store through their own small hooks below.
import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { busFleet } from './busFleetStore';

export function useBusFleet({ focused, onBuses }) {
  const onBusesRef = useRef(onBuses);
  useEffect(() => { onBusesRef.current = onBuses; }, [onBuses]);

  useEffect(() => busFleet.subscribe((buses) => onBusesRef.current?.(buses)), []);

  useEffect(() => {
    let handle = null;
    let cleaned = false;
    if (Capacitor.isNativePlatform()) {
      Promise.resolve(CapApp.addListener('appStateChange', ({ isActive }) => busFleet.setForeground(isActive)))
        .then((h) => {
          handle = h;
          if (cleaned) h?.remove?.();
        })
        .catch(() => {});
    }
    return () => {
      cleaned = true;
      handle?.remove?.();
    };
  }, []);

  useEffect(() => {
    busFleet.setFocused(Boolean(focused));
    return () => busFleet.setFocused(false);
  }, [focused]);
}

/**
 * The nearest approaching line 19 bus for a stop ({ bus, stopsAway, distanceM }) or null. Re-reads on each poll.
 * `directionId` limits it to buses heading the same way as the stop's row (resolveStopDirection); null shows none.
 */
export function useNearestApproachingBus(stopCode, directionId = null, store = busFleet) {
  const code = stopCode ? String(stopCode) : '';
  const dir = directionId || null;
  const key = `${code}|${dir ?? ''}`;
  const read = () => (code && dir ? store.nearestApproaching(code, dir) : null);
  const [found, setFound] = useState(read);
  const [prevKey, setPrevKey] = useState(key);
  if (prevKey !== key) {
    setPrevKey(key);
    setFound(read());
  }
  useEffect(() => {
    if (!code || !dir) return undefined;
    return store.subscribe(() => {
      const next = store.nearestApproaching(code, dir);
      setFound((prev) => (
        (prev?.bus.id ?? null) === (next?.bus.id ?? null) && (prev?.stopsAway ?? null) === (next?.stopsAway ?? null)
          ? prev
          : next
      ));
    });
  }, [code, dir, store]);
  return code && dir ? found : null;
}

const pickBus = (buses, id) => buses.find((b) => b.id === id) || null;

/** The live bus with this id from the latest poll, or null once it is gone. Never another bus's state. */
export function useLiveBus(id, store = busFleet) {
  const [snap, setSnap] = useState(() => ({ id, bus: id ? pickBus(store.getBuses(), id) : null }));
  useEffect(() => {
    if (!id) return undefined;
    return store.subscribe((buses) => setSnap({ id, bus: pickBus(buses, id) }));
  }, [id, store]);
  if (!id) return null;
  return snap.id === id ? snap.bus : pickBus(store.getBuses(), id);
}
