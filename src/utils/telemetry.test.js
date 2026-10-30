import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isNormalUserEnvironment,
  isDeveloperClient,
  reportNormalUserVisit,
  reportStationAccess,
  reportIncident,
} from './telemetry';

describe('telemetry utility', () => {
  let mockSessionStore;
  let mockSessionStorage;
  let mockLocalStore;
  let mockLocalStorage;

  beforeEach(() => {
    mockSessionStore = {};
    mockSessionStorage = {
      getItem: vi.fn((k) => mockSessionStore[k] ?? null),
      setItem: vi.fn((k, v) => {
        mockSessionStore[k] = String(v);
      }),
    };
    mockLocalStore = {};
    mockLocalStorage = {
      getItem: vi.fn((k) => mockLocalStore[k] ?? null),
      setItem: vi.fn((k, v) => {
        mockLocalStore[k] = String(v);
      }),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const setupWindow = ({
    webdriver = false,
    ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15',
    screenWidth = 390,
    screenHeight = 844,
    languages = ['es-ES', 'es'],
    search = '',
    hash = '',
    hostname = 'xarxa.net',
    timezone = 'Europe/Madrid',
  } = {}) => {
    vi.stubGlobal('navigator', {
      webdriver,
      userAgent: ua,
      language: languages[0],
      languages,
    });
    vi.stubGlobal('window', {
      screen: { width: screenWidth, height: screenHeight },
      innerWidth: screenWidth,
      innerHeight: screenHeight,
      sessionStorage: mockSessionStorage,
      localStorage: mockLocalStorage,
      location: { pathname: '/', search, hash, hostname },
    });
    vi.stubGlobal('document', {
      referrer: '',
    });
    vi.stubGlobal('Intl', {
      DateTimeFormat: () => ({
        resolvedOptions: () => ({ timeZone: timezone }),
      }),
    });
  };

  it('detects automated bot or headless environment correctly', () => {
    // Normal environment
    setupWindow();
    expect(isNormalUserEnvironment()).toBe(true);

    // Bot via webdriver
    setupWindow({ webdriver: true });
    expect(isNormalUserEnvironment()).toBe(false);

    // Bot via User-Agent
    setupWindow({ ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
    expect(isNormalUserEnvironment()).toBe(false);

    // Bot via missing screen dimensions
    setupWindow({ screenWidth: 0, screenHeight: 0 });
    expect(isNormalUserEnvironment()).toBe(false);
  });

  it('identifies developer client via query param, localStorage, localhost, or fingerprint', () => {
    // Normal user
    setupWindow({ screenWidth: 390, screenHeight: 844, languages: ['es-ES'] });
    expect(isDeveloperClient()).toBe(false);

    // Dev query param ?dev=1
    setupWindow({ search: '?dev=1' });
    expect(isDeveloperClient()).toBe(true);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('xarxa_dev_mode', '1');

    // Dev mode already saved in localStorage
    setupWindow();
    mockLocalStore['xarxa_dev_mode'] = '1';
    expect(isDeveloperClient()).toBe(true);
    delete mockLocalStore['xarxa_dev_mode'];

    // Localhost
    setupWindow({ hostname: 'localhost' });
    expect(isDeveloperClient()).toBe(true);

    // Author hardware fingerprint (440x956, Europe/Madrid, en-GB)
    setupWindow({
      screenWidth: 440,
      screenHeight: 956,
      timezone: 'Europe/Madrid',
      languages: ['en-GB'],
    });
    expect(isDeveloperClient()).toBe(true);
    expect(mockLocalStorage.setItem).toHaveBeenCalledWith('xarxa_dev_mode', '1');
  });

  it('suppresses user visits and station access telemetry for developer client', async () => {
    // Setup author device fingerprint
    setupWindow({
      screenWidth: 440,
      screenHeight: 956,
      timezone: 'Europe/Madrid',
      languages: ['en-GB'],
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    await reportNormalUserVisit();
    expect(mockFetch).not.toHaveBeenCalled();

    await reportStationAccess('Colón');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('reports normal user visit once per session', async () => {
    setupWindow({
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      languages: ['es'],
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    // First visit in session
    await reportNormalUserVisit();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('xarxa_user_visit_reported', '1');

    // Subsequent call in same session is deduplicated
    await reportNormalUserVisit();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports station access with station name and deduplicates within session', async () => {
    setupWindow();
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    await reportStationAccess('Colón', { lines: ['3', '7', '9'], zone: 'A' });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/telemetry',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"station":"Colón"'),
      })
    );
    expect(mockSessionStorage.setItem).toHaveBeenCalledWith('xarxa_st_reported_Colón', '1');

    // Clicking same station in same session is deduplicated
    await reportStationAccess('Colón');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Clicking another station sends report
    await reportStationAccess('Xàtiva');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('reports runtime incidents to telemetry endpoint', async () => {
    setupWindow();
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    await reportIncident({
      error: 'Map worker failed to initialize',
      source: 'MapView.jsx:45',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/telemetry',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});

describe('reportIncident noise filter', () => {
  it('does not send a stale-chunk load error', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { sessionStorage: { getItem: () => null, setItem: () => {} }, location: { href: 'https://xarxa.net/' } });
    await reportIncident({
      error: "'text/html' is not a valid JavaScript MIME type for module script 'https://xarxa.net/assets/MapView-C7SPjvDb.js'.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('does not send an error thrown by a wallet browser\'s injected script', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('window', { sessionStorage: { getItem: () => null, setItem: () => {} }, location: { href: 'https://xarxa.net/' } });
    await reportIncident({
      error: "TypeError: undefined is not an object (evaluating 'window.ethereum.selectedAddress = undefined')",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
