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

export const GPS_HUB_API_ID = 'user-location-gps';

export const isGpsHub = (station) => station?.properties?.apiId === GPS_HUB_API_ID;

/** The "Where you're at" hub for a GPS fix. The one place it is built (first locate and live refresh alike). */
export const buildGpsHub = (fix) => ({
  properties: {
    name: "Where you're at",
    lines: [],
    isPin: true,
    apiId: GPS_HUB_API_ID,
    nearestStation: fix.nearestStation,
  },
  geometry: { type: 'Point', coordinates: fix.coordinates },
  isPin: true,
});

/**
 * Live tracking (#104) refreshes the hub only while it is the thing showing: not under a stop opened from it
 * (that stop is the selection, and the remembered hub is refreshed on return by resolveReturn).
 */
export const shouldRefreshGpsHub = ({ selectedStation, selectedBusStop }) =>
  Boolean(isGpsHub(selectedStation) && !selectedBusStop);

/**
 * What to select when a stop view closes: the hub, or null for the bare map.
 * A ping keeps its remembered location; a live GPS hub takes the latest fix
 * (#104 keeps updating it while the stop is open) so the return is not stale.
 */
export const resolveReturn = (ctx, currentLocation = null) => {
  if (!ctx?.station) return null;
  const saved = ctx.userLocation || null;
  const live = currentLocation && !currentLocation.isMapClick && !saved?.isMapClick;
  const userLocation = live ? currentLocation : saved;
  // A live GPS hub is rebuilt from the latest fix so its geometry and nearest station are not stale.
  const station = live && isGpsHub(ctx.station) && currentLocation.coordinates
    ? buildGpsHub(currentLocation)
    : ctx.station;
  return { selectedStation: station, userLocation };
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
