import { describe, it, expect } from 'vitest';
import regionHandler from '../functions/region.js';

const call = async (headers, context) => {
  const res = await regionHandler(new Request('https://xarxa.net/api/region', { headers }), context);
  return { res, body: await res.json() };
};

describe('region function', () => {
  it('returns the Cloudflare country and nothing else', async () => {
    const { res, body } = await call({ 'cf-ipcountry': 'DE', 'cf-connecting-ip': '1.2.3.4' });
    expect(body).toEqual({ country: 'DE' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('falls back to the Netlify geo context', async () => {
    expect((await call({}, { geo: { country: { code: 'ES' } } })).body).toEqual({ country: 'ES' });
  });

  it('returns null when no source knows the country', async () => {
    expect((await call({})).body).toEqual({ country: null });
  });
});
