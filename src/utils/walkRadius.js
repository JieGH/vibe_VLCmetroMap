// The one walking radius for a dropped pin or the viewer's position: the Metro
// Stations and EMT stops inside it are spawned on the map, listed in the
// "Where you're at" sheet and fetched for arrivals (ADR-0011). Derived from
// minutes and the single walking speed, so the displayed minutes agree.
import { getDistance } from './geoUtils';
import { WALKING_SPEED_MPS, walkingMinutes } from './walking';

export const WALK_RADIUS_MIN = 3;
export const WALK_RADIUS_METRES = WALK_RADIUS_MIN * 60 * WALKING_SPEED_MPS;
// A stop already shown stays until it is this much past the radius, so live
// tracking (#104) does not flicker nodes at the boundary.
// The nearest-item fallback never reaches beyond this (#122): a click kilometres
// from any stop must show nothing, not the nearest stop.
export const WALK_FALLBACK_MAX_METRES = 600;
export const WALK_RADIUS_HYSTERESIS_METRES = 20;

/**
 * The items within the walking radius of `origin`, nearest first, each with its
 * real distance and displayed walk minutes. Distance is to the item's real
 * coordinate (`getCoords`), never a display offset. `keep` is a Set of keys
 * shown last time. When nothing is inside, the single nearest item is returned
 * with `fallback: true` if it is within `fallbackMaxMetres` (default 600 m) and
 * `allowFallback` is not false (a map ping passes false); otherwise nothing.
 */
export const pickWalkSet = (items, origin, { getCoords, getKey, keep, allowFallback = true, fallbackMaxMetres = WALK_FALLBACK_MAX_METRES } = {}) => {
  if (!origin || !items?.length) return { items: [], fallback: false };
  const measured = [];
  for (const item of items) {
    const coords = getCoords(item);
    if (!Array.isArray(coords)) continue;
    const distance = getDistance(origin, coords);
    measured.push({ item, distance, walkMin: walkingMinutes(distance) });
  }
  measured.sort((a, b) => a.distance - b.distance);
  const inside = measured.filter(({ item, distance }) => {
    const limit = keep?.has(getKey(item)) ? WALK_RADIUS_METRES + WALK_RADIUS_HYSTERESIS_METRES : WALK_RADIUS_METRES;
    return distance <= limit;
  });
  if (inside.length > 0) return { items: inside, fallback: false };
  if (allowFallback && measured.length > 0 && measured[0].distance <= fallbackMaxMetres) {
    return { items: [measured[0]], fallback: true };
  }
  return { items: [], fallback: false };
};
