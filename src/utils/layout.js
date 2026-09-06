// Below this width, the Station panel docks to the bottom sheet instead of a
// right-hand rail (StationPanel's own useIsLandscape) — MapView needs the same
// number to compute how much of the map that panel actually covers, so a
// focused Station centers in the space still visible above or beside it
// rather than behind it.
export const LANDSCAPE_BREAKPOINT_PX = 820;
