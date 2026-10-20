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

It runs as a website, as a native iOS app and as a native Android app, from the same code.

> **For the full experience, use the app.** The live demo above cannot reach FGV's live feed: FGV drops every connection from the web host (Netlify, on Amazon servers in the US), so the website has to read an older third-party relay instead, which rate-limits and shows fewer trains. The apps read FGV directly from your phone's own connection, which FGV does answer, and see about 80% of the trains due within 20 minutes, against about 37% on the website.
>
> - **Android:** [download the APK](https://github.com/JieGH/vibe_VLCmetroMap/releases/latest) and open it on the phone. It is not on Google Play, so Android asks permission to install from your browser. See [Android (native app)](#android-native-app).
> - **iPhone:** there is no download yet. Build it from source with a Mac, Xcode and a free Apple ID: see [iOS (native app)](#ios-native-app).
>
> The reason is in [`docs/fgv-api.md`](docs/fgv-api.md).

## See it working

<p align="center">
  <img src="docs/demo.gif" width="288" alt="Screen recording: the network with live trains, zooming in, then Alameda and Xàtiva stations opened for their departures">
</p>

<p align="center">
  <em>Recorded on an iPhone. <a href="docs/demo.mp4">Full-resolution video</a> (10 s, no audio).</em>
</p>

**What you are looking at**, in order:

1. **The whole network, live.** Every coloured dot on a line is a train the API is currently reporting, drawn at the position its arrival predictions imply rather than at a station. The counter at the bottom reads *"42 live trains · 20 confirmed at two stations"* — the second number is the trains sighted at two different stations at once, which pins them down far more tightly than a single prediction can.

2. **Zooming in.** Street names and building footprints stay sharp all the way down, because the basemap is vector and ships with the app. Nothing here is being fetched.

3. **Alameda, opened.** The bubble on the map shows the two directions with the next train each way; the panel below gives the detail — `5 → Aeroport · Marítim` and `3 → Rafelbunyol · Alboraia Peris Aragó · Torrent Avinguda +1`, then the individual trains with their unit numbers (#7033, #3040, #9033). `LIVE` and *"confirmed just now"* mean the API answered for this station moments ago.

4. **The countdown running.** Watch the top row go `<1 min` → **Due** while the recording plays. Those countdowns are absolute timestamps ticking down on the device, not repeated polling — which is why they stay correct between refreshes.

5. **Xàtiva, opened.** A different shape of station: both directions are line 9, and the arrows on the bubble point the way the track actually leaves the platform rather than simply up and down.

6. **Zooming back out** to the full network, north to Rafelbunyol and Puçol, south past Picassent.

## What you can do with it

**See the whole network moving.** Every train the API knows about, drawn on the actual track alignment rather than a schematic, easing between positions as the predictions update. Lines with no live data fall back to simulated trains — drawn hollow and dashed, so a guess never looks like a reported train.

**Tap a station for its departures.** The next train each way, prominently, then everything else due. Live where the API answered just now, and counting down from memory where it did not.

**Find your nearest station.** One press centres the map on you and opens the departures for the station you are closest to. Hold the same button to take your location back off the map. If the fix is too rough to tell two stations apart, it says so rather than guessing.

**Use it underground.** The basemap ships with the app — around 35 MB of vector tiles covering the whole Valencia region, read straight off disk. No network, no API key, and sharp all the way in to individual buildings.

**Leave it running as a departure board.** `?mode=dashboard` opens a full-screen board for an unattended tablet or a spare monitor. It is bookmarkable, so a kiosk can boot straight into it.

**Find things quickly.** Search any station or line, filter the map to a single line, and switch between a light and a dark map.

## What it is honest about

The app never pretends to know more than it does, and that is deliberate throughout:

- A train marker **fades as its position becomes a guess** — the longer the walk from a known prediction, and the longer since the last sync, the fainter it is drawn.
- A train that has run out of prediction entirely is fainter still, and separately so.
- A simulated train is **hollow and dashed**, never mistakable for a live one.
- Fourteen stations sit on branches the geometry does not have, so trains bound for them are **not drawn at all** rather than drawn in the wrong place ([#2](https://github.com/JieGH/vib_metroValencia/issues/2)).
- A location fix too imprecise to choose between neighbouring stations **refuses to choose**.

## Quick start

```bash
npm install
npm run fetch:basemap   # the offline map tiles — see Data pipeline
npm run dev             # http://localhost:5173
npm test
```

The app still runs without `fetch:basemap`; it falls back to online raster tiles that stop resolving past zoom 16.

## For the next person working on this

`CONTEXT.md` is the glossary — read it before naming anything. The decisions behind the design are in `docs/adr/`:

- [ADR-0001](docs/adr/0001-walk-the-timetable-to-place-trains.md) — why positions come from a timetable walk, not a speed constant
- [ADR-0002](docs/adr/0002-one-polyline-per-line-no-branches.md) — why branches are unsupported, and what that costs
- [ADR-0003](docs/adr/0003-gtfs-feeds-are-refetchable-input.md) — why feeds are fetched, not committed
- [ADR-0004](docs/adr/0004-geolocation-comes-from-the-capacitor-plugin.md) — why geolocation comes from the Capacitor plugin and never the browser

## Running the app

The same React app ships three ways: as a website, and as native iOS and Android apps via [Capacitor](https://capacitorjs.com). Both build from the same `src/`; nothing in the app code branches on which one you're using except `arrivalStore.js`'s fetch, explained below.

### Web

```bash
npm run dev        # http://localhost:5173, hot-reloading
npm run dev:phone  # same, but bound to 0.0.0.0 — open the printed
                   # Network URL on a phone on the same Wi-Fi
npm run build      # production bundle → dist/
npm run preview    # serves dist/ as it would be deployed
```

`npm run dev` and `dev:phone` proxy `/api/metro/*` to FGV's live arrivals feed through Vite's dev server. This isn't optional plumbing — FGV's CORS policy admits only FGV's own sites, so a browser cannot call the feed directly; a same-origin proxy can. The native iOS app has no such limit and calls FGV directly. See [ADR-0005](docs/adr/0005-live-arrivals-come-straight-from-fgv.md).

### Production deployment (Netlify)

The live site above runs on [Netlify](https://netlify.com), auto-rebuilding and republishing on every push to `main` — no manual deploy step. Netlify reads the build command and publish directory straight from [`netlify.toml`](netlify.toml); no dashboard configuration is needed beyond connecting the repo.

A static host has no dev server, so two things exist purely to cover what the dev proxy above did, and are easy to break by "cleaning up" without knowing why:

- **[`netlify/functions/metro-proxy.js`](netlify/functions/metro-proxy.js)** replaces the Vite dev proxy in production, forwarding `/api/metro/*` to FGV's live feed so the browser build stays same-origin. FGV does not answer Netlify's servers, so the public website uses the earlier relay (reshaped to FGV's format) by default; the iOS app and `npm run dev` use FGV. Set the Netlify environment variable `METRO_SOURCE` to `auto` (FGV first, relay if unreachable) or `fgv` to change that; see [`docs/fgv-api.md`](docs/fgv-api.md). Its FGV target must be kept in sync with `vite.config.js`'s dev proxy by hand — nothing enforces the two match.
- **`fetch:basemap` runs as part of the Netlify build command**, not just locally: the offline PMTiles archive is gitignored (see [Data pipeline](#data-pipeline)) and 404s in production without it. The `go-pmtiles` CLI it downloads publishes differently-named release assets per OS — hyphenated `.zip` on Darwin, underscored `.tar.gz` on Linux — so the script picks the filename and extraction method for whichever platform the build runs on, Netlify's Linux build image included.

Free-hosting options considered (GitHub Pages, Netlify, Vercel, Cloudflare Pages) and why Netlify won: [`docs/research/free-github-hosting.md`](docs/research/free-github-hosting.md).

### iOS (native app)

The native shell is a thin Capacitor wrapper: the same web build, running full-screen in a WKWebView, packaged as a real `.app`. No server, no Wi-Fi dependency for the UI — only the live arrivals need a network connection, same as the website.

**Prerequisites**

- A Mac with the full **Xcode** app installed (not just the Command Line Tools — `xcodebuild -version` should report a real version, not a CLT-only error)
- An Apple ID signed into Xcode (Xcode → Settings → Accounts). A free personal account is enough to run on your own device; it just needs re-installing from Xcode roughly every 7 days. A paid developer account removes that limit.
- An iPhone, connected by USB the first time

**Build and run**

```bash
npm install        # installs @capacitor/core, @capacitor/ios, @capacitor/cli
npm run ios:sync   # npm run build, then copies dist/ into ios/App/App/public
npm run ios:open   # opens ios/App/App.xcodeproj in Xcode
```

Then, in Xcode:

1. Select the **App** target → **Signing & Capabilities** → set **Team** to your Apple ID.
2. In the toolbar's device dropdown, choose your iPhone under **iOS Device** (not a simulator).
3. Press **Run** (▶ / Cmd-R).

First launch, iOS blocks the app as an "Untrusted Developer": on the phone, go to **Settings → General → VPN & Device Management** and trust the developer profile, then open the app from the home screen.

**After any code change**, re-run `npm run ios:sync` before hitting Run again in Xcode — it rebuilds the web bundle and re-copies it into the native project. Xcode doesn't watch `src/` itself.

### Android (native app)

The same Capacitor wrapper, in [`android/`](android/), packaged as an `.apk`. Like the iOS app it calls FGV directly from the phone, with no server and no proxy.

**Just want to install it?** Download `Xarxa-v*-android-debug.apk` from the [latest release](https://github.com/JieGH/vibe_VLCmetroMap/releases/latest) and open it on an Android 7.0 or newer phone. It is a debug-signed build, not a Play Store release, so Android asks you to allow installs from your browser and may warn that the app is unverified. The release notes carry its SHA-256. It has been run on an Android emulator and on a physical phone; FGV has to answer your connection, which it does in Spain and may not elsewhere.

**Build it yourself**

- [Android Studio](https://developer.android.com/studio), which bundles the JDK and SDK, or a JDK 21 plus the Android SDK command-line tools with platform 36.
- An Android phone with USB debugging on, or an emulator.

```bash
npm install
npm run android:sync   # npm run build, then copies dist/ into the Android project
npm run android:open   # opens android/ in Android Studio, then press Run (▶)
```

Without Android Studio: `cd android && ./gradlew assembleDebug` writes `app/build/outputs/apk/debug/app-debug.apk`, and `adb install -r` puts it on a connected phone. After any code change, re-run `npm run android:sync`.

Four things exist purely to make Android work, and are easy to break by "cleaning up" without knowing why:

- **`src/utils/boundedRangeSource.js`.** Capacitor's Android local server answers a `Range` request for the 36 MB basemap archive with `206` and a correct `Content-Range`, then streams the rest of the whole file instead of stopping at the end of the range. PMTiles read that as the slice it asked for, got a corrupt header, and the map drew no basemap. On Android the archive is read through a source that takes exactly the bytes asked for and cancels the rest.
- **`src/utils/uiScale.js`.** The interface is drawn at 88% on Android (CSS `zoom` on the root, with the full-screen containers stretched back out in `index.css`, because zoom does not scale viewport units). Not done through the viewport meta tag: in this WebView that widens the layout without shrinking the display and cuts off the right edge.
- **The location permissions** in `android/app/src/main/AndroidManifest.xml`. The geolocation plugin does not add them, and the locate button needs them.
- **The icon and splash** in `android/app/src/main/res/` are generated from the iOS artwork (`AppIcon-512@2x.png` and the 2732 px splash, on the brand dark `#1D1D29`): launcher icons at every density, adaptive-icon foregrounds with the glyph at 75% so a round mask does not clip its arms, splash backgrounds in every size, and the Android 12+ system splash icon (`drawable-nodpi/splash_icon.png`, glyph at 70%), which otherwise shows a default icon on white. Regenerate them with `sips` if the artwork changes.

Two things exist purely to make this build path work, and are easy to break by "cleaning up" without knowing why:

- **`capacitor.config.json`'s `plugins.CapacitorHttp.enabled`.** WKWebView's `fetch` is still browser `fetch` — it can't set `User-Agent` either. Enabling `CapacitorHttp` patches `fetch` to route through native networking instead, which isn't subject to that restriction. `arrivalStore.js` checks `Capacitor.isNativePlatform()` and on that path calls FGV directly, which is why the app sees FGV when the website cannot; the web build uses the same-origin proxy above. The same applies to the Android app.
- **`public/vendor/maplibre/`.** MapLibre resolves its own web-worker URL from `import.meta.url`, which Vite's bundler never emits as an actual file — the map's lines and tiles render in `npm run dev` (Vite serves the real file from `node_modules` directly) but silently fail in any production build, native app included. These two files are an unmodified copy of MapLibre's worker and its shared chunk, kept as static assets so the path always resolves. If `maplibre-gl` is upgraded, re-copy both files from `node_modules/maplibre-gl/dist/`.

## How a train gets on the map

1. **Boot.** `arrivalStore.seedStrategicHubs()` fetches three interchange stations.
2. **Predictions land.** The API answers "vehicle 5301 reaches Àngel Guimerà in 415s", stamped with an absolute `trainTimestamp`. `arrivalStore` keeps these in memory and in `sessionStorage`.
3. **Positions are walked.** `trainPositionEngine` steps back along the line's station chain from the station a train is due at, spending each segment's real timetabled interval and dwelling at each platform, until the countdown is used up. Where the same vehicle is predicted at two stations, the nearest sighting anchors the walk and the pair settles the direction.
4. **The map animates.** `MapView` samples the engine each frame and eases each marker towards its new anchor.
5. **Network Sync.** Every two minutes the Major Stations are refetched, because predictions age out after ~18 minutes.

Lines with no live predictions fall back to simulated trains. They are drawn hollow and dashed — they are a headway guess, not a reported train, and must never look like one.

### Why some live trains look faint

A marker is drawn at the confidence its position actually carries. Two things blur it, and neither is the prediction's age on its own — `targetTimestamp` is absolute, so a prediction sitting in memory keeps counting down correctly and the walk gets *more* accurate as the train approaches. What blurs it is the length of the walk (the feed states every time to a whole minute, so each segment spent carries ±30s, accumulating as √n) and the time since the last sync (the train drifting from what the API predicted). Both convert to metres at the line's commercial speed, and 200 m to 1 km of uncertainty takes a marker from full strength down to 0.45.

A train that has run out of prediction — past its arrival time and past the dwell, dead-reckoning forward at timetable speed — sits below all of that, at 0.35. It gets a floor of its own because uncertainty is measured in metres and therefore scales with line speed: on line 1 at 11 m/s a full-length countdown alone is already 991 m of doubt, so without the separation a dead-reckoned train there would look identical to one that still has a prediction to spend. That state is not about age either — a prediction fetched a second ago can already be in it.

The drift half of that is the weakest number here. Nothing in this repo measures how far a train strays from what the API predicted; the rate is calibrated so two missed syncs cost about what a full-length countdown costs on a median line. [#4](https://github.com/JieGH/vib_metroValencia/issues/4) is the live watch that would replace it with a measurement.

### Why the walk, not a speed constant

The engine used to place a train by multiplying its countdown by one commercial speed. Real segments run from 3.9 m/s (Machado → Alboraia Palmaret) to 16.9 m/s (La Pobla de Farnals → Rafelbunyol), so no constant fits. Measured against live data — pairs where the API reported one vehicle at two stations, making the gap between timestamps ground truth — the walk cut mean timing error from 74s to 18s and mean position error from 534m to 130m, and was closer on 39 of 40 pairs.

The residual is dominated by the feed quantising every time to a whole minute. `Colón → Alameda` is timetabled at 60s and consistently runs ~100s.

## Data pipeline

The app imports three generated files. All are committed; the feeds they come from are not.

```bash
npm run fetch:gtfs     # download the current feed into a dated directory
npm run build:data     # regenerate gtfs_expanded.json + segment_times.json
npm run fetch:basemap  # the offline basemap: tiles, glyphs and sprites
npm test               # confirm the network still looks sane
```

- **`src/data/gtfs_expanded.json`** — every station with the lines it serves, plus line geometry.
- **`src/data/segment_times.json`** — median seconds between consecutive station arrivals, per line. ~440 segments, 12 KB. This is what the walk spends.
- **`src/data/live_stations.json`** — the Strategic Hubs and Major Stations the app asks FGV about. Chosen by measured coverage, not by hand: `npm run sweep` asks FGV about every Station, saves the sweep under `data/sweeps/`, and recommends the set that sees the most live Vehicles; `npm run sweep -- report data/sweeps/*.json` merges saved sweeps. Re-sweep when the timetable changes.
- **`src/data/metro_lines.json`** — the Track Geometry the engine projects onto. Simplified to 3 m tolerance by `npm run build:geometry` (5,747 → 988 points, 414 KB → 29 KB) because the engine imports it synchronously, so it ships in the JS chunk and has to be small. The script stamps the file and **refuses to run on an already-stamped one** — re-running would measure drift against its own output. To re-simplify: `git checkout src/data/metro_lines.json` first, then run it. Always follow with `npm test`: the track-geometry-fidelity tests fail if simplification drops a station out of a chain.
- **`public/line4_osm.geojson`** — line 4's finer OSM alignment, `fetch`ed at runtime rather than imported, so it was never in the bundle. It must live in `public/`: served from `src/` it resolved in dev and 404'd in production, where the failure was swallowed and line 4 quietly fell back to the coarser `metro_lines.json` alignment.
- **`data/line4_osm_raw_overpass.json`** — the raw Overpass dump that `npm run build:line4` converts into the file above. Committed rather than gitignored, which [ADR-0003](docs/adr/0003-gtfs-feeds-are-refetchable-input.md) would otherwise argue against, because it is **not** currently refetchable: `scripts/fetch_line4_overpass.cjs` needs `node-fetch` and `osmtogeojson`, and neither is a dependency. Gitignore it once that script can actually run.
- **`public/basemap/`** — the offline basemap, ~35 MB, **gitignored**: a PMTiles extract of the Valencia region from [Protomaps](https://protomaps.com), plus the glyphs and sprites its style needs. Vector rather than raster, because every keyless raster provider stops having real tiles around zoom 16 — Esri's Gray Canvas serves a "map data not yet available" placeholder above it, and CARTO's keyless tiles come back stamped "API KEY REQUIRED". Vector has no such ceiling: the archive stops at zoom 15 and MapLibre draws it sharp at 20, because it is rendering geometry rather than stretching pixels. It is also genuinely offline — read straight off disk in the native app, and by HTTP range request on the web, so a visitor pulls the handful of tiles they look at rather than all 34 MB. Refetchable input rather than committed data, on [ADR-0003](docs/adr/0003-gtfs-feeds-are-refetchable-input.md)'s reasoning: 34 MB of binary has no business in git history. **The app falls back to online raster tiles when it is absent**, so a fresh clone still shows a map — just one that stops resolving past zoom 16.
- **`docs/demo.gif` and `docs/demo.mp4`** — the recording at the top of this file, both derived from one screen capture off a phone. Committed rather than gitignored because a README that renders nothing is worse than 3 MB of history, but kept deliberately small: the original was a 30 MB, 1080×1920, 60 fps HEVC file, which is both larger than the rest of the repository put together and unplayable outside Safari. To replace them from a new recording:

  ```bash
  ffmpeg -i recording.MP4 -an -vf "scale=540:-2,fps=30" -c:v libx264 -profile:v main \
         -pix_fmt yuv420p -crf 28 -movflags +faststart docs/demo.mp4
  ffmpeg -ss 0.5 -t 10 -i recording.MP4 -vf "fps=10,scale=288:-1:flags=lanczos,palettegen=stats_mode=diff:max_colors=128" pal.png
  ffmpeg -ss 0.5 -t 10 -i recording.MP4 -i pal.png \
         -lavfi "fps=10,scale=288:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" docs/demo.gif
  ```

  The GIF is what the README shows, because GitHub strips a `<video>` tag pointing at a path inside the repository but renders an animated GIF inline. The MP4 is linked beside it for anyone who wants it at full size.
- **`src/data/network_overlay.json`** — corrections applied on top of the feed. **Empty is the healthy state.** It exists because the feed bundled in July 2026 had already expired and predated lines 5 and 7 returning east of Alameda, while the live API was reporting trains bound for Marítim. A fresh feed made the overlay redundant; its `history` records why it existed.

**Refetch the feed when positions look wrong.** A GTFS feed carries a service calendar that expires, and a lapsed feed yields a timetable with no trips for today. The scripts always take the newest dated directory.

## Known limits

- **Branches.** A line is modelled as one polyline with a scalar distance along it, which cannot represent a fork. Lines 5 and 7 run north to Machado, line 1 to Torrent Avinguda, and line 8 through the line 6 corridor, but none of those branches are in `metro_lines.json`. Stations more than 250 m off their line's geometry are held out of its chain and listed in `trainPositionEngine.offTrackStations` — better an honest gap than a train drawn on the wrong track.
- **The website cannot reach FGV.** FGV never answers connections from Netlify's servers: a diagnostic from the deployed function (AWS us-east-2) timed out on FGV's API, with plain and browser-like headers alike, and on the FGV homepage, while the old relay answered in 1.8 s. So the public website serves live arrivals from that relay ([`netlify/functions/metro-proxy.js`](netlify/functions/metro-proxy.js)), with its rate limits and thinner coverage, and only the iOS and Android apps and `npm run dev` (from a Spanish connection) use FGV. A proxy hosted somewhere FGV does answer would fix it; set `METRO_SOURCE` to switch the function over. Details in [`docs/fgv-api.md`](docs/fgv-api.md) and [ADR-0005](docs/adr/0005-live-arrivals-come-straight-from-fgv.md).
- **Station ids.** The GTFS `stop_id` space and the live API's id space disagree for most stations; `/api/metro/horarios-prevision-3/<id>` uses the API's. Never hand-write one — derive it from `paradas_api.json`. A wrong id fails silently, and `npm test` guards the ones we hardcode.
- **The eastern stations have no arrival endpoint.** Ayora, Amistat and Aragó carry trains and appear in search, but the API exposes no station id for them, so they have no arrivals card of their own.
- **The Android app is a debug build, and lightly tested.** It is signed with a debug key, so Android warns it is unverified, and it is not on Google Play. It has run on one emulator and one phone. High-density screens log a missing `@2x` icon sheet (`basemap/sprites/dark@2x.json`, only 1x ships), so a few small map icons (park, university, marina) are absent; the map and trains are unaffected. On Android 7, "round" launcher icons show the square art rather than a circle crop. The 4 s timeout and single retry for hung FGV requests have not been checked on Android.
- **Markers sometimes never appear in `npm run dev`.** A `StrictMode` double-mount races MapLibre's `style.load` over shared marker refs, so the map can load with no stations and no trains at all. It looks exactly like broken data and it is not — it does not happen in a production build. Reload, or see [#8](https://github.com/JieGH/vib_metroValencia/issues/8). Check `vite preview` before believing a rendering bug is real.

## Data, privacy, and trademarks

**This is an independent project, not an official one.** "Metrovalencia" is the trading name of [Ferrocarrils de la Generalitat Valenciana (FGV)](https://www.fgv.es), the public operator of the network, and its brand, colours and station names remain FGV's. This app is not built, run, reviewed, or endorsed by FGV — it is a third party reading their public feed and drawing what it says.

**What data the app touches, and where it goes:**

- **The GTFS schedule** ([`google_transit_feed`](https://www.metrovalencia.es/google_transit_feed/google_transit.zip)) is fetched by a build script (`npm run fetch:gtfs`), never at runtime by a visitor's device. It becomes the small, committed JSON files described above.
- **Live arrival predictions** are fetched from FGV's own real-time feed — the undocumented endpoint FGV's official app uses, which needs no key. The native app calls it directly; the web build goes through the same-origin proxy above. FGV answers each Station with at most 8 upcoming trains and no train positions, so this project cannot vouch for its uptime or accuracy, only for what it does with what comes back. See [ADR-0005](docs/adr/0005-live-arrivals-come-straight-from-fgv.md).
- **Track geometry** comes from [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, via the Overpass API.
- **The offline basemap** is a [Protomaps](https://protomaps.com) extract, itself built from OpenStreetMap.

**What never leaves your device:**

- **Your location.** The locate feature reads a GPS fix from the OS and compares it, on-device, against the station list already in memory. It is never sent to this project, to FGV, to the arrivals API, or to any other service — there is no server that could receive it.
- **Everything you do in the app.** There is no analytics, no tracking pixel, no crash reporter, no account, and nothing about you is collected. The only thing the app writes down is a short-lived cache of recent arrival predictions, kept in the browser's `sessionStorage` so a repeat visit doesn't need to refetch — cleared automatically when the tab closes, and never sent anywhere itself.

**License.** The code in this repository is [Apache 2.0](LICENSE). That covers this project's code — not FGV's data, not OpenStreetMap's, and not Metrovalencia's brand, each of which carries its own terms.

**Thanks** to FGV for publishing the GTFS feed and the live arrivals this runs on, to OpenStreetMap's contributors for the geometry, and to Protomaps for making an offline-first basemap possible without a tile-server bill.
