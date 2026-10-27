import { LANDSCAPE_BREAKPOINT_PX } from './layout';

export const DEFAULT_MAP_ZOOM = 12.3;
export const DEFAULT_MAP_CENTER = [-0.3763, 39.4699];
export const STATION_FOCUS_ZOOM = 15.0;
/** Every camera ease lasts this long (matches the native app). */
export const CAMERA_EASE_MS = 400;
export const ZERO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Options for map.fitBounds that ignore any padding the camera still carries from
 * an earlier selection (#95: closing a sheet no longer eases the padding away, and
 * MapLibre otherwise adds the carried padding to the fit padding). `absolutePadding`
 * makes the given padding the whole story, so the fit equals a zero-padding map's.
 */
export const fitBoundsOptions = (padding, rest = {}) => ({
  ...rest,
  padding: { ...ZERO_PADDING, ...padding },
  absolutePadding: true,
});

/**
 * Calculates camera target zoom when focusing a Station or Bus Stop.
 * Preserves the user's chosen zoom ratio for natural map navigation (Google Maps style),
 * while guarding against extremely far-out zoom levels where a station cannot be seen.
 *
 * @param {number} currentZoom - The map's current zoom level
 * @param {number} [minZoom=DEFAULT_MAP_ZOOM] - Minimum overview zoom threshold
 * @returns {number} Target focus zoom
 */
export const calculateFocusZoom = (currentZoom, minZoom = DEFAULT_MAP_ZOOM) =>
  Math.max(currentZoom, minZoom);

/**
 * Calculates camera target zoom and padding when exiting station focus.
 *
 * Resets camera padding to zero so dragging, zooming, and viewport bounds are
 * unconstrained, and smoothly preserves the user's current zoom or default network overview.
 *
 * @param {object} [options]
 * @param {number | null} [options.currentZoom] - Active map zoom level to preserve
 * @param {number | null} [options.preFocusZoom] - Zoom level before station was focused
 * @param {number} [options.defaultZoom=DEFAULT_MAP_ZOOM] - Fallback overview zoom
 * @returns {{ zoom: number, padding: { top: number, right: number, bottom: number, left: number } }}
 */
export const calculateUnfocusCamera = ({
  currentZoom = null,
  preFocusZoom = null,
  defaultZoom = DEFAULT_MAP_ZOOM,
} = {}) => {
  const targetZoom =
    currentZoom !== null && currentZoom !== undefined
      ? currentZoom
      : preFocusZoom !== null && preFocusZoom !== undefined
        ? preFocusZoom
        : defaultZoom;

  return {
    zoom: targetZoom,
    padding: ZERO_PADDING,
  };
};

/**
 * Zoom to ease to when the Station or Bus Stop sheet closes.
 * Preserves the user's chosen zoom ratio on exit without forced zoom-out jumps (Google Maps style).
 *
 * @param {number} currentZoom - The map's current zoom level
 * @returns {number} Current zoom level preserved
 */
export const zoomOutTarget = (currentZoom) => currentZoom;

/** Gap kept between the usable map area and the screen edges. */
export const FOCUS_EDGE_PX = 12;
/** Gap kept between the usable map area and the sheet (or side panel). */
export const SHEET_GAP_PX = 8;
/** The usable area never gets thinner than this, whatever the sheet height. */
export const MIN_USABLE_APERTURE_PX = 120;
/** Padding changes under this many px are measurement noise, not a resize. */
export const PADDING_NOISE_PX = 2;

/**
 * Where a sheet rests, from layout offsets rather than the drawn rect, so an in-flight
 * slide-up/slide-in transform cannot skew it. Falls back to the drawn rect.
 *
 * @param {object} [args]
 * @param {{ top: number, left: number }} [args.rect] - the sheet's getBoundingClientRect()
 * @param {{ top: number, left: number }} [args.offsetParentRect] - its offset parent's rect
 * @param {number} [args.offsetTop]
 * @param {number} [args.offsetLeft]
 * @returns {{ top: number, left: number } | undefined} viewport coordinates
 */
export const restingSheetRect = ({ rect, offsetParentRect, offsetTop, offsetLeft } = {}) => {
  if (offsetParentRect && Number.isFinite(offsetTop) && Number.isFinite(offsetLeft)) {
    return { top: offsetParentRect.top + offsetTop, left: offsetParentRect.left + offsetLeft };
  }
  return rect ? { top: rect.top, left: rect.left } : undefined;
};

/**
 * THE rule for where a selected stop is centred: the usable rectangle of the map, from
 * measured values. It sits below the search bar and above the bottom sheet (portrait) or
 * left of the side panel (landscape). Padding is derived from it so MapLibre centres the
 * stop at exactly the rectangle's centre.
 *
 * @param {object} [options]
 * @param {boolean} [options.isLandscape]
 * @param {{ top: number, right: number, bottom: number, left: number }} [options.containerRect] - map container, viewport coordinates
 * @param {{ bottom?: number }} [options.searchBarRect]
 * @param {{ top?: number, left?: number }} [options.sheetRect] - where the sheet rests (restingSheetRect)
 * @param {boolean} [options.hasPanel] - a sheet is shown or about to be, even if not measurable yet
 * @param {number} [options.viewportWidth]
 * @param {number} [options.viewportHeight]
 * @returns {{ rect: { left: number, top: number, right: number, bottom: number }, padding: { top: number, right: number, bottom: number, left: number }, centre: { x: number, y: number } }}
 *   rect and centre are in container pixels
 */
export const usableArea = ({
  isLandscape = typeof window !== 'undefined' ? window.innerWidth >= LANDSCAPE_BREAKPOINT_PX : false,
  containerRect,
  searchBarRect,
  sheetRect,
  hasPanel = Boolean(sheetRect),
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768,
} = {}) => {
  const containerTop = containerRect ? containerRect.top : 0;
  const containerLeft = containerRect ? containerRect.left : 0;
  const width = containerRect ? containerRect.right - containerLeft : viewportWidth;
  const height = containerRect ? containerRect.bottom - containerTop : viewportHeight;

  const top = (searchBarRect && Number.isFinite(searchBarRect.bottom) ? searchBarRect.bottom - containerTop : 84) + 12;
  let left = FOCUS_EDGE_PX;
  let right = width - FOCUS_EDGE_PX;
  let bottom = height - FOCUS_EDGE_PX;

  if (hasPanel && isLandscape) {
    // A sheet that cannot be measured yet is estimated, then corrected once it can.
    const sheetLeft = sheetRect && Number.isFinite(sheetRect.left) ? sheetRect.left - containerLeft : width - Math.min(380, viewportWidth * 0.34);
    right = Math.max(left + MIN_USABLE_APERTURE_PX, Math.round(sheetLeft - SHEET_GAP_PX));
  } else if (hasPanel) {
    const sheetTop = sheetRect && Number.isFinite(sheetRect.top) ? sheetRect.top - containerTop : height - viewportHeight * 0.45;
    bottom = Math.max(top + MIN_USABLE_APERTURE_PX, Math.round(sheetTop - SHEET_GAP_PX));
  }
  bottom = Math.min(bottom, height - FOCUS_EDGE_PX);
  right = Math.min(right, width - FOCUS_EDGE_PX);

  return {
    rect: { left, top, right, bottom },
    padding: { top, right: width - right, bottom: height - bottom, left },
    centre: { x: (left + right) / 2, y: (top + bottom) / 2 },
  };
};

/** Camera padding that centres a target in the usable area (see usableArea). */
export const panelAwarePadding = (options) => usableArea(options).padding;

/** True when two paddings agree on every side to within measurement noise. */
export const samePadding = (a, b, tolerance = PADDING_NOISE_PX) =>
  Boolean(a && b) && ['top', 'right', 'bottom', 'left'].every((side) => Math.abs(a[side] - b[side]) <= tolerance);

/**
 * The sheet or window changed size while a stop stays selected: ease the same target to the
 * new usable centre. Zoom is left alone (#94). Callers only call this when the padding really
 * changed (samePadding), and camera moves never resize the sheet, so it cannot loop.
 */
export const recentreOnResize = (map, center, padding, { duration = CAMERA_EASE_MS } = {}) => {
  map.easeTo({ center, padding, duration, essential: true });
};

/** A target within this many screen pixels of the usable-space centre counts as already centred (#95). */
export const RECENTRE_TOLERANCE_PX = 6;
/** Zoom differences below this are treated as "no zoom change wanted". */
export const ZOOM_EPSILON = 0.01;

/**
 * Centre of the map area left free by the padding (above the sheet, below the search bar).
 * @param {{ width: number, height: number }} size - Map container size in px
 * @param {{ top: number, right: number, bottom: number, left: number }} padding
 * @returns {{ x: number, y: number }}
 */
export const usableCentre = ({ width, height }, padding) => ({
  x: (padding.left + (width - padding.right)) / 2,
  y: (padding.top + (height - padding.bottom)) / 2,
});

/**
 * Idempotence decision: does the target need to be moved to the usable-space centre?
 * @param {{ x: number, y: number }} currentScreenPoint - Where the target is drawn now
 * @param {{ x: number, y: number }} targetCentre
 * @param {number} [tolerancePx]
 * @returns {boolean}
 */
export const needsRecentre = (currentScreenPoint, targetCentre, tolerancePx = RECENTRE_TOLERANCE_PX) =>
  Math.hypot(currentScreenPoint.x - targetCentre.x, currentScreenPoint.y - targetCentre.y) > tolerancePx;

/**
 * Decide the camera ease for selecting a target. Returns null when the target is
 * already centred at the wanted zoom, so re-selecting the same place after the
 * sheet closed causes no camera movement at all.
 *
 * @param {object} args
 * @param {{ x: number, y: number }} args.screenPoint - Target's current screen position
 * @param {{ width: number, height: number }} args.size
 * @param {{ top: number, right: number, bottom: number, left: number }} args.padding
 * @param {number} args.currentZoom
 * @param {number} args.targetZoom
 * @returns {boolean} true when the camera must ease
 */
export const shouldEaseToTarget = ({ screenPoint, size, padding, currentZoom, targetZoom }) => {
  const centred = !needsRecentre(screenPoint, usableCentre(size, padding));
  return !centred || Math.abs(currentZoom - targetZoom) > ZOOM_EPSILON;
};

/** Closing a sheet never moves the camera (#95): no options, no call. */
export const cameraOnDismiss = () => null;

/**
 * Centre `center` in the usable space, or do nothing if it already is (#95).
 * Zoom keeps the user's ratio (#94). Returns whether the camera eased.
 * Closing a sheet has no counterpart here on purpose: dismissal never moves the camera.
 *
 * @param {object} map - MapLibre-like: getZoom, getContainer, project, easeTo
 * @param {[number, number]} center - lng/lat of the drawn marker
 * @param {{ top: number, right: number, bottom: number, left: number }} padding
 * @param {{ minZoom?: number, duration?: number, essential?: boolean }} [options]
 * @returns {boolean}
 */
export const focusTarget = (map, center, padding, { minZoom, duration = CAMERA_EASE_MS, essential = true } = {}) => {
  const currentZoom = map.getZoom();
  const targetZoom = minZoom != null ? Math.max(currentZoom, minZoom) : calculateFocusZoom(currentZoom);
  const container = map.getContainer();
  const needed = shouldEaseToTarget({
    screenPoint: map.project(center),
    size: { width: container.clientWidth, height: container.clientHeight },
    padding,
    currentZoom,
    targetZoom,
  });
  if (!needed) return false;
  map.easeTo({ center, zoom: targetZoom, padding, duration, essential });
  return true;
};
