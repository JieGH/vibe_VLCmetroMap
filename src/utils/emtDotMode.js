// EMT stop markers change with zoom (#108, #116): small red dots far out, the "EMT" logo label
// mid-zoom, the stop's real line numbers at street zoom. One zoom check with hysteresis drives a
// single attribute on the map container (data-emt-stage = dot | logo | lines); CSS does the rest,
// so no marker is rebuilt on a zoom frame.

/** Zoomed out past this (zoom < 14.4) the badges become dots. */
export const EMT_DOT_ENTER_ZOOM = 14.4;
/** Zoomed back in past this (zoom >= 14.6) the EMT logo returns. The 0.2 band stops flapping at ~14.5. */
export const EMT_DOT_EXIT_ZOOM = 14.6;
/** Zoomed in past this (zoom >= 16.5) the logo gives way to the line numbers. */
export const EMT_LINES_ENTER_ZOOM = 16.5;
/** Zoomed back out past this (zoom < 16.3) the line numbers give way to the logo. */
export const EMT_LINES_EXIT_ZOOM = 16.3;

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
