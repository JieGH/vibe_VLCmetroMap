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

/** The nearest approaching line 19 bus for a stop ({ bus, stopsAway, distanceM }) or null. Re-reads on each poll. */
export function useNearestApproachingBus(stopCode, store = busFleet) {
  const code = stopCode ? String(stopCode) : '';
  const read = () => (code ? store.nearestApproaching(code) : null);
  const [found, setFound] = useState(read);
  const [prevCode, setPrevCode] = useState(code);
  if (prevCode !== code) {
    setPrevCode(code);
    setFound(read());
  }
  useEffect(() => {
    if (!code) return undefined;
    return store.subscribe(() => {
      const next = store.nearestApproaching(code);
      setFound((prev) => (
        (prev?.bus.id ?? null) === (next?.bus.id ?? null) && (prev?.stopsAway ?? null) === (next?.stopsAway ?? null)
          ? prev
          : next
      ));
    });
  }, [code, store]);
  return found;
}

/** The live bus with this id from the latest poll, or null once it is gone. */
export function useLiveBus(id, store = busFleet) {
  const pick = (buses) => buses.find((b) => b.id === id) || null;
  const [bus, setBus] = useState(() => (id ? pick(store.getBuses()) : null));
  useEffect(() => {
    if (!id) return undefined;
    return store.subscribe((buses) => setBus(pick(buses)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, store]);
  return id ? bus : null;
}
