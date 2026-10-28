// EMT stop markers change with zoom (#108, #116): small red dots far out, the "EMT" logo label
// mid-zoom, the stop's real line numbers at street zoom. One zoom check with hysteresis drives a
// single attribute on the map container (data-emt-stage = dot | logo | lines); CSS does the rest,
// so no marker is rebuilt on a zoom frame.

/** EMT stop markers exist from this zoom up, so the map opens (default zoom 12.3) already showing the dots. */
export const EMT_MARKER_MIN_ZOOM = 12;
/** Zoomed out past this (zoom < 13.9) the badges become dots. Lowered from 14.4 so the EMT logo shows sooner. */
export const EMT_DOT_ENTER_ZOOM = 13.9;
/** Zoomed back in past this (zoom >= 14.1) the EMT logo returns. The 0.2 band stops flapping at ~14. */
export const EMT_DOT_EXIT_ZOOM = 14.1;
/** Zoomed in past this (zoom >= 15.0) the logo gives way to the line numbers. Lowered from 16.5 so the numbers show sooner. */
export const EMT_LINES_ENTER_ZOOM = 15.0;
/** Zoomed back out past this (zoom < 14.8) the line numbers give way to the logo. */
export const EMT_LINES_EXIT_ZOOM = 14.8;

/**
 * @param {number} zoom current map zoom
 * @param {'dot'|'logo'|'lines'} prev the stage shown before this check
 * @returns {'dot'|'logo'|'lines'} the stage to show now
 */
export const emtStage = (zoom, prev) => {
  if (prev === 'dot') {
    if (zoom < EMT_DOT_EXIT_ZOOM) return 'dot';
  } else if (zoom < EMT_DOT_ENTER_ZOOM) {
    return 'dot';
  }
  if (prev === 'lines') return zoom >= EMT_LINES_EXIT_ZOOM ? 'lines' : 'logo';
  return zoom >= EMT_LINES_ENTER_ZOOM ? 'lines' : 'logo';
};

/** While dots show, one stop is drawn per cell this many screen pixels wide (#140). */
export const EMT_DOT_CELL_PX = 28;

/**
 * Zoomed out, a street's five stops need only one dot. Below the logo zoom, keeps one stop per
 * screen-space grid cell; from the logo zoom up, returns every stop. The cell is a fixed number of
 * pixels, so it covers fewer metres as you zoom in and more stops appear gradually. The grid is
 * anchored to world coordinates and the pick is deterministic (most lines, then lowest code), so
 * panning never makes a dot swap. Display only: the stops themselves are untouched.
 *
 * @param {{ stopCode?: string, code?: string, coordinates: number[], lines?: unknown[] }[]} stops
 * @param {number} zoom current map zoom
 * @param {number} latitude map centre latitude, for metres per pixel
 * @returns {typeof stops}
 */
export const thinStopsForZoom = (stops, zoom, latitude) => {
  if (zoom >= EMT_DOT_ENTER_ZOOM) return stops;
  const metresPerPixel = (156543.03 * Math.cos((latitude * Math.PI) / 180)) / 2 ** zoom;
  const cellLat = (EMT_DOT_CELL_PX * metresPerPixel) / 111320;
  const cellLng = cellLat / Math.cos((latitude * Math.PI) / 180);
  const code = (s) => String(s.stopCode || s.code || '');
  const better = (a, b) => {
    const la = (a.lines || []).length;
    const lb = (b.lines || []).length;
    return la !== lb ? la > lb : code(a).localeCompare(code(b), undefined, { numeric: true }) < 0;
  };
  const best = new Map();
  for (const stop of stops) {
    const key = `${Math.floor(stop.coordinates[0] / cellLng)}:${Math.floor(stop.coordinates[1] / cellLat)}`;
    const held = best.get(key);
    if (!held || better(stop, held)) best.set(key, stop);
  }
  return [...best.values()];
};
