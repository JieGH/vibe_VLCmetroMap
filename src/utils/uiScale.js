// How large the app draws its interface. Android used to shrink everything
// with CSS `zoom` (0.88); its Material 3 design (android.css) sizes things in
// real density-independent pixels instead, so the zoom is retired and every
// platform draws at full size. The index.css `.ui-zoomed` rules stay for any
// platform that ever needs a factor again.
export const ANDROID_UI_ZOOM = 1;

export const uiZoomFor = (platform) => (platform === 'android' ? ANDROID_UI_ZOOM : 1);

/** Marks the root as zoomed and records the factor for the stylesheet, if the platform needs one. */
export const applyUiZoom = (platform, root = document.documentElement) => {
  const zoom = uiZoomFor(platform);
  if (zoom === 1) return zoom;
  root.classList.add('ui-zoomed');
  root.style.setProperty('--ui-zoom', String(zoom));
  return zoom;
};
