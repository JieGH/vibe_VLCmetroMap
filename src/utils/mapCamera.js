import { LANDSCAPE_BREAKPOINT_PX } from './layout';

export const DEFAULT_MAP_ZOOM = 12.3;
export const DEFAULT_MAP_CENTER = [-0.3763, 39.4699];
export const STATION_FOCUS_ZOOM = 14.6;
export const ZERO_PADDING = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Calculates camera target zoom when focusing a Station.
 *
 * @param {number} currentZoom - The map's current zoom level
 * @param {number} [focusZoom=STATION_FOCUS_ZOOM] - Target focus zoom
 * @returns {number} Target focus zoom
 */
export const calculateFocusZoom = (currentZoom, focusZoom = STATION_FOCUS_ZOOM) =>
  Math.max(currentZoom, focusZoom);

/**
 * Calculates camera target zoom and padding when exiting station focus.
 *
 * Resets camera padding to zero so dragging, zooming, and viewport bounds are
 * unconstrained, and smoothly restores the pre-focus zoom or default network overview.
 *
 * @param {object} [options]
 * @param {number | null} [options.preFocusZoom] - Zoom level before station was focused
 * @param {number} [options.defaultZoom=DEFAULT_MAP_ZOOM] - Fallback overview zoom
 * @returns {{ zoom: number, padding: { top: number, right: number, bottom: number, left: number } }}
 */
export const calculateUnfocusCamera = ({
  preFocusZoom = null,
  defaultZoom = DEFAULT_MAP_ZOOM,
} = {}) => {
  const targetZoom =
    preFocusZoom !== null && preFocusZoom !== undefined
      ? preFocusZoom
      : defaultZoom;

  return {
    zoom: targetZoom,
    padding: ZERO_PADDING,
  };
};

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
