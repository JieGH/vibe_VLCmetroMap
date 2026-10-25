import { Capacitor } from '@capacitor/core';
import { isAndroid } from './platform';
import { isIosDevice } from './appDownload';

const getAppMode = () => {
  try {
    return typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('mode') === 'dashboard'
      ? 'dashboard'
      : 'map';
  } catch {
    return 'map';
  }
};

export const BOT_UA_REGEX = /(bot|spider|crawl|slurp|mediapartners|googlebot|bingbot|yandex|duckduckbot|baiduspider|sogou|exabot|facebot|ia_archiver|semrush|ahrefs|mj12bot|dotbot|petalbot|headlesschrome|phantomjs|selenium|puppeteer|playwright|cypress|python|curl|wget)/i;

/**
 * Checks if the current browser environment exhibits normal human user behavior
 * rather than an automated bot or crawler.
 */
export function isNormalUserEnvironment() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  // Automated / headless browser flags
  if (navigator.webdriver) return false;

  // Realistic screen dimensions
  if (!window.screen || window.screen.width <= 0 || window.screen.height <= 0) return false;

  // User-Agent bot check
  const ua = navigator.userAgent || '';
  if (BOT_UA_REGEX.test(ua)) return false;

  // Must have at least one browser language configured
  if (!navigator.language && (!navigator.languages || navigator.languages.length === 0)) return false;

  return true;
}

/**
 * Reports a verified normal user visit to Telegram via /api/telemetry once per session.
 */
export async function reportNormalUserVisit(options = {}) {
  if (typeof window === 'undefined') return;

  try {
    // Only report once per browser session
    if (window.sessionStorage?.getItem('xarxa_user_visit_reported') === '1') {
      return;
    }

    if (!isNormalUserEnvironment()) {
      return;
    }

    let platform = 'Web Desktop';
    if (Capacitor.isNativePlatform()) {
      platform = isAndroid() ? 'Android Native' : 'iOS Native';
    } else if (isIosDevice(navigator.userAgent, navigator.maxTouchPoints)) {
      platform = 'iOS Safari (Web)';
    } else if (isAndroid()) {
      platform = 'Android Chrome (Web)';
    }

    const payload = {
      type: 'user_visit',
      platform,
      station: options.station || null,
      screen: `${window.screen.width}x${window.screen.height} (dpr: ${window.devicePixelRatio || 1})`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      language: navigator.language || 'unknown',
      languages: (navigator.languages || []).join(', '),
      timezone: Intl?.DateTimeFormat?.().resolvedOptions?.().timeZone || 'unknown',
      referrer: document.referrer || 'Direct',
      path: window.location.pathname + window.location.search,
      mode: getAppMode(),
      userAgent: navigator.userAgent,
    };

    const targetUrl = Capacitor.isNativePlatform()
      ? 'https://xarxa.net/api/telemetry'
      : '/api/telemetry';

    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    window.sessionStorage?.setItem('xarxa_user_visit_reported', '1');
  } catch {
    // Non-fatal telemetry failure
  }
}

/**
 * Reports when a user accesses or focuses on a specific station.
 * Deduplicates per station per session to avoid notification spam while browsing.
 */
export async function reportStationAccess(stationName, extra = {}) {
  if (!stationName || typeof window === 'undefined') return;

  try {
    const key = `xarxa_st_reported_${stationName}`;
    if (window.sessionStorage?.getItem(key) === '1') {
      return;
    }

    if (!isNormalUserEnvironment()) {
      return;
    }

    let platform = 'Web Desktop';
    if (Capacitor.isNativePlatform()) {
      platform = isAndroid() ? 'Android Native' : 'iOS Native';
    } else if (isIosDevice(navigator.userAgent, navigator.maxTouchPoints)) {
      platform = 'iOS Safari (Web)';
    } else if (isAndroid()) {
      platform = 'Android Chrome (Web)';
    }

    const payload = {
      type: 'station_access',
      station: stationName,
      lines: extra.lines || null,
      zone: extra.zone || null,
      platform,
      path: window.location.pathname + window.location.search,
      mode: getAppMode(),
      userAgent: navigator.userAgent,
    };

    const targetUrl = Capacitor.isNativePlatform()
      ? 'https://xarxa.net/api/telemetry'
      : '/api/telemetry';

    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    window.sessionStorage?.setItem(key, '1');
  } catch {
    // Non-fatal
  }
}

/**
 * Reports major application incidents and crashes to Telegram.
 */
export async function reportIncident(incidentData) {
  if (typeof window === 'undefined') return;

  try {
    const errorKey = `xarxa_incident_${incidentData.error || ''}`.slice(0, 100);
    // Deduplicate same error during same session to avoid alert loops
    if (window.sessionStorage?.getItem(errorKey)) {
      return;
    }

    const targetUrl = Capacitor.isNativePlatform()
      ? 'https://xarxa.net/api/telemetry'
      : '/api/telemetry';

    await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'incident',
        ...incidentData,
        userAgent: navigator.userAgent,
        url: window.location.href,
        timestamp: new Date().toISOString(),
      }),
    });

    window.sessionStorage?.setItem(errorKey, '1');
  } catch {
    // Non-fatal
  }
}

/**
 * Initializes global uncaught error listeners for incident reporting.
 */
export function setupIncidentReporting() {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    if (!event.error && !event.message) return;
    const msg = event.message || event.error?.message || 'Unknown error';
    if (msg.includes('ResizeObserver') || msg.includes('chrome-extension://')) return;

    reportIncident({
      error: msg,
      stack: (event.error?.stack || '').slice(0, 1000),
      source: `${event.filename || ''}:${event.lineno || 0}:${event.colno || 0}`,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = typeof reason === 'string' ? reason : reason?.message || 'Unhandled Promise Rejection';
    if (msg.includes('ResizeObserver') || msg.includes('chrome-extension://')) return;

    reportIncident({
      error: msg,
      stack: (reason?.stack || '').slice(0, 1000),
      source: 'Promise Rejection',
    });
  });
}
