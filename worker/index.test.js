import { describe, it, expect, vi } from 'vitest';

vi.mock('../netlify/functions/metro-proxy.js', () => ({ default: vi.fn(async () => new Response('proxied')) }));
vi.mock('../netlify/functions/feedback.js', () => ({ default: vi.fn(async () => new Response('feedback-ok')) }));
vi.mock('../netlify/functions/telemetry.js', () => ({ default: vi.fn(async () => new Response('telemetry-ok')) }));
const { default: worker } = await import('./index.js');

const env = { ASSETS: { fetch: vi.fn(async () => new Response('asset')) } };

describe('worker routing', () => {
  it('sends /api/metro/* to the prevision proxy', async () => {
    const res = await worker.fetch(new Request('https://x.dev/api/metro/horarios-prevision-3/7'), env);
    expect(await res.text()).toBe('proxied');
  });
  it('sends /api/feedback to the feedback handler', async () => {
    const res = await worker.fetch(new Request('https://x.dev/api/feedback', { method: 'POST' }), env);
    expect(await res.text()).toBe('feedback-ok');
  });
  it('sends /api/telemetry to the telemetry handler', async () => {
    const res = await worker.fetch(new Request('https://x.dev/api/telemetry', { method: 'POST' }), env);
    expect(await res.text()).toBe('telemetry-ok');
  });
  it('serves everything else from the assets binding', async () => {
    const res = await worker.fetch(new Request('https://x.dev/basemap/valencia.pmtiles'), env);
    expect(await res.text()).toBe('asset');
    expect(env.ASSETS.fetch).toHaveBeenCalled();
  });
});
