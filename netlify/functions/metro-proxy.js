// Replaces the dev-only Vite proxy (vite.config.js) in production. A
// netlify.toml redirect can't do this: Netlify's proxy overwrites any
// custom User-Agent with the real client's, same restriction as Vercel's
// Edge runtime. A Function does its own server-side fetch(), which has no
// such restriction. Keep the User-Agent value in sync with vite.config.js.
export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/metro/, '');
  const target = `https://metroapi.alexbadi.es${path}${url.search}`;

  const upstream = await fetch(target, {
    method: req.method,
    headers: {
      'User-Agent': 'vib-metro-valencia/1.0 (Web; contact=dev@example.com)',
      'Accept': req.headers.get('accept') || 'application/json',
    },
  });

  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') || 'application/json' },
  });
};

export const config = { path: '/api/metro/*' };
