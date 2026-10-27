import region from '../data/map_region.json';

/** [west, south, east, north] of the one region the app shows (#118). Also read by scripts/fetch_basemap.cjs. */
export const MAP_REGION_BBOX = region.bbox;
/** The same box as MapLibre `maxBounds`: [[west, south], [east, north]]. */
export const MAP_REGION_BOUNDS = [
  [region.bbox[0], region.bbox[1]],
  [region.bbox[2], region.bbox[3]],
];

/** MapLibre's vector tile size: the world is this many px wide at zoom 0. */
const TILE_SIZE = 512;
/** Phone portrait, used until the container has been measured. */
const FALLBACK_VIEWPORT = { width: 390, height: 844 };

const mercatorY = (lat) => 0.5 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / (2 * Math.PI);

/**
 * Lowest zoom at which a viewport of this size still lies entirely inside the region, so the
 * user can neither zoom out nor pan to anything beyond it. It covers the viewport (the tighter
 * axis wins) rather than fitting the region inside it, which would show blank map on the other
 * axis. Recompute on resize and orientation change.
 *
 * @param {{ width?: number, height?: number }} [viewport] - Map container size in CSS px
 * @returns {number}
 */
export const regionMinZoom = ({ width, height } = {}) => {
  const w = width > 0 ? width : FALLBACK_VIEWPORT.width;
  const h = height > 0 ? height : FALLBACK_VIEWPORT.height;
  const [west, south, east, north] = MAP_REGION_BBOX;
  const regionWidth = ((east - west) / 360) * TILE_SIZE;
  const regionHeight = (mercatorY(south) - mercatorY(north)) * TILE_SIZE;
  return Math.log2(Math.max(w / regionWidth, h / regionHeight));
};

/**
 * Is a [lng, lat] point inside the region, with `margin` degrees of slack on every side?
 * @param {[number, number]} point
 * @param {number} [margin]
 * @returns {boolean}
 */
export const isInRegion = ([lng, lat], margin = 0) => {
  const [west, south, east, north] = MAP_REGION_BBOX;
  return lng >= west + margin && lng <= east - margin && lat >= south + margin && lat <= north - margin;
};

/** The points that are not inside the region (with `margin` degrees of slack); used to prove no shipped data is clipped. */
export const pointsOutsideRegion = (points, margin = 0) => points.filter((point) => !isInRegion(point, margin));
