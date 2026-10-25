import { describe, it, expect, vi } from 'vitest';

vi.mock('../netlify/functions/metro-proxy.js', () => ({ default: vi.fn(async () => new Response('proxied')) }));
const { default: worker } = await import('./index.js');

const env = { ASSETS: { fetch: vi.fn(async () => new Response('asset')) } };

describe('worker routing', () => {
  it('sends /api/metro/* to the prevision proxy', async () => {
    const res = await worker.fetch(new Request('https://x.dev/api/metro/horarios-prevision-3/7'), env);
    expect(await res.text()).toBe('proxied');
  });
  it('serves everything else from the assets binding', async () => {
    const res = await worker.fetch(new Request('https://x.dev/basemap/valencia.pmtiles'), env);
    expect(await res.text()).toBe('asset');
    expect(env.ASSETS.fetch).toHaveBeenCalled();
  });
});

describe('probe route', () => {
  it('reports whether FGV answered, with the edge location', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"previsiones":[]}', { status: 200 }));
    const res = await worker.fetch(new Request('https://x.dev/api/probe'), env);
    const body = await res.json();
    expect(body.fgv).toMatchObject({ ok: true, status: 200 });
    fetchSpy.mockRestore();
  });
  it('reports an error instead of throwing when FGV is unreachable', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const body = await (await worker.fetch(new Request('https://x.dev/api/probe'), env)).json();
    expect(body.fgv).toMatchObject({ ok: false, error: 'fetch failed' });
    fetchSpy.mockRestore();
  });
});
