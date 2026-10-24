<p align="center">
  <img src="public/favicon.svg" width="88" height="88" alt="">
</p>

<h1 align="center">Xarxa</h1>

<p align="center">
  Where every train on the Valencia metro is, right now — and when the next one reaches you.
</p>

<p align="center">
  <a href="https://tangerine-panda-1aeea5.netlify.app">
    <img src="https://img.shields.io/badge/Live%20Demo-Open%20the%20map-00C7B7?style=for-the-badge&logo=netlify&logoColor=white" alt="Open the live map">
  </a>
</p>

<p align="center">
  <a href="https://github.com/JieGH/vibe_VLCmetroMap/releases/latest">
    <img src="https://img.shields.io/badge/Android-Download%20the%20APK-3DDC84?style=for-the-badge&logo=android&logoColor=white" alt="Download the Android app">
  </a>
</p>

<p align="center">
  <a href="https://app.netlify.com/sites/tangerine-panda-1aeea5/deploys">
    <img src="https://api.netlify.com/api/v1/badges/a4a69dad-f39d-40ca-9f1c-317147d39bea/deploy-status" alt="Netlify deploy status">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License: Apache 2.0">
  </a>
  <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-lightgrey.svg" alt="Platforms: iOS, Android and Web">
</p>

---

Metrovalencia publishes when a train is <em>due</em> at a station. It does not publish where any train actually <em>is</em>. This app works that out: it takes the live arrival predictions, walks them backwards along the real rail geometry, and draws every train on the map at the position those predictions imply.


It runs as a website, an iOS app and an Android app, all from the same code.

<p align="center">
  <img src="docs/demo.gif" width="640" alt="Screen recording: the network with live trains, zooming in, then Alameda and Xàtiva stations opened for their departures, then the one-way east coast at Dr. Lluch with the return leg drawn beside the beach leg">
  <br><em>The web app on live FGV data: the network, two stations' departures, and the one-way east coast. <a href="docs/demo.mp4">Full-resolution video</a>.</em>
</p>

## Get it

The public website cannot reach FGV's live feed, so it reads an older relay that shows fewer trains (about 37% against over 80%). For the full picture:

- **Android:** [download the APK](https://github.com/JieGH/vibe_VLCmetroMap/releases/latest). It is not on Google Play, so Android asks permission to install it.
- **iPhone:** build it from source with a Mac and Xcode. See [iOS](#ios).
- **Your own Wi-Fi:** `npm run build && npm run serve` on a machine in Spain, then open the printed address on your phone.

Why the website is limited: [`docs/fgv-api.md`](docs/fgv-api.md).

## What it does

- **Live trains** on the real track, easing between positions as predictions update.
- **Departures** for any station: tap it for the next train each way.
- **Nearest station:** one press finds you and opens its departures. Your location never leaves the device.
- **Auto-locate:** if you have already allowed location, the app opens on you and your nearest station. It never asks on the web, and the first-launch prompt on the phone comes once.
- **Works offline:** the vector basemap ships with the app.
- **Departure board:** `?mode=dashboard` for a tablet or spare screen.
- **Honest markers:** a train fades as its position becomes a guess. Simulated trains are hollow and dashed. Trains on branches the map lacks are not drawn at all ([#2](https://github.com/JieGH/vib_metroValencia/issues/2)).

## How it works

FGV answers each station with its next trains and their countdowns, but not their positions. For each train, the engine (`src/services/trainPositionEngine.js`) starts at the station it is due at and steps backwards along the line. It spends each segment's measured running time and the dwell at each platform until the countdown runs out, and draws the train at that point. When a train is seen at several stations, those sightings settle its direction. The stations most trains pass are refreshed every two minutes.

Against live data this cut mean position error from 534 m (one constant speed) to 130 m. The reasoning: [ADR-0001](docs/adr/0001-walk-the-timetable-to-place-trains.md).

## Run it

```bash
npm install
npm run fetch:basemap   # offline map tiles (optional; without them the map blurs past zoom 16)
npm run dev             # http://localhost:5173
npm test -- --run && npm run lint
```

| Target | Command |
|---|---|
| Web, dev | `npm run dev` (`npm run dev:phone` to open it from a phone on the same Wi-Fi) |
| Self-hosted | `npm run build && npm run serve` (port 8080, LAN, no auth: trusted networks only) |
| Public site | Netlify rebuilds on every push to `main` |
| <a id="ios"></a>iOS | `npm run build` (also syncs iOS), then `npm run ios:open` and press Run in Xcode with your Apple ID as the team |
| Android | `npm run android:sync`, then `npm run android:open` and press Run |

Platform setup, server internals, and the things that exist only to keep a platform working are in [`docs/development.md`](docs/development.md).

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
- **Public website** uses the relay, not FGV (see above).
- **Station ids:** the GTFS and live-API id spaces disagree. Derive ids from `src/data/paradas_api.json`, never by hand.
- **`npm run dev` can load with no markers** (a StrictMode race, [#8](https://github.com/JieGH/vib_metroValencia/issues/8)). Check a production build before believing it.

## For contributors

Read `CONTEXT.md` (the glossary) before naming anything. Design decisions are in [`docs/adr/`](docs/adr/), and research and measurements in [`docs/research/`](docs/research/).

## Privacy, trademarks, license

An independent project, not affiliated with or endorsed by [FGV](https://www.fgv.es), which owns the Metrovalencia name, brand and data. No analytics, no accounts, no tracking. The only thing stored is a short-lived cache of predictions in `sessionStorage`.

Code: [Apache 2.0](LICENSE). FGV's data, OpenStreetMap's and the Metrovalencia brand carry their own terms. Thanks to FGV, OpenStreetMap's contributors and Protomaps.
