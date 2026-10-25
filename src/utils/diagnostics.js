import { Capacitor } from '@capacitor/core';

/**
 * Collects non-sensitive client diagnostic information to assist debugging issues reported in feedback.
 * Includes platform (iOS/Android/Web/PWA), device summary, screen resolution, timezone, language, and app version.
 */
export function getClientDiagnostics(language) {
  let platform = 'Web Browser';
  try {
    if (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform?.()) {
      platform = Capacitor.getPlatform?.() === 'ios' ? 'iOS Native App' : 'Android Native App';
    } else if (
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone)
    ) {
      platform = 'Web (Home Screen PWA)';
    }
  } catch {
    // ignore
  }

  const timezone = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
    } catch {
      return 'Unknown';
    }
  })();

  const screenInfo = typeof window !== 'undefined'
    ? `${window.innerWidth}x${window.innerHeight} (dpr: ${window.devicePixelRatio || 1})`
    : 'N/A';

  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

  let device = 'Unknown';
  if (/iPhone/i.test(userAgent)) device = 'iPhone';
  else if (/iPad/i.test(userAgent)) device = 'iPad';
  else if (/Android/i.test(userAgent)) device = 'Android Device';
  else if (/Macintosh|Mac OS X/i.test(userAgent)) device = 'Mac';
  else if (/Windows/i.test(userAgent)) device = 'Windows PC';
  else if (/Linux/i.test(userAgent)) device = 'Linux';

  return {
    platform,
    device,
    language: language || (typeof navigator !== 'undefined' ? navigator.language : 'es'),
    timezone,
    screen: screenInfo,
    appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
    gitSha: typeof __GIT_SHA__ !== 'undefined' ? __GIT_SHA__ : '',
    userAgent,
    timestamp: new Date().toISOString(),
  };
}
