import { LANDSCAPE_BREAKPOINT_PX } from './layout';

export const DEFAULT_MAP_ZOOM = 12.3;
export const DEFAULT_MAP_CENTER = [-0.3763, 39.4699];
export const STATION_FOCUS_ZOOM = 15.0;
/** Every camera ease lasts this long (matches the native app). */
export const CAMERA_EASE_MS = 400;
export const ZERO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

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

export const PORTRAIT_FOCUS_CLEARANCE_PX = 80;

/**
 * Computes viewport padding so the station centers in the visible area of the map
 * rather than hidden behind the search bar, bottom sheet, or side panel.
 *
 * Adds vertical clearance in portrait so the station dot and its arrival popup bubble
 * float comfortably above the floating timetable card without overlap.
 *
 * @param {object} [options]
 * @param {boolean} [options.isLandscape]
 * @param {DOMRect | { top: number, right: number, bottom: number, left: number }} [options.containerRect]
 * @param {DOMRect | { top?: number, right?: number, bottom?: number, left?: number }} [options.searchBarRect]
 * @param {DOMRect | { top?: number, right?: number, bottom?: number, left?: number }} [options.panelRect]
 * @param {number} [options.panelHeight] - Explicit layout height of the station panel, immune to in-flight CSS transforms.
 * @param {number} [options.panelWidth] - Explicit layout width of the station panel.
 * @param {boolean} [options.hasPanel] - Whether a panel is present or expected.
 * @param {number} [options.viewportWidth]
 * @param {number} [options.viewportHeight]
 * @param {number} [options.portraitClearance] - Additional vertical clearance (px) above the bottom panel.
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export const panelAwarePadding = ({
  isLandscape = typeof window !== 'undefined' ? window.innerWidth >= LANDSCAPE_BREAKPOINT_PX : false,
  containerRect,
  searchBarRect,
  panelRect,
  panelHeight: explicitPanelHeight,
  panelWidth: explicitPanelWidth,
  hasPanel = Boolean(panelRect || explicitPanelHeight != null || explicitPanelWidth != null),
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768,
  portraitClearance = hasPanel ? PORTRAIT_FOCUS_CLEARANCE_PX : 0,
} = {}) => {
  const containerTop = containerRect ? containerRect.top : 0;
  const containerRight = containerRect ? containerRect.right : viewportWidth;
  const containerBottom = containerRect ? containerRect.bottom : viewportHeight;
  const containerHeight = containerBottom - containerTop;

  const topPadding =
    (searchBarRect && Number.isFinite(searchBarRect.bottom) ? searchBarRect.bottom - containerTop : 84) + 12;

  if (isLandscape) {
    let panelWidth = 0;
    if (hasPanel) {
      const measuredPanelWidth =
        panelRect && Number.isFinite(panelRect.left) ? containerRight - panelRect.left : null;
      panelWidth = Math.max(
        explicitPanelWidth ?? 0,
        measuredPanelWidth ?? (explicitPanelWidth != null ? 0 : Math.min(380, viewportWidth * 0.34))
      );
    }

    return {
      top: topPadding,
      right: Math.round(hasPanel ? panelWidth + 16 : 40),
      bottom: 40,
      left: 40,
    };
  }

  // Portrait mode:
  let bottomPadding = 40;
  if (hasPanel) {
    const measuredPanelHeight =
      panelRect && Number.isFinite(panelRect.top) && containerBottom > panelRect.top
        ? containerBottom - panelRect.top
        : null;

    // Use the maximum of layout height and measured height to ensure in-flight CSS transforms
    // (e.g. translateY slide-up) do not under-report resting panel height.
    const panelHeight = Math.max(
      explicitPanelHeight ?? 0,
      measuredPanelHeight ?? (explicitPanelHeight != null ? 0 : viewportHeight * 0.45)
    );

    const rawBottom = panelHeight + portraitClearance;
    // Guard against viewport over-constraining on small screens, preserving minimum map aperture
    const maxAllowedBottom = Math.max(80, containerHeight - topPadding - 120);
    bottomPadding = Math.round(Math.min(rawBottom, maxAllowedBottom));
  }

  return {
    top: topPadding,
    right: 24,
    bottom: bottomPadding,
    left: 24,
  };
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
 * @param {{ top: number, right: number, bottom: number, left: number }} [args.currentPadding] - padding the camera carries now
 * @param {number} args.currentZoom
 * @param {number} args.targetZoom
 * @returns {boolean} true when the camera must ease
 */
export const shouldEaseToTarget = ({ screenPoint, size, padding, currentPadding, currentZoom, targetZoom }) => {
  const centred = !needsRecentre(screenPoint, usableCentre(size, padding)) || keepUnderShorterSheet({ screenPoint, size, padding, currentPadding });
  return !centred || Math.abs(currentZoom - targetZoom) > ZOOM_EPSILON;
};

/** A re-measured sheet may be up to this many px shorter/narrower on a side and the target is kept. */
export const SHEET_REMEASURE_SLACK_PX = 6;
/** Largest distance (px) a kept target may sit from the new usable centre. A 48 px shorter sheet shifts it 24 px. */
export const MAX_KEPT_OFFSET_PX = 40;

/**
 * Rule: sheet got shorter or equal => keep; sheet got taller => always ease.
 * The target is kept only when it is centred under the padding the camera still
 * carries, NO side of the new padding exceeds the carried one (beyond 6 px, so the
 * sheet cannot newly cover it, portrait or landscape), and it sits within 40 px of the new centre.
 */
const keepUnderShorterSheet = ({ screenPoint, size, padding, currentPadding }) => {
  if (!currentPadding) return false;
  const notTaller = ['top', 'right', 'bottom', 'left'].every(
    (side) => padding[side] <= currentPadding[side] + SHEET_REMEASURE_SLACK_PX
  );
  if (!notTaller) return false;
  if (needsRecentre(screenPoint, usableCentre(size, currentPadding))) return false;
  return !needsRecentre(screenPoint, usableCentre(size, padding), MAX_KEPT_OFFSET_PX);
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
    currentPadding: map.getPadding ? map.getPadding() : undefined,
    currentZoom,
    targetZoom,
  });
  if (!needed) return false;
  map.easeTo({ center, zoom: targetZoom, padding, duration, essential });
  return true;
};
