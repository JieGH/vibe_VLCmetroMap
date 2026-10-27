// EMT València bus data: real stops from the official open data only.

import { getDistance } from '../utils/geoUtils';
import { WALK_RADIUS_BUS_METRES } from '../utils/walkRadius';
import { walkingMinutes } from '../utils/walking';
import REAL_EMT_STOPS from './emt_stops.json';
import { buildDisplayCoordinates, displayCoordinatesFor } from '../utils/stopOffsets';

// Real EMT bus stops come only from emt_stops.json (#122). Nothing here is
// invented: no arrival times, vehicle ids, destinations or default lines.
// Live times come from the EMT SAE service on demand (ADR-0011).

/**
 * A feeder (walk-set) entry for one real stop at `distance` metres. `lines`
 * are the stop's real line numbers as plain strings; a stop with no line data
 * has no chips. Times are never set here.
 */
export const feederFromStop = (stop, distance) => {
  const dist = Math.round(distance);
  return {
    stopCode: String(stop.stopCode || stop.code || ''),
    stopName: stop.stopName || stop.name || '',
    walkMetres: dist,
    walkMin: walkingMinutes(dist),
    bearingDegrees: 90,
    coordinates: stop.coordinates,
    lines: Array.isArray(stop.lines)
      ? stop.lines
          .map((l) => String(typeof l === 'object' && l !== null ? (l.line || l.id || '') : l))
          .filter(Boolean)
      : [],
  };
};

// Real EMT stops inside the walk radius of `stationCoords`, nearest first.
// Nothing else: a far-away click yields [].
export const getStationBusFeeders = (stationName, stationCoords) => {
  if (!stationName || !Array.isArray(stationCoords)) return [];
  return REAL_EMT_STOPS
    .map((stop) => ({ stop, dist: getDistance(stationCoords, stop.coordinates) }))
    .filter((item) => item.dist <= WALK_RADIUS_BUS_METRES)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 4)
    .map(({ stop, dist }) => feederFromStop(stop, dist));
};

const numericFirst = (a, b) => {
  const na = /^\d+$/.test(a);
  const nb = /^\d+$/.test(b);
  if (na && nb) return Number(a) - Number(b);
  if (na !== nb) return na ? -1 : 1;
  return a.localeCompare(b);
};

let realLinesCache = null;
// Searchable bus lines built from the line numbers that exist in emt_stops.json.
// No route geometry or headway is invented; `stops` are the real stops served.
export const getRealBusLines = () => {
  if (realLinesCache) return realLinesCache;
  const byLine = new Map();
  REAL_EMT_STOPS.forEach((stop) => {
    (stop.lines || []).forEach((l) => {
      const id = String(l);
      if (!byLine.has(id)) byLine.set(id, []);
      byLine.get(id).push({ code: String(stop.stopCode), stopCode: String(stop.stopCode), name: stop.stopName, coordinates: stop.coordinates });
    });
  });
  realLinesCache = [...byLine.keys()].sort(numericFirst).map((id) => ({
    id,
    number: id,
    name: `Línea ${id}`,
    type: 'bus',
    color: '#D62828',
    description: `EMT València · ${byLine.get(id).length} paradas`,
    stops: byLine.get(id),
  }));
  return realLinesCache;
};

export const getBusLine = (id) => getRealBusLines().find(l => l.id.toLowerCase() === String(id).toLowerCase());

export const getAllBusStops = () => {
  return REAL_EMT_STOPS;
};

// Display-only marker offsets (#106), computed once on first use. Real
// coordinates stay on the stop objects; only drawing uses these.
let stopDisplayOffsets = null;
export const getStopDisplayCoordinates = (stop) => {
  if (!stopDisplayOffsets) stopDisplayOffsets = buildDisplayCoordinates(REAL_EMT_STOPS);
  return displayCoordinatesFor(stop, stopDisplayOffsets);
};
