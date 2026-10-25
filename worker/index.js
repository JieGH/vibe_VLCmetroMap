// Cloudflare Workers entry for the public site. Static files come from the
// `dist/` assets binding; /api/metro/* runs the same prevision proxy Netlify
// runs (netlify/functions/metro-proxy.js).
//
// This branch tests whether FGV answers Cloudflare's edge (METRO_SOURCE=fgv in
// wrangler.jsonc, no relay fallback). /api/probe reports the answer directly:
//   curl https://<site>/api/probe
// -> { colo, country, fgv: { ok, status, ms, error } }
import proxy from '../netlify/functions/metro-proxy.js';

const PROBE_URL = 'https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3/7';

async function probe(request) {
  const started = Date.now();
  const fgv = {};
  try {
    const res = await fetch(PROBE_URL, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    fgv.ok = res.ok;
    fgv.status = res.status;
    fgv.bytes = (await res.text()).length;
  } catch (err) {
    fgv.ok = false;
    fgv.error = String(err?.message || err);
  }
  fgv.ms = Date.now() - started;
  return Response.json(
    { colo: request.cf?.colo ?? null, country: request.cf?.country ?? null, fgv },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/probe') return probe(request);
    if (pathname.startsWith('/api/metro/')) return proxy(request);
    return env.ASSETS.fetch(request);
  },
};
