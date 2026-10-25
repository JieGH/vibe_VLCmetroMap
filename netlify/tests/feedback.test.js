import { describe, it, expect } from 'vitest';
import feedback, { extractClientInfo, formatTelegramMessage } from '../functions/feedback.js';

describe('netlify feedback function', () => {
  it('returns 200 with success: true and clientIp for a valid message', async () => {
    const req = new Request('https://xarxa.net/api/feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '198.51.100.42',
        'cf-ipcountry': 'ES',
      },
      body: JSON.stringify({ message: 'Love the high fps update!' }),
    });

    const res = await feedback(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.clientIp).toBe('198.51.100.42');
  });

  it('returns 400 when message is missing or whitespace', async () => {
    const req = new Request('https://xarxa.net/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });

    const res = await feedback(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('message is required');
  });

  it('returns 405 for non-POST requests', async () => {
    const req = new Request('https://xarxa.net/api/feedback', {
      method: 'GET',
    });

    const res = await feedback(req);
    expect(res.status).toBe(405);
  });

  describe('extractClientInfo', () => {
    it('extracts IP and geo headers from Cloudflare', () => {
      const req = new Request('https://xarxa.net/api/feedback', {
        headers: {
          'cf-connecting-ip': '80.25.10.1',
          'cf-ipcountry': 'ES',
          'cf-ipcity': 'Valencia',
        },
      });
      const info = extractClientInfo(req);
      expect(info.ip).toBe('80.25.10.1');
      expect(info.country).toBe('ES');
      expect(info.city).toBe('Valencia');
    });

    it('extracts IP and country from Netlify headers', () => {
      const req = new Request('https://xarxa.net/api/feedback', {
        headers: {
          'x-nf-client-connection-ip': '92.40.1.2',
          'x-country': 'CA',
        },
      });
      const info = extractClientInfo(req);
      expect(info.ip).toBe('92.40.1.2');
      expect(info.country).toBe('CA');
    });

    it('falls back to x-forwarded-for first address', () => {
      const req = new Request('https://xarxa.net/api/feedback', {
        headers: {
          'x-forwarded-for': '203.0.113.195, 70.41.3.18',
        },
      });
      const info = extractClientInfo(req);
      expect(info.ip).toBe('203.0.113.195');
    });
  });

  describe('formatTelegramMessage', () => {
    it('formats a complete HTML message with user IP, geo, device, and version info', () => {
      const text = formatTelegramMessage({
        cleanMsg: 'Station times look super fast & smooth <now>',
        email: 'user@example.com',
        clientInfo: { ip: '80.25.10.1', country: 'ES', city: 'Valencia' },
        metadata: {
          platform: 'iOS Native App',
          device: 'iPhone',
          screen: '390x844 (dpr: 3)',
          timezone: 'Europe/Madrid',
          language: 'ca',
          appVersion: '2026.10.25',
          gitSha: '62e1e3c',
        },
        timestamp: '2026-10-25T17:50:00.000Z',
      });

      expect(text).toContain('📬 <b>New Feedback on Xarxa</b>');
      expect(text).toContain('Station times look super fast &amp; smooth &lt;now&gt;');
      expect(text).toContain('• <b>IP:</b> <code>80.25.10.1</code> (Valencia, ES)');
      expect(text).toContain('• <b>Platform:</b> iOS Native App');
      expect(text).toContain('• <b>Device:</b> iPhone');
      expect(text).toContain('• <b>Screen:</b> <code>390x844 (dpr: 3)</code>');
      expect(text).toContain('• <b>Timezone:</b> <code>Europe/Madrid</code>');
      expect(text).toContain('• <b>Language:</b> <code>ca</code>');
      expect(text).toContain('• <b>Version:</b> <code>v2026.10.25 (62e1e3c)</code>');
      expect(text).toContain('• <b>Contact:</b> <code>user@example.com</code>');
    });
  });
});
