// EMT stop markers collapse to small red dots when the map is zoomed out (#108).
// One zoom check with hysteresis drives a single attribute on the map container
// (data-emt-dots); CSS does the rest, so no marker is rebuilt on a zoom frame.

/** Zoomed out past this (zoom < 14.4) the badges become dots. */
export const EMT_DOT_ENTER_ZOOM = 14.4;
/** Zoomed back in past this (zoom >= 14.6) the full badges return. The 0.2 band stops flapping at ~14.5. */
export const EMT_DOT_EXIT_ZOOM = 14.6;

/**
 * @param {number} zoom current map zoom
 * @param {boolean} wasDots whether dot mode was active before this check
 * @returns {boolean} whether dot mode should be active now
 */
export const emtDotMode = (zoom, wasDots) => {
  if (wasDots) return zoom < EMT_DOT_EXIT_ZOOM;
  return zoom < EMT_DOT_ENTER_ZOOM;
};
