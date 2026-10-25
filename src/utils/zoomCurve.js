/** Overall marker size relative to the raw curve (matches the native app). */
export const MARKER_SIZE_FACTOR = 0.85;
const KNEE_ZOOM = 12.3;

/** Raw marker scale: linear from zoom 7.5, then a gentle slope past the 12.3 knee. */
export const zoomCurve = (zoom) =>
  zoom <= KNEE_ZOOM ? Math.max(0, (zoom - 7.5) / 4) : 1.2 + 0.12 * (zoom - KNEE_ZOOM);

/** Station dot scale at a zoom. */
export const dotScale = (zoom) => zoomCurve(zoom) * MARKER_SIZE_FACTOR;

/** Train marker scale at a zoom: 1.1/1.2 of the dot's curve. */
export const trainScale = (zoom) => (zoomCurve(zoom) * 1.1 / 1.2) * MARKER_SIZE_FACTOR;
