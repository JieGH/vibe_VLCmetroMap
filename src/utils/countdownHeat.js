// Countdown Heat
//
// The colour an Arrival's countdown is drawn in: hot when the train is due,
// cool when it is a long way off.
//
// Two constraints shape this, both from docs/research/transit-ui-best-practice.md:
//
// 1. Colour is never the only signal. TCRP 45 §3.5.1 — "even if routes are
//    color-coded, do not let the color of the route be the only identifier" —
//    and there are only about nine distinguishable colours to go round, which
//    this network has already spent on ten Lines. So the ramp is confined to
//    the countdown value, Line identity always rides on a labelled badge, and
//    the countdown always shows its number. The colour is redundant encoding.
// 2. Text must clear 4.5:1 (WCAG 2.2 SC 1.4.3). One ramp cannot do that on
//    both themes: the amber this ramp is built around measures 9.20:1 on the
//    dark panel and 1.80:1 on white. Hence two ramps of the same hue order,
//    each tuned to its own backdrop, and a test that fails if either drifts.

// The panel each ramp was measured against. Exported so the test asserts
// contrast against the real backdrop rather than an assumed one; these track
// --bg-panel-solid in index.css.
export const HEAT_BACKDROP = {
  dark: '#1e1e24',
  light: '#ffffff',
};

// Ordered hottest first. `maxSeconds` is inclusive.
export const HEAT_BANDS = [
  { key: 'due', maxSeconds: 0, dark: '#ff6369', light: '#c62828' },
  { key: 'imminent', maxSeconds: 120, dark: '#ff8b3d', light: '#a34500' },
  { key: 'soon', maxSeconds: 300, dark: '#ffb224', light: '#7a5200' },
  { key: 'waiting', maxSeconds: 600, dark: '#a7c957', light: '#4d7c0f' },
  { key: 'distant', maxSeconds: Infinity, dark: '#3dd68c', light: '#146c43' },
];

/**
 * The colour for a countdown of `seconds`, on `theme`.
 */
export const countdownHeat = (seconds, theme) => {
  const ramp = theme === 'light' ? 'light' : 'dark';
  const band = HEAT_BANDS.find((b) => seconds <= b.maxSeconds) ?? HEAT_BANDS[HEAT_BANDS.length - 1];
  return band[ramp];
};

/**
 * The number this ramp is drawn next to: `dueLabel` ("Due" in English), "<1",
 * or whole minutes. Every countdown display in the app reads off this, so the
 * wording can't drift between the map's expanded marker, the Station panel,
 * and the board. `dueLabel` defaults to the English word so callers that
 * don't pass a translation keep their existing behaviour.
 */
export const countdownLabel = (seconds, dueLabel = 'Due') => {
  if (seconds <= 0) return dueLabel;
  if (seconds < 60) return '<1';
  return String(Math.round(seconds / 60));
};

export default countdownHeat;
