// Photon explicitly supports autocomplete; its public demo has no availability guarantee.
// Supply a compatible endpoint deliberately via PLACE_SEARCH_URL, rather than relying on that demo.
const BOUNDS = [-0.85, 39.1, 0.1, 39.95];
const ATTRIBUTION = '© OpenStreetMap contributors';

const text = value => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
const join = values => [...new Set(values.map(text).filter(Boolean))].join(', ');

const placeFromFeature = feature => {
  const coordinates = feature?.geometry?.coordinates;
  if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length !== 2 ||
      !coordinates.every(Number.isFinite) || coordinates[0] < BOUNDS[0] || coordinates[0] > BOUNDS[2] ||
      coordinates[1] < BOUNDS[1] || coordinates[1] > BOUNDS[3]) return null;
  const p = feature.properties || {};
  const street = [text(p.street), text(p.housenumber)].filter(Boolean).join(' ');
  const locality = p.city || p.town || p.village || p.district;
  const name = text(p.name) || street || text(locality);
  if (!name) return null;
  return {
    id: `photon:${text(p.osm_type) || 'place'}:${text(p.osm_id) || coordinates.join(',')}`,
    name,
    address: join([street, p.postcode, locality]),
    coordinates,
    source: 'photon',
    attribution: ATTRIBUTION,
  };
};

/** Fixed-route handler: queries cannot select the upstream server. */
export const createPlaceSearchHandler = ({
  endpoint = process.env.PLACE_SEARCH_URL,
  fetchImpl = globalThis.fetch,
} = {}) => async (req, res) => {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(405, { error: 'method-not-allowed' });
  }
  const requestUrl = new URL(req.url, 'http://localhost');
  const query = (requestUrl.searchParams.get('q') || '').trim();
  if (query.length < 3) return send(200, { places: [], attribution: ATTRIBUTION });
  if (query.length > 160) return send(400, { error: 'query-too-long' });
  if (!endpoint) return send(503, { error: 'place-search-unconfigured' });
  try {
    const upstream = new URL(endpoint);
    if (!['http:', 'https:'].includes(upstream.protocol)) return send(503, { error: 'place-search-unconfigured' });
    upstream.searchParams.set('q', query);
    upstream.searchParams.set('limit', '8');
    upstream.searchParams.set('bbox', BOUNDS.join(','));
    const response = await fetchImpl(upstream, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return send(503, { error: 'place-search-unavailable' });
    const result = await response.json();
    if (!Array.isArray(result.features)) return send(503, { error: 'place-search-unavailable' });
    const ids = new Set();
    const places = result.features.map(placeFromFeature).filter(place => {
      if (!place || ids.has(place.id)) return false;
      ids.add(place.id);
      return true;
    }).slice(0, 8);
    return send(200, { places, attribution: ATTRIBUTION });
  } catch {
    return send(503, { error: 'place-search-unavailable' });
  }
};
