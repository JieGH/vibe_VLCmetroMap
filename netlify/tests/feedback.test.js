import { describe, it, expect } from 'vitest';
import feedback from '../functions/feedback.js';

describe('netlify feedback function', () => {
  it('returns 200 with success: true for a valid message', async () => {
    const req = new Request('https://xarxa.net/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Love the high fps update!' }),
    });

    const res = await feedback(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
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
});
