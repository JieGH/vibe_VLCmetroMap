# Hosting on Cloudflare Workers

The public site can run on Cloudflare Workers (`wrangler.jsonc`, `worker/index.js`). Two things differ from Netlify, and both broke the first deploy:

1. **The basemap does not fit.** Workers static assets allow 25 MiB per file; `valencia.pmtiles` is 36 MB, and it is gitignored, so a build that only runs `npm run build` ships no basemap at all (the path then answers with the app's HTML, and the map fails to load). Fetch it at build time with a zoom cap: `BASEMAP_MAXZOOM=14` gives a 15 MB archive (the fetch script applies it by itself when `WORKERS_CI` is set, which Workers Builds always sets; without it the deploy stops with "Asset too large"), and MapLibre overzooms vector tiles sharply past zoom 14.
2. **There is no `/api/metro/*` route.** On Netlify that is `netlify/functions/metro-proxy.js`. The Worker calls the same handler for `/api/metro/*` and serves everything else from `dist/`. FGV does not answer datacentre hosts (ADR-0005), so `METRO_SOURCE` defaults to the relay (`vars` in `wrangler.jsonc`). Without it the page shows no live trains.

## Dashboard settings (Workers Builds)

| Setting | Value |
|---|---|
| Build command | `npm run fetch:basemap && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Build variable | none needed (`BASEMAP_MAXZOOM` overrides the default of 14) |

The deploy picks up `wrangler.jsonc` from the repository root. Change `METRO_SOURCE` there (`relay`, `auto` or `fgv`) rather than in the dashboard, so it is versioned.

## Check a deploy

- `curl -sI https://<site>/basemap/valencia.pmtiles` is `200` with a size near 16 MB, not `text/html`.
- `curl -s https://<site>/api/metro/horarios-prevision-3/7` is JSON with `previsiones`.

To try it locally: build with the capped archive, then `npx wrangler dev --local`.

## Live arrivals: FGV directly

FGV answers Cloudflare's edge (checked from the Madrid colo: 100 of 100 requests after the hedge was added), so `METRO_SOURCE` is `fgv` in `wrangler.jsonc` and the third-party relay is not used on this host. About 1 in 20 requests to FGV never answers; the proxy sends a second attempt after 1200 ms and allows 3.5 s in all (ADR-0006). If FGV ever refuses Cloudflare, set `METRO_SOURCE` to `auto` to fall back to the relay. The proxy forwards only `/api/metro/horarios-prevision-3/{id}`, as a read.

### Which branch builds

In Workers & Pages, Settings, Build, Branch control: the production branch is `main`; turn off "Builds for non-production branches", or `main` keeps building too. If `main` still builds, look for a second project connected to the same repository.

### Why the basemap is shipped in parts

Workers static assets do not honour HTTP `Range` on a cache hit: they answer a range request with a 200 and the whole file, and PMTiles then refuses it, so the map stays blank in some browsers (it worked in others, which made it look random). On Workers Builds `fetch_basemap.cjs` therefore runs `scripts/split_basemap.cjs`, which cuts the archive into 512 KiB parts (`valencia.pmtiles.p0` ...) with a manifest (`valencia.pmtiles.json`) and removes the full file. `MapView` loads the manifest first and, when it exists, reads tiles through `src/utils/chunkedSource.js`; hosts without a manifest (Netlify, the LAN server, the native apps) keep using Range requests on the single archive. A first view fetches only the few parts it needs (about 2 MB).
