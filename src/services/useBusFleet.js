// React glue for the focus-driven bus poller (issue #151). `focused` is derived by the caller (a line 19
// stop selected, or its chip tapped); nothing is fetched while it is false. Buses go to `onBuses` (a ref'd
// callback that feeds the map layer), never through React state, so a poll does not re-render the app.
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { createBusFleetPoller } from './busFleetPoller';

export function useBusFleet({ focused, onBuses }) {
  const onBusesRef = useRef(onBuses);
  useEffect(() => { onBusesRef.current = onBuses; }, [onBuses]);
  const pollerRef = useRef(null);

  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  useEffect(() => {
    const poller = createBusFleetPoller({ onBuses: (buses) => onBusesRef.current?.(buses) });
    pollerRef.current = poller;
    poller.setFocused(Boolean(focusedRef.current));
    let handle = null;
    let cleaned = false;
    if (Capacitor.isNativePlatform()) {
      Promise.resolve(CapApp.addListener('appStateChange', ({ isActive }) => poller.setForeground(isActive)))
        .then((h) => {
          handle = h;
          if (cleaned) h?.remove?.();
        })
        .catch(() => {});
    }
    return () => {
      cleaned = true;
      handle?.remove?.();
      poller.destroy();
      pollerRef.current = null;
    };
  }, []);

  useEffect(() => {
    pollerRef.current?.setFocused(Boolean(focused));
  }, [focused]);
}
