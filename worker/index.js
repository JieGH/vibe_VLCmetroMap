// Cloudflare Workers entry for the public site. Static files come from the
// `dist/` assets binding; the one dynamic route, /api/metro/*, runs the same
// prevision proxy Netlify runs (netlify/functions/metro-proxy.js), so the two
// hosts cannot drift apart. FGV does not answer datacentre hosts (ADR-0005), so
// METRO_SOURCE defaults to the relay; set it in wrangler.jsonc `vars`.
import proxy from '../netlify/functions/metro-proxy.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/metro/')) return proxy(request);
    return env.ASSETS.fetch(request);
  },
};
