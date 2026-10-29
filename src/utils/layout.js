// Below this width, the Station panel docks to the bottom sheet instead of a
// right-hand rail (StationPanel's own useIsLandscape) — MapView needs the same
// number to compute how much of the map that panel actually covers, so a
// focused Station centers in the space still visible above or beside it
// rather than behind it.
export const LANDSCAPE_BREAKPOINT_PX = 820;

// At or below this width, Sidebar renders as a bottom sheet card instead of
// the left-hand rail.
export const MOBILE_BREAKPOINT_PX = 768;

// Free-area frame for the stand-alone line 19 views (tapped-bus sheet, line inspector). They float over the map
// so they must start right of the docked sidebar, stop short of the landscape right rail (stop board / station
// panel, 34vw wide) and sit below the line filter chips when those show. Pure; viewport in CSS px.
export function lineViewFrame({ viewportW, sidebarOpen = false, chipsShown = false, maxWidth = 380 }) {
  const desktop = viewportW > MOBILE_BREAKPOINT_PX;
  const sidebarW = viewportW >= 1600 ? 420 : 320; // --sidebar-width
  const left = desktop ? (sidebarOpen ? sidebarW + 40 : 20) : 12;
  const right = viewportW >= LANDSCAPE_BREAKPOINT_PX ? Math.round(viewportW * 0.34) + 28 : 12;
  const width = Math.max(220, Math.min(maxWidth, viewportW - left - right));
  return {
    left,
    width,
    top: 76 + (chipsShown ? 44 : 0), // plus the safe-area inset, added in CSS
    // On phones the open sidebar is a bottom sheet card over the same strip: it wins, the inspector yields.
    sidebarCovers: !desktop && sidebarOpen,
  };
}
