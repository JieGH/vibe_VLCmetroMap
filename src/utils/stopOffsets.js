/**
 * Display-only offsets for EMT bus stop markers (#106).
 *
 * On a two-way avenue the stops of both directions are recorded near the road
 * centreline and render almost on top of each other. We pair opposite-direction
 * stops (same street/cross-street names, close together) and push each member
 * of a pair away from the other along the joining line, so each draws on its
 * own side of the road.
 *
 * The data carries no heading, so a stop with no partner is left exactly where
 * it is: no guessing which side is "right". The result only changes where a
 * marker is DRAWN. stopCode and real coordinates (walking distance, nearest
 * stop, arrivals fetch, ADR-0011) are never touched.
 */
import { getDistance } from './geoUtils';

/** Hard cap for how far any marker is drawn from its real position. */
export const MAX_OFFSET_METRES = 30; // was 12; stops sit further from the road centre, but 35 m put some in the block
/** Stops further apart than this are not considered a two-way pair. */
export const PAIR_MAX_METRES = 80;
/** Closer than this the joining line is meaningless; leave both alone. */
export const PAIR_MIN_METRES = 2;
/** Pairs are pushed until their drawn separation reaches this (or the cap). */
export const TARGET_SEPARATION_METRES = 86; // was 60; +13 m each side. The cap alone barely moved wider pairs

/**
 * Stops that must be drawn closer to their real position than the general cap, found in the field.
 * Only a listed stop is limited; a partner that is not listed keeps the normal push.
 */
export const STOP_OFFSET_CAP_OVERRIDES = {
  '1168': 1, // Comissaria Policia Local Marítim: drawn 25 m out, too far from the road
  '1613': 1, // Comissaria Policia Local Marítim (front): same
};

// Matches geoUtils.getDistance (haversine, R = 6371 km) so the cap is exact.
const METRES_PER_DEG_LAT = (6371000 * Math.PI) / 180;

const normalise = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "Cid - Nou d'Octubre" and "Nou d'Octubre - Cid" give the same key. */
const nameKey = (name) =>
  normalise(name)
    .split(' - ')
    .map((p) => p.trim())
    .filter(Boolean)
    .sort()
    .join('|');

const validCoords = (c) =>
  Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]);

/**
 * @param {Array<{stopCode: string|number, stopName: string, coordinates: number[]}>} stops
 * @returns {Map<string, number[]>} stopCode -> display [lng, lat], only for moved stops
 */
export function buildDisplayCoordinates(stops) {
  const result = new Map();
  const groups = new Map();
  for (const s of stops || []) {
    if (!s || !validCoords(s.coordinates)) continue;
    const key = nameKey(s.stopName);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }

  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const edges = [];
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const d = getDistance(members[i].coordinates, members[j].coordinates);
        if (d >= PAIR_MIN_METRES && d <= PAIR_MAX_METRES) {
          edges.push({ a: members[i], b: members[j], d });
        }
      }
    }
    // Closest first, ties broken by stopCode so input order never matters.
    edges.sort(
      (x, y) =>
        x.d - y.d ||
        String(x.a.stopCode).localeCompare(String(y.a.stopCode)) ||
        String(x.b.stopCode).localeCompare(String(y.b.stopCode)),
    );
    const used = new Set();
    for (const { a, b, d } of edges) {
      const ca = String(a.stopCode);
      const cb = String(b.stopCode);
      if (used.has(ca) || used.has(cb)) continue;
      const push = Math.min(MAX_OFFSET_METRES, Math.max(0, (TARGET_SEPARATION_METRES - d) / 2));
      // A pair that would not move must not block its members from pairing.
      if (push <= 0) continue;
      used.add(ca);
      used.add(cb);

      const cosLat = Math.cos((a.coordinates[1] * Math.PI) / 180);
      const mPerLng = METRES_PER_DEG_LAT * cosLat;
      const dx = (b.coordinates[0] - a.coordinates[0]) * mPerLng;
      const dy = (b.coordinates[1] - a.coordinates[1]) * METRES_PER_DEG_LAT;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const ux = dx / len;
      const uy = dy / len;
      const pushA = Math.min(push, STOP_OFFSET_CAP_OVERRIDES[ca] ?? push);
      const pushB = Math.min(push, STOP_OFFSET_CAP_OVERRIDES[cb] ?? push);
      result.set(ca, [
        a.coordinates[0] - (ux * pushA) / mPerLng,
        a.coordinates[1] - (uy * pushA) / METRES_PER_DEG_LAT,
      ]);
      result.set(cb, [
        b.coordinates[0] + (ux * pushB) / mPerLng,
        b.coordinates[1] + (uy * pushB) / METRES_PER_DEG_LAT,
      ]);
    }
  }
  return result;
}

/** Coordinates to DRAW this stop at; falls back to its real position. */
export function displayCoordinatesFor(stop, offsets) {
  const code = String(stop?.stopCode ?? stop?.code ?? '');
  return offsets?.get(code) || stop?.coordinates;
}
