// The Android app calls FGV's live feed directly from the phone. This website
// cannot: FGV refuses connections from its web host. The banner invites
// visitors who can install the app to do so.
export const APK_URL =
  'https://github.com/JieGH/vibe_VLCmetroMap/releases/download/v1.1.0/Xarxa-v1.1.0-android-debug.apk';
export const RELEASE_URL = 'https://github.com/JieGH/vibe_VLCmetroMap/releases/tag/v1.1.0';

export const APP_BANNER_DISMISSED_KEY = 'metro_valencia_app_banner_dismissed';

// There is no iPhone download (the iOS app is built from source), and the
// native app has no use for an invitation to install itself.
export const isIosDevice = (userAgent = '', maxTouchPoints = 0) =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

export const wasBannerDismissed = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    return window.localStorage.getItem(APP_BANNER_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
};

export const rememberBannerDismissed = () => {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(APP_BANNER_DISMISSED_KEY, '1');
  } catch {
    // Not remembered: the banner returns next visit, which is harmless.
  }
};
