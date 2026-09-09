// Station Focus Dimming
//
// When a Station is selected, Lines that don't serve it — and the Vehicles
// running on those Lines — are dimmed rather than hidden. This is separate
// from the sidebar's Line-visibility filter, which hides non-matching Lines
// outright via a map `filter` expression; dimming only ever applies among
// Lines a filter has already let through, expressed as a `line-opacity`
// paint property so it can never remove a Line the filter kept.
export const DIM_FACTOR = 0.2;

/**
 * Whether a Line's Station Chain includes the given Station. With no Station
 * selected, every Line counts as serving it — nothing should be dimmed.
 *
 * @param {string|number} lineId
 * @param {{ properties?: { lines?: (string|number)[] } }|null} selectedStation
 * @returns {boolean}
 */
export const lineServesStation = (lineId, selectedStation) => {
  if (!selectedStation) return true;
  const lines = (selectedStation.properties && selectedStation.properties.lines) || [];
  return lines.map(String).includes(String(lineId));
};

/**
 * A MapLibre `line-opacity` paint expression that renders every Line at
 * `fullOpacity` when no Station is selected, and drops any Line outside the
 * selected Station's Station Chain to `fullOpacity * DIM_FACTOR` once one is.
 *
 * @param {{ properties?: { lines?: (string|number)[] } }|null} selectedStation
 * @param {number} fullOpacity
 * @returns {number|Array} a plain number, or a MapLibre expression
 */
export const lineOpacityExpression = (selectedStation, fullOpacity) => {
  if (!selectedStation) return fullOpacity;
  const served = ((selectedStation.properties && selectedStation.properties.lines) || []).map(String);
  return ['case', ['in', ['get', 'line'], ['literal', served]], fullOpacity, fullOpacity * DIM_FACTOR];
};

/**
 * Applies Station-focus dimming on top of a Vehicle's already-computed
 * opacity (e.g. Position Confidence-driven fading), without altering that
 * base value when the Vehicle's Line serves the selected Station.
 *
 * @param {number} baseOpacity
 * @param {string|number} lineId
 * @param {{ properties?: { lines?: (string|number)[] } }|null} selectedStation
 * @returns {number}
 */
export const dimmedVehicleOpacity = (baseOpacity, lineId, selectedStation) => (
  lineServesStation(lineId, selectedStation) ? baseOpacity : baseOpacity * DIM_FACTOR
);
