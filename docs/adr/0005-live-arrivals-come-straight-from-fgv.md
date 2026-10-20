# 5. Live Arrivals come straight from FGV

Date: 2026-10-20

## Status

Accepted. Replaces `metroapi.alexbadi.es` as the source of every live Arrival.

## Context

Live Arrivals came from `metroapi.alexbadi.es`, a third-party wrapper. A sweep of all 143 Stations on 2026-10-20, run against it and against FGV at the same instant, showed:

- **It adds nothing.** It relays FGV's own feed. Where both answered, they returned the same Vehicles, and arrival times agreed within about 1 s (median 0.7 s). Its `trainTimestamp` is just response time + seconds.
- **It refuses often.** It answered 69 Stations and returned HTTP 429 for 72, starting at about the 35th request. Each refusal is a Station whose Vehicles the map never hears about.
- **It costs plumbing.** It required a `User-Agent` containing `contact=`, a header browsers forbid. That needed a Vite proxy, a Netlify Function, and a native-only header to work around.

FGV's own feed was found by reading the open-source Valencia Transit Reloaded app, which says it uses "the same APIs as the official apps". It is `GET https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3/{stationId}`.
- **Access:** no key, and any User-Agent works.
- **Station ids:** the same space as `paradas_api.json`, so no id migration was needed.
- **Response:** trains grouped under each Line (`previsiones[].trains[]`), each with `seconds`, `destino` and `vehicle`. There is no timestamp, and the `latitude`/`longitude`/`meters` fields are always null.
- **The website's endpoint does not work.** `/ap18/api/...`, the one metrovalencia.es uses, accepts the connection but never answers outside callers. It is not an option.

## Decision

**Fetch every live Arrival directly from FGV's app endpoint.**

- **Native app:** calls FGV directly. CapacitorHttp runs fetch over native networking, which has no CORS.
- **Web build:** calls the same-origin `/api/metro/horarios-prevision-3/{id}`. The Vite dev proxy and `netlify/functions/metro-proxy.js` forward it to FGV, because FGV's `Access-Control-Allow-Origin` admits only FGV's own sites. The proxy now exists for CORS, not for a header.
- **Parsing:** the store flattens the Line groups and anchors the Target Arrival Timestamp on the response time: `fetchedAt + seconds`, minus the Propagation Lag. The lag values stand, because the old `trainTimestamp` was the same quantity.
- **Timeout and retry:** each attempt is abandoned after 4 s and tried exactly once more. About 6% of FGV requests never answer, while the median answer takes about 0.4 s and p90 about 0.9 s. An HTTP error status is an answer and is not retried.

## Consequences

**FGV returns at most 8 trains per Station, shared across every Line and both directions.** A five-Line interchange like Àngel Guimerà therefore hears only one or two trains per Line. The old Major Stations had been chosen to touch every Line, and so saw only 37% of Vehicles due within 20 min (Line 1: 17%). Station choice is now a coverage problem: `npm run sweep` measures it, and `live_stations.json` holds the result.

**The endpoint is undocumented.** FGV can move or close it without notice. `npm run sweep` doubles as a health check: a sweep with few usable Stations is the first sign. If it moves, the URL lives in three places: `arrivalStore.js`, the Vite proxy and the Netlify Function, plus the sweep script.

**No rate limit has been seen.** A full 143-Station sweep at three concurrent requests drew no 429. The store keeps its 429 backoff and 1 s dispatch spacing anyway; they cost nothing and the limit could appear.

**There is one fewer party to depend on and thank.** Thanks to the maintainer of `metroapi.alexbadi.es`, whose wrapper carried the live Arrivals until this change.
