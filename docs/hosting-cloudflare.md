# Hosting on Cloudflare Workers

The public site can run on Cloudflare Workers (`wrangler.jsonc`, `worker/index.js`). Two things differ from Netlify, and both broke the first deploy:

1. **The basemap does not fit.** Workers static assets allow 25 MiB per file; `valencia.pmtiles` is 36 MB, and it is gitignored, so a build that only runs `npm run build` ships no basemap at all (the path then answers with the app's HTML, and the map fails to load). Fetch it at build time with a zoom cap: `BASEMAP_MAXZOOM=14` gives a 15 MB archive, and MapLibre overzooms vector tiles sharply past zoom 14.
2. **There is no `/api/metro/*` route.** On Netlify that is `netlify/functions/metro-proxy.js`. The Worker calls the same handler for `/api/metro/*` and serves everything else from `dist/`. FGV does not answer datacentre hosts (ADR-0005), so `METRO_SOURCE` defaults to the relay (`vars` in `wrangler.jsonc`). Without it the page shows no live trains.

## Dashboard settings (Workers Builds)

| Setting | Value |
|---|---|
| Build command | `npm run fetch:basemap && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variable | `BASEMAP_MAXZOOM` = `14` |

The deploy picks up `wrangler.jsonc` from the repository root. Change `METRO_SOURCE` there (`relay`, `auto` or `fgv`) rather than in the dashboard, so it is versioned.

## Check a deploy

- `curl -sI https://<site>/basemap/valencia.pmtiles` is `200` with a size near 16 MB, not `text/html`.
- `curl -s https://<site>/api/metro/horarios-prevision-3/7` is JSON with `previsiones`.

To try it locally: build with the capped archive, then `npx wrangler dev --local`.
