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

  function ensurePoller() {
    if (!poller) {
      poller = createPoller({
        tracker,
        onBuses: (next) => {
          buses = next;
          listeners.forEach((fn) => fn(buses));
        },
      });
    }
    return poller;
  }

  return {
    setFocused: (focused) => ensurePoller().setFocused(focused),
    setForeground: (foreground) => ensurePoller().setForeground(foreground),
    subscribe(fn) {
      listeners.add(fn);
      if (buses.length > 0) fn(buses);
      return () => { listeners.delete(fn); };
    },
    getBuses: () => buses,
    nearestApproaching: (stopCode) => tracker.nearestApproaching(stopCode, now()),
  };
}

export const busFleet = createBusFleetStore();
