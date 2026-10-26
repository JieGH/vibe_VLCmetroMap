// Closing a sheet re-runs the bus/stop marker sync (#115). The sync used to bail out entirely when
// `map.isStyleLoaded()` was false, and MapLibre reports false whenever any source is mid-update (the
// teardown's own setData / paint calls trigger exactly that). Since #95 closing no longer eases the camera,
// no `moveend` came to rebuild the cleared markers, so every EMT stop vanished until the next camera move.
// Markers are plain DOM, so they never depend on the style: always rebuild them, only gate the style work,
// and retry that part once the map next goes idle.

/**
 * @param {boolean} styleLoaded the map's isStyleLoaded() at sync time
 * @returns {{ markers: boolean, layers: boolean, retryOnIdle: boolean }}
 */
export const markerSyncPlan = (styleLoaded) => ({
  markers: true,
  layers: Boolean(styleLoaded),
  retryOnIdle: !styleLoaded,
});
