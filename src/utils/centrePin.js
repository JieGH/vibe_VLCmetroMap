import { getDistance } from './geoUtils';
import { visibleCentreLngLat } from './mapCamera';
import { isHubStation } from './returnContext';

/** Wait this long after the last gesture end before moving the centre pin. */
export const CENTRE_PIN_DEBOUNCE_MS = 250;
/** A centre that moved less than this from the current pin is jitter, not a pan. */
export const CENTRE_PIN_MIN_MOVE_M = 15;

/** True when `next` is far enough from `prev` to be worth a pin update (no prev always is). */
export const movedEnough = (prev, next, minMoveM = CENTRE_PIN_MIN_MOVE_M) =>
  !prev || getDistance(prev, next) >= minMoveM;

/**
 * The selection a centre pin publishes: the same "Map Ping" shape a map tap creates, so the hub,
 * nodes and walk radii work unchanged. Returns the station and its userLocation option.
 *
 * @param {[number, number]} coordinates - lng/lat
 * @param {number} fetchedAt
 * @param {object | null} [nearestStation]
 * @returns {{ station: object, userLocation: object }}
 */
export const buildCentrePing = (coordinates, fetchedAt, nearestStation = null) => ({
  station: {
    properties: { name: 'Map Ping', lines: [], isPin: true },
    geometry: { type: 'Point', coordinates },
    isPin: true,
  },
  userLocation: {
    coordinates,
    accuracy: 15,
    isMapClick: true,
    status: 'located',
    nearestStation,
    fetchedAt,
  },
});

/**
 * Debounced centre-pin updater. schedule() is called on every gesture end; once the map has been
 * still for the debounce it reads the visible centre and publishes it, unless it is within the
 * minimum move of the current pin.
 *
 * @param {object} args
 * @param {object} args.map - MapLibre-like (see visibleCentreLngLat)
 * @param {(coordinates: [number, number]) => void} args.publish
 * @param {() => [number, number] | null | undefined} args.getLast - current pin coordinates
 * @param {() => void} [args.onSettle] - runs when the debounce fires, whether or not the pin moved
 * @returns {{ schedule: (opts?: { force?: boolean }) => void, cancel: () => void }}
 */
export const createCentrePinSync = ({ map, publish, getLast, onSettle }) => {
  let timer = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  // `force` publishes even when the centre is within the jitter threshold (the press-time pin, which
  // sits on the fix by design).
  const schedule = ({ force = false } = {}) => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      onSettle?.();
      const centre = visibleCentreLngLat(map);
      if (force || movedEnough(getLast(), centre)) publish(centre);
    }, CENTRE_PIN_DEBOUNCE_MS);
  };
  return { schedule, cancel };
};

/** The pin only follows the map while a hub/ping is the thing on screen (not a station or stop sheet). */
export const isCentrePinActive = ({ centreMode, selectedStation, selectedBusStop }) =>
  Boolean(centreMode && !selectedBusStop && isHubStation(selectedStation));

/**
 * True when centre mode should end: the location was cleared, or neither a hub nor a stop opened from
 * one (return context) is showing, e.g. the hub was closed or a station was chosen from the map.
 */
export const shouldLeaveCentreMode = ({ centreMode, userLocation, selectedStation, selectedBusStop, hasReturnContext }) => {
  if (!centreMode) return false;
  if (!userLocation) return true;
  if (isHubStation(selectedStation)) return false;
  return !hasReturnContext;
};

/**
 * Lets the centre pin follow only hand gestures. MapLibre sets `originalEvent` on drag/pinch/wheel moves
 * and not on the app's own easeTo/fitBounds, whose moveend must not move the pin.
 *
 * `onUserStart` is for the gesture-start events (movestart, dragstart, zoomstart, rotatestart, ...): a
 * hand gesture that interrupts a programmatic ease still counts even if only one of them carries the
 * original event. Every moveend resets the flag, so one gesture never leaks into a later ease.
 *
 * @param {() => void} schedule - the debounced pin update
 */
export const createUserGestureGate = (schedule, { onHandStart, onHandMove } = {}) => {
  let byHand = false;
  return {
    onUserStart: (event) => {
      if (!event?.originalEvent) return;
      byHand = true;
      onHandStart?.();
    },
    // Fires on every camera frame of a hand gesture (for the throttled mid-drag update).
    onMove: () => { if (byHand) onHandMove?.(); },
    onMoveEnd: () => {
      const wasByHand = byHand;
      byHand = false;
      if (wasByHand) schedule();
    },
  };
};

/**
 * True when a selection/location change is only the centre pin moving (#136): the hub updates in
 * place, so neither camera ease (selection focus, locate framing) may run for it.
 */
export const isCentrePinRefresh = (userLocation) => Boolean(userLocation?.centrePin);
