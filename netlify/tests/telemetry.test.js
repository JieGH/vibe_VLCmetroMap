import { describe, it, expect } from 'vitest';
import telemetryHandler, { isBot, formatVisitTelegramMessage, formatIncidentTelegramMessage } from '../functions/telemetry.js';

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

  it('accepts normal user visit payload and formats Telegram message', async () => {
    const clientInfo = {
      ip: '85.50.12.34',
      city: 'Valencia',
      region: 'Valencian Community',
      country: 'ES',
    };
    const data = {
      platform: 'iOS Safari (Web)',
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
