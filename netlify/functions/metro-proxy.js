// Replaces the dev-only Vite proxy (vite.config.js) in production. FGV's CORS
// policy admits only FGV's own sites, so the browser build reaches FGV's live
// feed through this same-origin route instead. Keep the target in sync with
// vite.config.js. See ADR-0005.
const FGV_BASE = 'https://www.fgv.es/fgv/app/es/api/v1/V';

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/metro/, '');
  const target = `${FGV_BASE}${path}${url.search}`;

  const upstream = await fetch(target, {
    method: req.method,
    headers: { 'Accept': req.headers.get('accept') || 'application/json' },
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
};

export const config = { path: '/api/metro/*' };
