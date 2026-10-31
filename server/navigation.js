import { createPlaceSearchHandler } from './placeSearch.js';
import { createJourneyRouter } from './journeyRouting.js';

const BODY_LIMIT = 16 * 1024;
const NATIVE_ORIGINS = ['capacitor://localhost', 'https://localhost', 'http://localhost'];

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readRequest(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > BODY_LIMIT) {
      const error = new Error('Request too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

// Both the development and production servers expose these exact routes.
// The upstream addresses are operator configuration, never request parameters.
export function createNavigationHandler({
  placeSearchUrl = process.env.PLACE_SEARCH_URL,
  otpUrl = process.env.OTP_URL,
  feedManifestPath = process.env.OTP_GRAPH_MANIFEST,
  allowedOrigins = process.env.NAVIGATION_ALLOWED_ORIGINS?.split(',').map(value => value.trim()).filter(Boolean) ?? NATIVE_ORIGINS,
  fetchFn = globalThis.fetch,
  now = Date.now,
} = {}) {
  const search = createPlaceSearchHandler({ endpoint: placeSearchUrl, fetchImpl: fetchFn });
  const plan = createJourneyRouter({ otpUrl, feedManifestPath, fetchFn, now });

  return async (req, res, next) => {
    let pathname;
    try {
      pathname = new URL(req.url, 'http://localhost').pathname;
    } catch {
      return send(res, 400, { error: { code: 'invalid-request' } });
    }
    if (pathname !== '/api/places' && pathname !== '/api/journeys') {
      return next ? next() : send(res, 404, { error: { code: 'not-found' } });
    }
    const origin = req.headers.origin;
    // No cookies or credentials. Only explicit native/operated origins receive
    // cross-origin access; browser deployments otherwise use same-origin APIs.
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      if (!origin || !allowedOrigins.includes(origin)) return send(res, 403, { error: { code: 'origin-denied' } });
      res.setHeader('Access-Control-Allow-Methods', pathname === '/api/places' ? 'GET, OPTIONS' : 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.writeHead(204);
      return res.end();
    }
    try {
      if (pathname === '/api/places') return await search(req, res);
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return send(res, 405, { error: { code: 'method-not-allowed' } });
      }
      const type = (req.headers['content-type'] ?? '').split(';')[0].trim();
      if (type !== 'application/json') return send(res, 415, { error: { code: 'invalid-content-type' } });
      const input = await readRequest(req);
      const response = await plan(input);
      return send(res, response.status, response.body);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const status = error.status === 413 ? 413 : error instanceof SyntaxError ? 400 : 502;
      return send(res, status, { error: { code: status === 413 ? 'request-too-large' : status === 400 ? 'invalid-request' : 'navigation-unavailable' } });
    }
  };
}
