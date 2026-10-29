// Line 19 route shape helpers (issue #149, spec #146, ADR-0014).
// Pure functions over the static data in src/data/line19_route.json: one
// polyline per direction plus its ordered stops. Used for optional position
// smoothing and "stops away"; heading never comes from here (ADR-0014).

import route from '../data/line19_route.json';

const R = 6371008.8;
const RAD = Math.PI / 180;

/** Metres between two [lon, lat] points (haversine). */
export function distanceM(a, b) {
  const dLat = (b[1] - a[1]) * RAD;
  const dLon = (b[0] - a[0]) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** The static line 19 data: { line, directions: [{ id, trayecto, polyline, stops, lengthM }] }. */
export function getLine19Route() {
  return route;
}

/**
 * The direction whose `trayecto` equals the given Bus GPS Stream string
 * (trimmed, exact match), or null for anything else (unknown, reversed or
 * non-string values). This is the only safe way to pick the direction to
 * project onto: the line is a loop and the shapes of the two directions run
 * close together.
 */
export function directionForTrayecto(trayecto, data = route) {
  const t = String(trayecto || '').trim();
  return data.directions.find((d) => d.trayecto === t) || null;
}

const cumCache = new WeakMap();

function cumulative(polyline) {
  let cum = cumCache.get(polyline);
  if (!cum) {
    cum = [0];
    for (let i = 1; i < polyline.length; i++) cum.push(cum[i - 1] + distanceM(polyline[i - 1], polyline[i]));
    cumCache.set(polyline, cum);
  }
  return cum;
}

/**
 * Project a [lon, lat] point onto a direction's polyline.
 * Returns { alongM, offsetM, point } : metres from the start of the polyline to
 * the nearest point on it, the distance from `lonLat` to that point, and the
 * point itself. `opts.hintAlongM` with `opts.windowM` (default 500) restricts
 * the search to that stretch, which disambiguates streets used twice.
 *
 * Reliability: without a hint the projection is NOT reliable on this loop (16%
 * of the recorded fixes are closer to the opposite direction's shape, and
 * streets are used twice within one direction). Callers must (1) take the
 * direction from `directionForTrayecto`, never by nearest shape, and (2) pass
 * `hintAlongM` (the previous fix's alongM) whenever a previous fix exists.
 */
export function projectOnShape(direction, lonLat, opts = {}) {
  const { polyline } = direction;
  const cum = cumulative(polyline);
  const lo = opts.hintAlongM == null ? -Infinity : opts.hintAlongM - (opts.windowM ?? 500);
  const hi = opts.hintAlongM == null ? Infinity : opts.hintAlongM + (opts.windowM ?? 500);
  const kx = Math.cos(lonLat[1] * RAD);
  let best = null;
  for (let i = 0; i < polyline.length - 1; i++) {
    if (cum[i + 1] < lo || cum[i] > hi) continue;
    const a = polyline[i];
    const b = polyline[i + 1];
    const dx = (b[0] - a[0]) * kx;
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (((lonLat[0] - a[0]) * kx) * dx + (lonLat[1] - a[1]) * dy) / len2));
    const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const offsetM = distanceM(lonLat, point);
    if (!best || offsetM < best.offsetM) {
      best = { alongM: cum[i] + (cum[i + 1] - cum[i]) * t, offsetM, point };
    }
  }
  return best;
}

/** Metres along the direction's polyline for a point (shortcut for projectOnShape). */
export function alongShapeM(direction, lonLat, opts) {
  const p = projectOnShape(direction, lonLat, opts);
  return p ? p.alongM : null;
}

/** The stop with `stopCode` in a direction, or null. */
export function findStop(direction, stopCode) {
  return direction.stops.find((s) => s.stopCode === String(stopCode)) || null;
}

/** A bus farther than this from its direction's shape is off route (detour, wrong direction): no stops-away. */
export const OFF_ROUTE_M = 50;

/** A stop counts as passed only once the bus is more than this many metres beyond it (GPS jitter). */
export const PASSED_HYSTERESIS_M = 10;

/** True when a bus at `busAlongM` has passed a stop at `stopAlongM`: strictly more than the hysteresis beyond it. */
function isPassed(busAlongM, stopAlongM) {
  return busAlongM > stopAlongM + PASSED_HYSTERESIS_M;
}

/**
 * How far a bus at `lonLat` is from `stopCode` along the direction.
 * - null: unknown stop code for this direction, or the bus is off route
 *   (projection farther than OFF_ROUTE_M from the shape).
 * - { passed: true, stopsAway: null, distanceM: 0 }: the bus is already more
 *   than PASSED_HYSTERESIS_M beyond the target stop.
 * - { passed: false, stopsAway, distanceM }: `stopsAway` is the number of
 *   not-yet-passed stops strictly before the target, so 0 means the target is
 *   the bus's next stop (or the bus is at it, within the hysteresis) and 1
 *   means one more stop is served first. A bus exactly at stop N is 0 from N
 *   and 1 from N+1. `distanceM` is metres along the shape to the target (>= 0).
 * Monotonic: as the bus advances along the shape, stopsAway never increases
 * and `passed` never reverts. Pass `opts.hintAlongM` (see projectOnShape).
 */
export function stopsAway(direction, lonLat, stopCode, opts) {
  const target = findStop(direction, stopCode);
  if (!target) return null;
  const proj = projectOnShape(direction, lonLat, opts);
  if (!proj || proj.offsetM > OFF_ROUTE_M) return null;
  if (isPassed(proj.alongM, target.alongM)) return { passed: true, stopsAway: null, distanceM: 0 };
  const between = direction.stops.filter((s) => s.alongM < target.alongM && !isPassed(proj.alongM, s.alongM)).length;
  return { passed: false, stopsAway: between, distanceM: Math.max(0, target.alongM - proj.alongM) };
}

/**
 * The point `m` metres along the direction's polyline (clamped to its ends)
 * and the bearing of the segment it lies on, degrees clockwise from north
 * [0, 360). For drawing/smoothing only; heading of a live bus never comes from
 * here (ADR-0014).
 */
export function pointAtAlongM(direction, m) {
  const { polyline } = direction;
  const cum = cumulative(polyline);
  const x = Math.max(0, Math.min(cum[cum.length - 1], m));
  let i = 1;
  while (i < polyline.length - 1 && cum[i] < x) i++;
  const a = polyline[i - 1];
  const b = polyline[i];
  const seg = cum[i] - cum[i - 1];
  const t = seg === 0 ? 0 : (x - cum[i - 1]) / seg;
  const dx = (b[0] - a[0]) * Math.cos(a[1] * RAD);
  const dy = b[1] - a[1];
  const bearingDeg = (Math.atan2(dx, dy) / RAD + 360) % 360;
  return { lonLat: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearingDeg };
}

/**
 * The next stop for a bus `alongM` metres along the direction: the first stop
 * not yet passed (same rule and hysteresis as stopsAway). Returns
 * { stop, index, distanceM } or null when every stop is passed.
 */
export function nextStop(direction, alongM) {
  const index = direction.stops.findIndex((s) => !isPassed(alongM, s.alongM));
  if (index < 0) return null;
  const stop = direction.stops[index];
  return { stop, index, distanceM: Math.max(0, stop.alongM - alongM) };
}
