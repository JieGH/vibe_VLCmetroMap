// Station Focus
//
// When a Station is selected, Lines that don't serve it — and the Vehicles
// running on those Lines — are dimmed rather than hidden, and only Vehicles
// on Lines that do serve it may pulse. Dimming is separate from the
// sidebar's Line-visibility filter, which hides non-matching Lines outright
// via a map `filter` expression; dimming only ever applies among Lines a
// filter has already let through, expressed as a `line-opacity` paint
// property so it can never remove a Line the filter kept.
export const DIM_FACTOR = 0.2;
export const UNSELECTED_LINE_OPACITY = 0.35;
export const UNSELECTED_CASING_OPACITY = 0.15;
// Multiplier for every Vehicle while an EMT stop is selected (#114); about the 0.35-0.45 of the CSS fade.
export const SELECTION_FADE_FACTOR = 0.4;

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
 * `unselectedOpacity` when no Station is selected (creating a cleaner, unobtrusive map),
 * and highlights any Line in the selected Station's Station Chain to `fullOpacity`
 * once one is, dropping unserved lines to `unselectedOpacity * DIM_FACTOR`.
 *
 * @param {{ properties?: { lines?: (string|number)[] } }|null} selectedStation
 * @param {number} fullOpacity
 * @param {number} [unselectedOpacity=fullOpacity]
 * @returns {number|Array} a plain number, or a MapLibre expression
 */
export const lineOpacityExpression = (selectedStation, fullOpacity, unselectedOpacity = fullOpacity) => {
  if (!selectedStation) return unselectedOpacity;
  const served = ((selectedStation.properties && selectedStation.properties.lines) || []).map(String);
  return ['case', ['in', ['get', 'line'], ['literal', served]], fullOpacity, unselectedOpacity * DIM_FACTOR];
};

/**
 * Applies Station-focus dimming on top of a Vehicle's already-computed
 * opacity (e.g. Position Confidence-driven fading), without altering that
 * base value when the Vehicle's Line serves the selected Station.
 *
 * @param {number} baseOpacity
 * @param {string|number} lineId
 * @param {{ properties?: { lines?: (string|number)[] } }|null} selectedStation
 * With `fadeAll` (an EMT stop is selected, no metro Station) every Vehicle on
 * every Line fades; Position Confidence still scales it, so it never gets brighter.
 *
 * @param {boolean} [fadeAll=false]
 * @returns {number}
 */
export const dimmedVehicleOpacity = (baseOpacity, lineId, selectedStation, fadeAll = false) => {
  if (fadeAll) return baseOpacity * SELECTION_FADE_FACTOR;
  return lineServesStation(lineId, selectedStation) ? baseOpacity : baseOpacity * DIM_FACTOR;
};

/**
 * Whether a Vehicle marker should pulse. With no Station selected, nothing
 * pulses — the ambient blink is gone by default. Once a Station is selected,
 * only a live Vehicle running on a Line in that Station's Station Chain
 * pulses; a Simulated Train (never live) never does, in either state.
 *
 * @param {{ isLive?: boolean, line: string|number }} vehicle
 * @param {{ properties?: { lines?: (string|number)[] } }|null} selectedStation
 * @returns {boolean}
 */
export const vehicleShouldPulse = (vehicle, selectedStation) => (
  !!vehicle.isLive && !!selectedStation && lineServesStation(vehicle.line, selectedStation)
);

/**
 * A Station handed to the map from outside (search, say) carries the raw feed's
 * Lines; a tapped marker carries the map's merged ones (duplicate dots of one
 * interchange are unioned). Focus must read the same either way, so this lends
 * the raw Station the map's Lines. Pins and unknown names pass through as-is.
 *
 * @param {{ properties?: { lines?: (string|number)[] } }|null} station
 * @param {{ properties?: { lines?: (string|number)[] } }|null|undefined} mapStation
 */
export const withMapLines = (station, mapStation) => {
  if (!station || !mapStation || station.isPin || station.properties?.isPin) return station;
  const own = (station.properties?.lines || []).map(String);
  const merged = (mapStation.properties?.lines || []).map(String);
  if (merged.length === own.length && merged.every((l) => own.includes(l))) return station;
  return { ...station, properties: { ...station.properties, lines: [...new Set([...own, ...merged])] } };
};
