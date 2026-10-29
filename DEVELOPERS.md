# Xarxa for developers

How the app works, how to run and build it, and where the data comes from. For what the app does and how to get it, see the [README](README.md).

More detail: [`docs/development.md`](docs/development.md) (platform setup, server internals, things that exist only to keep a platform working), [`CONTEXT.md`](CONTEXT.md) (the glossary: read it before naming anything), [`docs/adr/`](docs/adr/) (design decisions) and [`docs/research/`](docs/research/) (measurements).

## How it works

FGV answers each station with its next trains and their countdowns, but not their positions. For each train, the engine (`src/services/trainPositionEngine.js`) starts at the station it is due at and steps backwards along the line. It spends each segment's measured running time and the dwell at each platform until the countdown runs out, and draws the train at that point. When a train is seen at several stations, those sightings settle its direction. The stations most trains pass are refreshed every two minutes.

Against live data this cut mean position error from 534 m (one constant speed) to 130 m. The reasoning: [ADR-0001](docs/adr/0001-walk-the-timetable-to-place-trains.md).

Markers are honest about doubt: a train fades as its position becomes a guess, simulated trains are hollow and dashed, and trains on branches the map lacks are not drawn at all ([#2](https://github.com/JieGH/vib_metroValencia/issues/2)).

## Run it

```bash
npm install
npm run fetch:basemap   # offline map tiles (optional; without them the map blurs past zoom 16)
npm run dev             # http://localhost:5173
npm test -- --run && npm run lint
```

| Target | Command |
|---|---|
| Web, dev | `npm run dev` (`npm run dev:phone` to open it from a phone on the same Wi-Fi; location needs https, so a phone on `http://192.168...` cannot geolocate) |
| Self-hosted | `npm run build && npm run serve` (port 8080, LAN, no auth: trusted networks only) |
| Public site | https://xarxa.net, on Cloudflare Workers (`wrangler.jsonc`; see [docs/hosting-cloudflare.md](docs/hosting-cloudflare.md)). The old Netlify address only shows a "we have moved" notice |
| iOS | `npm run build` (also syncs iOS), then `npm run ios:open` and press Run in Xcode with your Apple ID as the team |
| Capacitor app (APK) | `npm run capacitor:sync`, then `npm run capacitor:open` and press Run; `npm run apk` builds a signed APK to `android/build/` without uploading |

Run the checks in this order before handing work over: `npm test -- --run && npm run lint`, then `npm run build` (which also syncs the iOS app).

## Where the live trains come from

The website and the native apps all read FGV's own keyless arrivals feed. A browser cannot call it directly (FGV's CORS policy admits only FGV's sites), so the website goes through a same-origin proxy that forwards only `/api/metro/horarios-prevision-3/{id}`: Vite in dev, `worker/index.js` on Cloudflare (hedged against FGV's occasional hung request), `server/` for self-hosting. FGV answers Cloudflare's Madrid edge directly; the older third-party relay is only used on the retired Netlify build. Background: [`docs/fgv-api.md`](docs/fgv-api.md), [ADR-0005](docs/adr/0005-live-arrivals-come-straight-from-fgv.md), [ADR-0006](docs/adr/0006-self-host-on-the-lan-with-a-prevision-only-proxy.md).

## Data

| Source | Used for |
|---|---|
| FGV's live arrivals endpoint (keyless, max 8 trains per station) | Predictions |
| [Metrovalencia GTFS](https://www.metrovalencia.es/google_transit_feed/google_transit.zip) | Stations and segment times (`npm run fetch:gtfs && npm run build:data`) |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Track geometry |
| [Protomaps](https://protomaps.com) | Offline basemap |

**Refetch the GTFS feed when positions look wrong:** an expired feed has no trips for today.

## Known limits

- **Branches:** a line is one polyline, so the branches to Machado, Torrent Avinguda and the L8 through-services are not drawn ([#2](https://github.com/JieGH/vib_metroValencia/issues/2)).
- **Station ids:** the GTFS and live-API id spaces disagree. Derive ids from `src/data/paradas_api.json`, never by hand.
- **`npm run dev` can load with no markers** (a StrictMode race, [#8](https://github.com/JieGH/vib_metroValencia/issues/8)). Check a production build before believing it.

## Releasing

1. Bump `android/version.properties` (`versionCode` up by at least 1, then `versionName`).
2. Commit, then push `main`.
3. `gh release create vX.Y.Z --title "..." --notes "..."`, then `scripts/release-apk.sh vX.Y.Z`. It signs the APK with the sideload key in `~/.android/xarxa-sideload.jks` (back it up; losing it means installed copies cannot update) and attaches two files: `Xarxa-vX.Y.Z-capacitor.apk` and `Xarxa-capacitor.apk`. The README and the website link to the latter through `releases/latest/download/Xarxa-capacitor.apk`, so they always get the newest.
4. Play Store steps, when relevant: [`docs/capacitor/release-checklist.md`](docs/capacitor/release-checklist.md).

## Privacy, trademarks, license

An independent project, not affiliated with or endorsed by [FGV](https://www.fgv.es), which owns the Metrovalencia name, brand and data, nor by EMT València, whose public bus arrival service it reads on demand (ADR-0011, ADR-0012). No analytics, no accounts, no tracking; the privacy policy is in [`docs/capacitor/privacy-policy.md`](docs/capacitor/privacy-policy.md).

Code: source-available, all rights reserved ([LICENSE](LICENSE)); reuse, redistribution or modification needs written permission. FGV's data, OpenStreetMap's and the Metrovalencia brand carry their own terms.
