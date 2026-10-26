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

/** What to select when a stop view closes: the hub, or null for the bare map. */
export const resolveReturn = (ctx) =>
  ctx?.station ? { selectedStation: ctx.station, userLocation: ctx.userLocation || null } : null;
