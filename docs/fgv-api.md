# FGV live Arrivals endpoint

The one endpoint this app uses for live Arrivals. FGV publishes no documentation for it: everything here was found by reading the open-source Valencia Transit Reloaded app (which says it uses "the same APIs as the official apps") and by probing it. Last checked 2026-10-20. The decision to use it is ADR-0005.

**It can change or close without notice.** `npm run sweep` doubles as a health check: a sweep with few usable Stations is the first sign.

## Request

```
GET https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3/{stationId}
Accept: application/json
```

- **No key, no login.** Any `User-Agent` works.
- **`{stationId}`** is the id in `src/data/paradas_api.json` (`apiId` on a Station), 143 Stations. Never type one by hand.
- The response sets `XSRF-TOKEN` and `fgv_api_session` cookies. Neither is needed.

## Response

Trains are grouped under each Line that has any:

```json
{
  "previsiones": [
    {
      "line": 1, "line_id": 1, "linea_id_interna": 42,
      "trains": [
        { "cabecera": false, "destino": "L'Alcúdia", "seconds": 50, "vehicle": 1162,
          "capacity": 397, "line_id": 1,
          "latitude": null, "longitude": null, "meters": null }
      ]
    }
  ],
  "aforo_bloqueado": { "desde": null, "hasta": null }
}
```

| Field | Meaning |
|---|---|
| `previsiones[].line` / `line_id` | Line number, `1`–`10`. The app reads `line ?? line_id`. |
| `trains[].destino` | Headsign, in Valencian. |
| `trains[].seconds` | Seconds until the Vehicle reaches this Station, counted from the moment of the response. |
| `trains[].vehicle` | Vehicle number. The same Vehicle appears at several Stations at once. |
| `trains[].capacity` | Vehicle capacity. Not used by the app. |
| `latitude`, `longitude`, `meters` | Always `null`. FGV gives no positions; the app walks the timetable instead (ADR-0001). |

## Behaviour that shapes the app

- **At most 8 trains per Station**, shared across every Line and both directions. A five-Line interchange hears only one or two trains per Line. This is why Major Stations are chosen by coverage (`npm run sweep`), not by Lines served.
- **No timestamp.** The Target Arrival Timestamp is the time the response arrived plus `seconds`, minus the Propagation Lag.
- **About 6% of requests never answer** (no status, no error). The median answer takes about 0.4 s and p90 about 0.9 s, so the app abandons an attempt after 4 s and retries once. An HTTP error status is an answer and is not retried.
- **No rate limit seen.** A full 143-Station sweep at three concurrent requests drew no 429.
- **Empty `previsiones`** is a normal answer for a Station with no trains due.

## Browsers cannot call it directly

`Access-Control-Allow-Origin` lists only FGV's own sites (`www.fgv.es`, `accesible.fgv.es`, a few vendor hosts). So:

| Where | How it reaches FGV |
|---|---|
| Native iOS app | Directly. CapacitorHttp runs `fetch` over native networking, which has no CORS. |
| Vite dev and `vite preview` | The `/api/metro` proxy in `vite.config.js`. |
| Production web | `netlify/functions/metro-proxy.js`. |
| Self-hosted (`npm run serve`) | `server/prevision.js`, with hedging and a 10 s cache (ADR-0006). |

The web build requests `/api/metro/horarios-prevision-3/{id}`; both proxies rewrite that to the FGV path above.

**Observed 2026-10-20: the Netlify Function cannot reach FGV.** From a home connection in Spain the endpoint answers in about 0.4 s. From the deployed Netlify Function every request ends after about 11 s with `TypeError: fetch failed` (HTTP 502), which is a connection that never completes rather than an HTTP error. A diagnostic run from the function (AWS us-east-2, 3.19.68.39) showed the FGV endpoint with plain headers, the same endpoint with browser headers, and the FGV homepage all timing out, while the old relay answered in 1.8 s. So headers are not the cause: FGV drops connections from that address range or from outside Spain, as `/ap18/` already does for outside callers. Which of the two has not been tested.

The function therefore serves the public website from the old relay by default, reshaping its rows to FGV's grouping. `METRO_SOURCE` overrides that: `auto` tries FGV first and falls back, `fgv` uses FGV alone.

## Other paths on the same API

Seen but unused: `estaciones`, `lineas`, `incidencias`, and `POST horarios-online2`. They live under the same `/fgv/app/es/api/v1/V/` base.

## Not the same as

- **`/ap18/api/...`**, the path metrovalencia.es uses. It accepts the connection and never answers outside callers.
- **MITRAMS's national access point.** It serves the GTFS timetable (Metrovalencia is file 1168) behind an ApiKey, with no real-time feed. The app's `npm run fetch:gtfs` uses that.
- **`metroapi.alexbadi.es`**, the third-party relay this app used before ADR-0005. It passed this same feed through.

## If it breaks

1. `npm run sweep`. Few usable Stations means the endpoint moved or closed.
2. The URL lives in `src/services/arrivalStore.js`, `vite.config.js`, `netlify/functions/metro-proxy.js`, `server/prevision.js`, `scripts/measure_latency.cjs` and `scripts/sweep_coverage.cjs`.
3. Read the open-source Valencia Transit Reloaded app for the current path.
