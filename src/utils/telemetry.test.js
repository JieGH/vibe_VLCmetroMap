import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isNormalUserEnvironment,
  reportNormalUserVisit,
  reportIncident,
} from './telemetry';

describe('telemetry utility', () => {
  let mockSessionStore;
  let mockSessionStorage;

  beforeEach(() => {
    mockSessionStore = {};
    mockSessionStorage = {
      getItem: vi.fn((k) => mockSessionStore[k] ?? null),
      setItem: vi.fn((k, v) => {
        mockSessionStore[k] = String(v);
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
      location: { pathname: '/', search: '' },
    });
    vi.stubGlobal('document', {
      referrer: '',
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
