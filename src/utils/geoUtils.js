// Helper functions for geospatial calculations along polylines

// Haversine distance in meters between two [lon, lat] points
export const getDistance = (p1, p2) => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((p2[1] - p1[1]) * Math.PI) / 180;
  const dLon = ((p2[0] - p1[0]) * Math.PI) / 180;
  const lat1 = (p1[1] * Math.PI) / 180;
  const lat2 = (p2[1] * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const polylineCache = new WeakMap();

const getPolylineDistances = (coords) => {
  if (polylineCache.has(coords)) {
    return polylineCache.get(coords);
  }

  const cumulative = [0];
  let total = 0;

  for (let i = 0; i < coords.length - 1; i++) {
    const dist = getDistance(coords[i], coords[i + 1]);
    total += dist;
    cumulative.push(total);
  }

  const result = { cumulative, total };
  polylineCache.set(coords, result);
  return result;
};

// Fast binary-search polyline interpolation given progress t from 0 to 1
export const interpolatePath = (coords, t) => {
  if (!coords || coords.length === 0) return [0, 0];
  if (coords.length === 1) return coords[0];

  const progress = Math.max(0, Math.min(1, t));
  const { cumulative, total } = getPolylineDistances(coords);

  if (total === 0) return coords[0];

  const targetDist = progress * total;

  // Binary search for the segment
  let low = 0;
  let high = cumulative.length - 1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (cumulative[mid] <= targetDist) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const idx = Math.max(0, high);
  if (idx >= coords.length - 1) return coords[coords.length - 1];

  const segStartDist = cumulative[idx];
  const segEndDist = cumulative[idx + 1];
  const segLen = segEndDist - segStartDist;

  const segProgress = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;
  const p1 = coords[idx];
  const p2 = coords[idx + 1];

  return [
    p1[0] + (p2[0] - p1[0]) * segProgress,
    p1[1] + (p2[1] - p1[1]) * segProgress
  ];
};
