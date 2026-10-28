import { getDistance } from './geoUtils';
import { visibleCentreLngLat } from './mapCamera';

export { visibleCentreLngLat };

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
 * @returns {{ properties: object, geometry: object, isPin: true, userLocation: object }}
 */
export const buildCentrePing = (coordinates, fetchedAt, nearestStation = null) => ({
  properties: { name: 'Map Ping', lines: [], isPin: true },
  geometry: { type: 'Point', coordinates },
  isPin: true,
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
 * @returns {{ schedule: () => void, cancel: () => void }}
 */
export const createCentrePinSync = ({ map, publish, getLast, debounceMs = CENTRE_PIN_DEBOUNCE_MS }) => {
  let timer = null;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const schedule = () => {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      const centre = visibleCentreLngLat(map);
      if (movedEnough(getLast(), centre)) publish(centre);
    }, debounceMs);
  };
  return { schedule, cancel };
};
