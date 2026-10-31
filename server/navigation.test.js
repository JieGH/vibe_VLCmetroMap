import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import { createNavigationHandler } from './navigation.js';

const servers = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))));
});

async function serve(options = {}) {
  const server = http.createServer(createNavigationHandler({ placeSearchUrl: '', otpUrl: '', ...options }));
  servers.push(server);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

describe('navigation HTTP boundary', () => {
  it('reports unavailable routing instead of returning an invented Journey when no backend is configured', async () => {
    const base = await serve();
    const response = await fetch(`${base}/api/journeys`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: { name: 'Xàtiva', coordinates: [-0.377, 39.466] }, to: { name: 'Colón', coordinates: [-0.37, 39.47] }, departureTime: new Date().toISOString() }),
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('routing-unavailable');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('allows the native app to preflight only the fixed navigation endpoints', async () => {
    const base = await serve();
    const response = await fetch(`${base}/api/journeys`, { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost' } });
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
    const denied = await fetch(`${base}/api/journeys`, { method: 'OPTIONS', headers: { Origin: 'https://unrelated.example' } });
    expect(denied.status).toBe(403);
    expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('rejects malformed and oversized requests without forwarding them', async () => {
    const base = await serve();
    for (const [body, status] of [['{', 400], ['x'.repeat(17 * 1024), 413]]) {
      const response = await fetch(`${base}/api/journeys`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      expect(response.status).toBe(status);
    }
  });

  it('keeps unknown upstream paths inaccessible', async () => {
    const base = await serve();
    const response = await fetch(`${base}/api/proxy?url=https://example.com`);
    expect(response.status).toBe(404);
  });
});
