// Remembering the split-view hub a stop was opened from, so closing the
// independent stop view returns to it (#105). Pure helpers; App.jsx owns state.

// The hubs: GPS "Where you're at", a navigation/search result address, a map ping.
export const isHubStation = (station) =>
  Boolean(
    station &&
      (station.isPin ||
        station.properties?.isPin ||
        station.properties?.name === 'Map Ping' ||
        station.properties?.name === "Where you're at")
  );

/**
 * Snapshot of the hub currently showing, or null when the current selection is
 * not a hub (nothing to return to).
 * Shape: { station, userLocation }
 */
export const captureReturnContext = ({ selectedStation, userLocation } = {}) =>
  isHubStation(selectedStation)
    ? { station: selectedStation, userLocation: userLocation || null }
    : null;

/**
 * What to select when a stop view closes: the hub, or null for the bare map.
 * A ping keeps its remembered location; a live GPS hub takes the latest fix
 * (#104 keeps updating it while the stop is open) so the return is not stale.
 */
export const resolveReturn = (ctx, currentLocation = null) => {
  if (!ctx?.station) return null;
  const saved = ctx.userLocation || null;
  const live = currentLocation && !currentLocation.isMapClick && !saved?.isMapClick;
  return { selectedStation: ctx.station, userLocation: live ? currentLocation : saved };
};

/**
 * The context is only meaningful while the stop/station it was opened from is
 * the thing showing. Any other navigation (line inspector, sidebar, a new GPS
 * hub, a closed view) leaves it stale, so it is dropped.
 */
export const reconcileReturnContext = (ctx, { selectedStation, selectedBusStop, activeBusLine } = {}) => {
  if (!ctx || activeBusLine) return null;
  if (selectedBusStop && !selectedStation) return ctx;
  if (selectedStation && !selectedBusStop && !isHubStation(selectedStation)) return ctx;
  return null;
};
