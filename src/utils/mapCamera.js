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
 * unconstrained. If the user has manually panned while inspecting the station,
 * preserves their current position and zoom rather than disorienting them.
 *
 * @param {object} options
 * @param {number} options.currentZoom - The map's current zoom level
 * @param {number | null} [options.preFocusZoom] - Zoom level before station was focused
 * @param {boolean} [options.userPanned=false] - Whether the user manually panned away
 * @param {number} [options.defaultZoom=DEFAULT_MAP_ZOOM] - Fallback overview zoom
 * @returns {{ zoom: number, padding: { top: number, right: number, bottom: number, left: number }, shouldAnimateZoom: boolean }}
 */
export const calculateUnfocusCamera = ({
  currentZoom,
  preFocusZoom = null,
  userPanned = false,
  defaultZoom = DEFAULT_MAP_ZOOM,
}) => {
  if (userPanned) {
    return {
      zoom: currentZoom,
      padding: ZERO_PADDING,
      shouldAnimateZoom: false,
    };
  }

  const targetZoom =
    preFocusZoom !== null && preFocusZoom !== undefined
      ? preFocusZoom
      : defaultZoom;

  return {
    zoom: targetZoom,
    padding: ZERO_PADDING,
    shouldAnimateZoom: true,
  };
};

/**
 * Computes viewport padding so the station centers in the visible area of the map
 * rather than hidden behind the search bar, bottom sheet, or side panel.
 *
 * @param {object} [options]
 * @param {boolean} [options.isLandscape]
 * @param {DOMRect | { top: number, right: number, bottom: number, left: number }} [options.containerRect]
 * @param {DOMRect | { top?: number, right?: number, bottom?: number, left?: number }} [options.searchBarRect]
 * @param {DOMRect | { top?: number, right?: number, bottom?: number, left?: number }} [options.panelRect]
 * @param {number} [options.viewportWidth]
 * @param {number} [options.viewportHeight]
 * @returns {{ top: number, right: number, bottom: number, left: number }}
 */
export const panelAwarePadding = ({
  isLandscape = typeof window !== 'undefined' ? window.innerWidth >= LANDSCAPE_BREAKPOINT_PX : false,
  containerRect,
  searchBarRect,
  panelRect,
  viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024,
  viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 768,
} = {}) => {
  const containerTop = containerRect ? containerRect.top : 0;
  const containerRight = containerRect ? containerRect.right : viewportWidth;
  const containerBottom = containerRect ? containerRect.bottom : viewportHeight;

  return isLandscape
    ? {
        top: (searchBarRect && Number.isFinite(searchBarRect.bottom) ? searchBarRect.bottom - containerTop : 84) + 12,
        right: (panelRect && Number.isFinite(panelRect.left) ? containerRight - panelRect.left : Math.min(380, viewportWidth * 0.34)) + 16,
        bottom: 40,
        left: 40,
      }
    : {
        top: (searchBarRect && Number.isFinite(searchBarRect.bottom) ? searchBarRect.bottom - containerTop : 90) + 12,
        right: 24,
        bottom: (panelRect && Number.isFinite(panelRect.top) ? containerBottom - panelRect.top : viewportHeight * 0.58) + 16,
        left: 24,
      };
};
