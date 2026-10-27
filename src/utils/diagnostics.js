import { Capacitor } from '@capacitor/core';

// Last failed request per API, so a screenshot or bug report shows "blocked
// (403)" rather than "fetch failed" (#123). Class, status and time only: never
// the address, the URL or anything about the user.
const lastApiFailure = { train: null, bus: null };

export function recordApiFailure(api, { kind, status }) {
  lastApiFailure[api] = { kind, status: status ?? null, at: new Date().toISOString() };
}

export function getApiDiagnostics() {
  return { ...lastApiFailure };
}

function describeApiFailures() {
  const parts = Object.entries(lastApiFailure)
    .filter(([, f]) => f)
    .map(([api, f]) => `${api}: ${f.kind}${f.status ? ` (${f.status})` : ''} at ${f.at}`);
  return parts.length ? parts.join('; ') : 'none';
}

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
    apiFailures: describeApiFailures(),
    timestamp: new Date().toISOString(),
  };
}
