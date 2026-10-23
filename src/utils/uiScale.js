// How large the Android app draws its interface. Everything shrinks together
// (rem and px alike) with CSS `zoom` on the root; index.css stretches the
// full-screen containers back out, because zoom scales lengths but not
// viewport units. window.innerWidth is unchanged, so the layout breakpoints
// fall where they always did.
//
// Not done through the viewport meta tag: in this app's Android WebView that
// widens the layout without shrinking the display, so the right edge is cut off.
export const ANDROID_UI_ZOOM = 0.88;

export const uiZoomFor = (platform) => (platform === 'android' ? ANDROID_UI_ZOOM : 1);

/** Marks the root as zoomed and records the factor for the stylesheet, if the platform needs one. */
export const applyUiZoom = (platform, root = document.documentElement) => {
  const zoom = uiZoomFor(platform);
  if (zoom === 1) return zoom;
  root.classList.add('ui-zoomed');
  root.style.setProperty('--ui-zoom', String(zoom));
  return zoom;
};
