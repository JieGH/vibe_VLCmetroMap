// Focus-driven poller for the live bus layer (issue #151, ADR-0011 + ADR-0014). No React, no map.
//
// The Bus GPS Stream is fetched ONLY while the line is focused AND the page is visible AND the app is in
// the foreground (Capacitor pause). First fetch is immediate on focus, then every BUS_POLL_INTERVAL_MS
// (the layer rewrites about every 30 s and getLineFleet has a 30 s TTL, so faster polls are identical
// anyway). It never starts by itself: nothing is fetched at app launch. On blur it stops at once, drops
// any in-flight answer, resets the tracker and tells the map to clear.
//
// Clock, timers, document and the fetch are injectable so the rules test with fake timers.
import { getLineFleet } from './busFleetService';
import { createBusTracker } from './busTracker';

export const BUS_POLL_INTERVAL_MS = 30000;

export function createBusFleetPoller({
  line = '19',
  fetchFleet = getLineFleet,
  tracker = createBusTracker(),
  onBuses = () => {},
  intervalMs = BUS_POLL_INTERVAL_MS,
  now = Date.now,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
  doc = typeof document !== 'undefined' ? document : null,
} = {}) {
  let focused = false;
  let foreground = true;
  let polling = false;
  let timer = null;
  let epoch = 0;

  const visible = () => !(doc && doc.hidden);
  const shouldPoll = () => focused && foreground && visible();

  async function poll(myEpoch) {
    try {
      const records = await fetchFleet(line);
      if (myEpoch !== epoch) return; // stopped meanwhile: drop the answer
      onBuses(tracker.update(Array.isArray(records) ? records : [], now()));
    } catch {
      // A failed poll keeps the markers as they are; the next interval retries.
    }
    if (myEpoch === epoch && polling) timer = setTimer(() => poll(myEpoch), intervalMs);
  }

  function start() {
    if (polling) return;
    polling = true;
    epoch += 1;
    poll(epoch);
  }

  function stop() {
    if (!polling) return;
    polling = false;
    epoch += 1;
    if (timer != null) clearTimer(timer);
    timer = null;
  }

  function sync() {
    if (shouldPoll()) start();
    else stop();
  }

  // Hidden only pauses polling (markers stay for when the page returns); losing focus clears them.
  const onVisibility = () => sync();
  if (doc) doc.addEventListener('visibilitychange', onVisibility);

  return {
    setFocused(next) {
      const value = Boolean(next);
      if (value === focused) return;
      focused = value;
      if (!focused) {
        stop();
        tracker.reset();
        onBuses([]);
        return;
      }
      sync();
    },
    setForeground(next) {
      foreground = Boolean(next);
      sync();
    },
    isPolling: () => polling,
    destroy() {
      focused = false;
      stop();
      if (doc) doc.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
