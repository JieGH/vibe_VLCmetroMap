// Cloudflare Workers entry for the public site. Static files come from the
// `dist/` assets binding; /api/metro/* runs the same prevision proxy Netlify
// runs (netlify/functions/metro-proxy.js), so the two hosts cannot drift apart.
// FGV answers Cloudflare's edge (tested from the Madrid colo), so METRO_SOURCE
// is `fgv` in wrangler.jsonc: FGV only, hedged against its hung requests.
import proxy from '../netlify/functions/metro-proxy.js';
import feedback from '../netlify/functions/feedback.js';
import telemetry from '../netlify/functions/telemetry.js';
import region from '../netlify/functions/region.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/metro/')) return proxy(request);
    if (pathname === '/api/feedback') return feedback(request, env);
    if (pathname === '/api/telemetry') return telemetry(request, env);
    if (pathname === '/api/region') return region(request);
    return env.ASSETS.fetch(request);
  },
};
