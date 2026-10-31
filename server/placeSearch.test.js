import { describe, expect, it, vi } from 'vitest';
import { createPlaceSearchHandler } from './placeSearch.js';

const request = async (handler, url = '/api/places?q=biblioteca') => {
  const res = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = JSON.parse(body); } };
  await handler({ method: 'GET', url }, res);
  return res;
};

describe('place-search HTTP boundary', () => {
  it('returns a named Valencia landmark from an explicitly configured Photon service', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ features: [{
      geometry: { type: 'Point', coordinates: [-0.3698, 39.4694] },
      properties: { osm_type: 'W', osm_id: 251, name: 'Biblioteca Històrica', street: 'Carrer de la Universitat', housenumber: '2', city: 'València' },
    }] })));
    const res = await request(createPlaceSearchHandler({ endpoint: 'https://search.example/api/', fetchImpl }));
    expect(res.statusCode).toBe(200);
    expect(res.body.places).toEqual([{
      id: 'photon:W:251', name: 'Biblioteca Històrica', address: 'Carrer de la Universitat 2, València',
      coordinates: [-0.3698, 39.4694], source: 'photon', attribution: '© OpenStreetMap contributors',
    }]);
    const [url] = fetchImpl.mock.calls[0];
    expect(url.hostname).toBe('search.example');
    expect(url.searchParams.get('q')).toBe('biblioteca');
    expect(url.searchParams.get('bbox')).toBe('-0.85,39.1,0.1,39.95');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('does not silently rely on a public demo when no service has been configured', async () => {
    const fetchImpl = vi.fn();
    const response = await request(createPlaceSearchHandler({ endpoint: '', fetchImpl }));
    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ error: 'place-search-unconfigured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns an unavailable response when the provider refuses or returns malformed data', async () => {
    for (const response of [new Response('{}', { status: 429 }), new Response('<html>error</html>'), new Response('{}')]) {
      const handler = createPlaceSearchHandler({ endpoint: 'https://search.example/api/', fetchImpl: async () => response });
      const res = await request(handler);
      expect(res.statusCode).toBe(503);
      expect(res.body).toEqual({ error: 'place-search-unavailable' });
    }
  });

  it('keeps results within metropolitan Valencia and supplies labels for street addresses', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ features: [
      { geometry: { type: 'Point', coordinates: [-0.37, 39.47] }, properties: { osm_type: 'N', osm_id: 1, street: 'Carrer Major', housenumber: '10', city: 'València' } },
      { geometry: { type: 'Point', coordinates: [-3.7, 40.4] }, properties: { osm_type: 'N', osm_id: 2, name: 'Madrid' } },
      { geometry: { type: 'Point', coordinates: ['-0.37', '39.47'] }, properties: { name: 'Invalid coordinates' } },
    ] }));
    const res = await request(createPlaceSearchHandler({ endpoint: 'https://search.example/api/', fetchImpl }));
    expect(res.body.places).toEqual([{
      id: 'photon:N:1', name: 'Carrer Major 10', address: 'Carrer Major 10, València',
      coordinates: [-0.37, 39.47], source: 'photon', attribution: '© OpenStreetMap contributors',
    }]);
  });
});
