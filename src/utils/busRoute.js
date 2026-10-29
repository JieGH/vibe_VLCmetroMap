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

/** The direction whose `trayecto` equals the given Bus GPS Stream string (trimmed), or null. */
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

/** A bus within this many metres past a stop still counts as at it (GPS jitter). */
export const AT_STOP_TOLERANCE_M = 15;

/**
 * How far a bus at `lonLat` is from `stopCode` along the direction.
 * Returns { stopsAway, distanceM } or null when the stop is not on this
 * direction or the bus has already passed it. `stopsAway` is the number of
 * stops the bus still serves before the target: 0 means the target is the
 * next (or current) stop, 1 means one stop in between.
 */
export function stopsAway(direction, lonLat, stopCode, opts) {
  const target = findStop(direction, stopCode);
  const proj = projectOnShape(direction, lonLat, opts);
  if (!target || !proj) return null;
  const from = proj.alongM - AT_STOP_TOLERANCE_M;
  if (target.alongM < from) return null;
  const between = direction.stops.filter((s) => s.alongM >= from && s.alongM < target.alongM).length;
  return { stopsAway: between, distanceM: Math.max(0, target.alongM - proj.alongM) };
}
