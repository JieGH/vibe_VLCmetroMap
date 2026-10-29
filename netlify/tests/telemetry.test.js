import { describe, it, expect } from 'vitest';
import telemetryHandler, {
  isBot,
  isDevRequest,
  formatVisitTelegramMessage,
  formatIncidentTelegramMessage,
  formatStationAccessTelegramMessage,
  formatApiTroubleTelegramMessage,
  isTroubleThrottled,
} from '../functions/telemetry.js';

describe('telemetry serverless function', () => {
  it('correctly classifies bots vs normal human user agents', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isBot('curl/8.4.0')).toBe(true);
    expect(isBot('python-requests/2.31.0')).toBe(true);
    expect(isBot('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/119.0.0.0')).toBe(true);
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36')).toBe(false);
  });

  it('drops bot requests with filtered: bot without forwarding to Telegram', async () => {
    const req = new Request('https://xarxa.net/api/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-agent': 'Googlebot/2.1',
      },
      body: JSON.stringify({ type: 'user_visit' }),
    });

    const res = await telemetryHandler(req, { NODE_ENV: 'test' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filtered).toBe('bot');
  });

  it('accepts normal user visit payload and formats Telegram message with station', async () => {
    const clientInfo = {
      ip: '85.50.12.34',
      city: 'Valencia',
      region: 'Valencian Community',
      country: 'ES',
    };
    const data = {
      platform: 'iOS Safari (Web)',
      station: 'Empalme',
      screen: '390x844',
      languages: 'es-ES, es',
      path: '/',
    };
    const html = formatVisitTelegramMessage({
      clientInfo,
      data,
      timestamp: '2026-10-25T20:20:00Z',
    });

    expect(html).toContain('Normal User Visit Detected');
    expect(html).toContain('85.50.12.34');
    expect(html).toContain('Valencia');
    expect(html).toContain('iOS Safari');
    expect(html).toContain('Empalme');
  });

  it('formats station access Telegram message with lines and zone', () => {
    const clientInfo = {
      ip: '85.50.12.34',
      city: 'Valencia',
      country: 'ES',
    };
    const data = {
      station: 'Xàtiva',
      lines: ['3', '5', '9'],
      zone: 'A',
      platform: 'Web Desktop',
    };
    const html = formatStationAccessTelegramMessage({
      clientInfo,
      data,
      timestamp: '2026-10-25T22:00:00Z',
    });

    expect(html).toContain('Station Accessed by User');
    expect(html).toContain('Xàtiva');
    expect(html).toContain('3, 5, 9');
    expect(html).toContain('Zone:</b> A');
  });

  it('handles station_access POST requests properly', async () => {
    const req = new Request('https://xarxa.net/api/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X)',
      },
      body: JSON.stringify({
        type: 'station_access',
        station: 'Colón',
        lines: ['3', '7', '9'],
      }),
    });

    const res = await telemetryHandler(req, { NODE_ENV: 'test' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe('station_access');
  });

  it('filters developer traffic by IP, isDev flag, and device fingerprint', async () => {
    // Exclude by author IP
    expect(isDevRequest({ ip: '79.117.186.128' }, {})).toBe(true);
    expect(isDevRequest({ ip: '79.117.186.200' }, {})).toBe(true);

    // Exclude by isDev flag
    expect(isDevRequest({ ip: '192.0.2.1' }, { isDev: true })).toBe(true);

    // Exclude by hardware/browser fingerprint (iPhone 440x956 + Europe/Madrid + en-GB)
    expect(
      isDevRequest(
        { ip: '192.0.2.100' },
        { screen: '440x956 (dpr: 3)', timezone: 'Europe/Madrid', language: 'en-GB' }
      )
    ).toBe(true);

    // Normal user does not match
    expect(
      isDevRequest(
        { ip: '85.50.12.34' },
        { screen: '390x844 (dpr: 3)', timezone: 'Europe/Madrid', language: 'es-ES' }
      )
    ).toBe(false);

    // Telemetry handler drops dev requests with { ok: true, filtered: 'dev' }
    const devReq = new Request('https://xarxa.net/api/telemetry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X)',
        'x-forwarded-for': '79.117.186.128',
      },
      body: JSON.stringify({
        type: 'user_visit',
        screen: '440x956 (dpr: 3)',
        timezone: 'Europe/Madrid',
        language: 'en-GB',
      }),
    });

    const res = await telemetryHandler(devReq, { NODE_ENV: 'test' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.filtered).toBe('dev');
  });

  it('formats major incident report with error stack trace', () => {
    const clientInfo = { ip: '192.0.2.1', country: 'ES' };
    const data = {
      error: 'Uncaught TypeError: MapLibre failed to compile shader',
      source: 'MapView.jsx:100',
      stack: 'Error: shader error\n  at MapView.jsx:100',
    };
    const html = formatIncidentTelegramMessage({
      clientInfo,
      data,
      timestamp: '2026-10-25T20:20:00Z',
    });

    expect(html).toContain('MAJOR INCIDENT REPORT');
    expect(html).toContain('MapLibre failed to compile shader');
    expect(html).toContain('MapView.jsx:100');
  });
});

describe('#144 api_trouble alerts', () => {
  const post = (body, ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 Version/18.2 Mobile/15E148 Safari/604.1') =>
    telemetryHandler(new Request('https://xarxa.net/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': ua, 'x-nf-client-connection-ip': '79.117.186.128' },
      body: JSON.stringify(body),
    }), { NODE_ENV: 'test' });

  it('formats a refusal with the failure class and the request rate', () => {
    const html = formatApiTroubleTelegramMessage({
      clientInfo: { ip: '85.50.12.34', city: 'Valencia' },
      data: { api: 'bus', kind: 'blocked', status: 403, failuresInARow: 3, requestsLast10s: 14, requestsLast60s: 40, platform: 'iOS Native' },
      timestamp: '2026-10-29T10:00:00.000Z',
    });
    expect(html).toContain('EMT bus (SAE)');
    expect(html).toContain('REFUSED');
    expect(html).toContain('HTTP 403');
    expect(html).toContain('14 in 10 s, 40 in 60 s');
    expect(html).toContain('iOS Native');
  });

  it('formats rate limiting and recovery', () => {
    expect(formatApiTroubleTelegramMessage({ clientInfo: {}, data: { api: 'train', kind: 'rate-limited', status: 429 }, timestamp: 't' })).toContain('RATE-LIMITED');
    const rec = formatApiTroubleTelegramMessage({ clientInfo: {}, data: { api: 'bus', recovered: true, downForMs: 42000 }, timestamp: 't' });
    expect(rec).toContain('answering again');
    expect(rec).toContain('~42 s');
  });

  it('escapes anything the client sent', () => {
    const html = formatApiTroubleTelegramMessage({ clientInfo: {}, data: { api: 'bus', kind: 'blocked', platform: '<b>x</b>' }, timestamp: 't' });
    expect(html).not.toContain('<b>x</b>');
  });

  it('is delivered even from the owner\'s own device (the dev filter does not apply)', async () => {
    const res = await post({ type: 'api_trouble', api: 'train', kind: 'blocked', isDev: true });
    expect(await res.json()).toEqual({ ok: true, type: 'api_trouble' });
  });

  it('still drops bots, and ignores an unknown API', async () => {
    expect((await (await post({ type: 'api_trouble', api: 'bus', kind: 'blocked' }, 'curl/8.4.0')).json()).filtered).toBe('bot');
    expect((await (await post({ type: 'api_trouble', api: 'nope', kind: 'blocked' })).json()).throttled).toBe(true);
  });

  it('sends one alert per API and kind per 10 minutes', () => {
    expect(isTroubleThrottled('bus:test-kind', 1000)).toBe(false);
    expect(isTroubleThrottled('bus:test-kind', 1000 + 60_000)).toBe(true);
    expect(isTroubleThrottled('bus:test-kind', 1000 + 11 * 60_000)).toBe(false);
  });
});
