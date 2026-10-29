# Development notes

The detail behind the [README](../README.md): how each build works, what exists only to keep a platform working, how a train is placed, and where the data comes from. `CONTEXT.md` is the glossary and `docs/adr/` holds the decisions.

## Running the app

The same React app ships three ways: as a website, and as Capacitor apps (iOS, and an APK) via [Capacitor](https://capacitorjs.com). Both build from the same `src/`; nothing in the app code branches on which one you're using except `arrivalStore.js`'s fetch, explained below.

### Web

```bash
npm run dev        # http://localhost:5173, hot-reloading
npm run dev:phone  # same, but bound to 0.0.0.0 — open the printed
                   # Network URL on a phone on the same Wi-Fi
npm run build      # production bundle → dist/
npm run preview    # serves dist/ as it would be deployed
```

`npm run dev` and `dev:phone` proxy `/api/metro/*` to FGV's live arrivals feed through Vite's dev server. This isn't optional plumbing — FGV's CORS policy admits only FGV's own sites, so a browser cannot call the feed directly; a same-origin proxy can. The Capacitor apps have no such limit and call FGV directly. See [ADR-0005](adr/0005-live-arrivals-come-straight-from-fgv.md).

### Self-hosting on your network

`npm run serve` (`server/`) is a zero-dependency local production server for running the map from your own machine on a LAN. It pre-compresses text assets with brotli and gzip, serves hashed assets as `immutable` with strong ETags, answers HTTP `Range` requests (`206`) for the 36 MB offline basemap without gzip-wrapping them, and proxies `/api/metro/horarios-prevision-3/{id}` (and nothing else, so it cannot be used as an open proxy) to FGV.

Behind that route (`server/prevision.js`), the server hides FGV's ~6% hang tail and shares answers across devices on the same Wi-Fi:
- **Coalescing & 10 s cache:** concurrent requests for the same Station share one upstream call, and a `200` is reused for 10 s with an `X-Prevision-Age-Ms` header so the client anchors `Target Arrival Timestamp` on `Date.now() - ageMs` without clock-skew error.
- **Hedging & deadline:** if FGV has not answered after 1200 ms, one duplicate request is sent and the first answer wins; after 3500 ms it returns `504`.
- **Bounded concurrency:** paired with the client's 8-in-flight parallel queue, cold full-network sync drops from ~26 s to ~3.9 s ([ADR-0006](adr/0006-self-host-on-the-lan-with-a-prevision-only-proxy.md)).

```bash
npm run build                 # once, and after every change
npm run serve                 # prints: Serving dist/ on http://192.168.x.x:8080
npm run serve -- --port 9000  # or PORT=9000 npm run serve
npm run measure               # benchmark cold-load sync, proxy latency and frame cost
```

Open the printed address on a phone on the same Wi-Fi. The server listens on every network interface (`0.0.0.0`) with no authentication, so run it only on a network you trust. The machine needs to reach `www.fgv.es`, which answers connections from Spain.

### Production deployment (Netlify)

The live site above runs on [Netlify](https://netlify.com), auto-rebuilding and republishing on every push to `main` — no manual deploy step. Netlify reads the build command and publish directory straight from [`netlify.toml`](../netlify.toml); no dashboard configuration is needed beyond connecting the repo.

A static host has no dev server, so two things exist purely to cover what the dev proxy above did, and are easy to break by "cleaning up" without knowing why:

- **[`netlify/functions/metro-proxy.js`](../netlify/functions/metro-proxy.js)** replaces the Vite dev proxy in production, forwarding `/api/metro/*` to FGV's live feed so the browser build stays same-origin. FGV does not answer Netlify's servers, so the public website uses the earlier relay (reshaped to FGV's format) by default; the Capacitor apps and `npm run dev` use FGV. Set the Netlify environment variable `METRO_SOURCE` to `auto` (FGV first, relay if unreachable) or `fgv` to change that; see [`docs/fgv-api.md`](fgv-api.md). Its FGV target must be kept in sync with `vite.config.js`'s dev proxy by hand — nothing enforces the two match.
- **`fetch:basemap` runs as part of the Netlify build command**, not just locally: the offline PMTiles archive is gitignored (see [Data pipeline](#data-pipeline)) and 404s in production without it. The `go-pmtiles` CLI it downloads publishes differently-named release assets per OS — hyphenated `.zip` on Darwin, underscored `.tar.gz` on Linux — so the script picks the filename and extraction method for whichever platform the build runs on, Netlify's Linux build image included.

Free-hosting options considered (GitHub Pages, Netlify, Vercel, Cloudflare Pages) and why Netlify won: [`docs/research/free-github-hosting.md`](research/free-github-hosting.md).

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

**After any code change**, re-run `npm run ios:sync` (or `npm run build`, which runs `npx cap sync ios` in `postbuild`) before hitting Run again in Xcode — it rebuilds the web bundle and re-copies it into the native project. Xcode doesn't watch `src/` itself.

### Capacitor app (APK)

The same Capacitor wrapper, in [`android/`](../android/), packaged as an `.apk`. Like the iOS app it calls FGV directly from the phone (4 requests in flight, Strategic Hubs first), with no server and no proxy, completing the first full Network Sync in about 5 seconds.

**Just want to install it?** Download `Xarxa-capacitor.apk` from the [latest release](https://github.com/JieGH/vibe_VLCmetroMap/releases/latest) and open it on an Android 7.0 or newer phone. It is a debug-signed build, not a Play Store release, so Android asks you to allow installs from your browser and may warn that the app is unverified. The release notes carry its SHA-256. It has been run on an Android emulator and on a physical phone; FGV has to answer your connection, which it does in Spain and may not elsewhere.

**Build it yourself**

- [Android Studio](https://developer.android.com/studio), which bundles the JDK and SDK, or a JDK 21 plus the Android SDK command-line tools with platform 36.
- An Android phone with USB debugging on, or an emulator.

```bash
npm install
npm run capacitor:sync   # npm run build, then copies dist/ into the Capacitor project
npm run capacitor:open   # opens android/ in Android Studio, then press Run (▶)
```

Without Android Studio: `cd android && ./gradlew assembleDebug` writes `app/build/outputs/apk/debug/app-debug.apk`, and `adb install -r` puts it on a connected phone. After any code change, re-run `npm run capacitor:sync`. `npm run apk` builds and signs the release APK (`android/build/Xarxa-capacitor.apk`) with the sideload key; `scripts/release-apk.sh <tag>` also attaches it to a GitHub release.

For publishing to Google Play see [`docs/capacitor/`](capacitor/): [release checklist](capacitor/release-checklist.md) (keystore, `./gradlew bundleRelease`, 16 KB alignment, target SDK, pre-launch report), [store listing](capacitor/play-listing.md), [Data safety answers](capacitor/data-safety.md), [privacy policy](capacitor/privacy-policy.md) and [permissions](capacitor/permissions-rationale.md). The version lives only in `android/version.properties`; release signing reads the untracked `android/keystore.properties` (template: `keystore.properties.example`).

Android-only behaviour, all gated by `isAndroid()` in `src/utils/platform.js` so the web and iOS are unchanged (see [ADR-0009](adr/0009-android-native-chrome-over-webview.md)):

- **Back button** (`@capacitor/app`): `src/utils/androidBack.js` decides, as a pure function, which layer to close (location dialog, About, welcome, dashboard, search keyboard, drawer, station sheet, line filter) and exits the app when none is open. `App.jsx` registers the listener.
- **System theme:** `src/utils/systemTheme.js`. Android starts in, and follows, the phone's dark/light setting until the viewer taps the theme button.
- **Location rationale:** `src/components/LocationRationale.jsx` (class names `md-*`, styled by `android.css`) is shown before the first system location prompt via `locate({ beforePrompt })`; declining returns status `declined` and no prompt. A refusal shows a snackbar whose **Open settings** action calls the `AppSettings.open()` native plugin (`src/services/openSettings.js`).
- **No animated welcome screen** on Android.

Five things exist purely to make Android work, and are easy to break by "cleaning up" without knowing why:

- **`noCompress 'pmtiles'` in `android/app/build.gradle`.** The offline basemap (`valencia.pmtiles`) is read by HTTP range request, one tile at a time. Deflated inside the APK it cannot be seeked without decompressing up to 36 MB per read; storing it uncompressed lets the asset server seek straight to each tile.
- **`src/utils/boundedRangeSource.js`.** Capacitor's Android local server answers a `Range` request for the 36 MB basemap archive with `206` and a correct `Content-Range`, then streams the rest of the whole file instead of stopping at the end of the range — or answers `200` for ranges past byte 0. On Android the archive is read through a source that takes only the requested byte slice, cancels the rest, and refuses a whole-file answer to a non-zero range.
- **`src/utils/uiScale.js`.** The interface is drawn at 88% on Android (CSS `zoom` on the root, with the full-screen containers stretched back out in `index.css`, because zoom does not scale viewport units). Not done through the viewport meta tag: in this WebView that widens the layout without shrinking the display and cuts off the right edge.
- **The location permissions** in `android/app/src/main/AndroidManifest.xml`. The geolocation plugin does not add them, and the locate button needs them.
- **The icon and splash** in `android/app/src/main/res/` are generated from the iOS artwork (`AppIcon-512@2x.png` and the 2732 px splash, on the brand dark `#1D1D29`): launcher icons at every density, adaptive-icon foregrounds with the glyph at 75% so a round mask does not clip its arms, splash backgrounds in every size, and the Android 12+ system splash icon (`drawable-nodpi/splash_icon.png`, glyph at 70%), which otherwise shows a default icon on white. Regenerate them with `sips` if the artwork changes.

Two things exist purely to make both native build paths work, and are easy to break by "cleaning up" without knowing why:

- **`capacitor.config.json`'s `plugins.CapacitorHttp.enabled`.** WKWebView's and Android WebView's `fetch` is still browser `fetch` — subject to CORS. Enabling `CapacitorHttp` patches `fetch` to route through native networking instead, which has no CORS restriction. `arrivalStore.js` checks `Capacitor.isNativePlatform()` and on that path calls FGV directly, which is why the native apps see FGV when the public website cannot; the web build uses the same-origin proxy above.
- **`public/vendor/maplibre/`.** MapLibre resolves its own web-worker URL from `import.meta.url`, which Vite's bundler never emits as an actual file — the map's lines and tiles render in `npm run dev` (Vite serves the real file from `node_modules` directly) but silently fail in any production build, native app included. These two files are an unmodified copy of MapLibre's worker and its shared chunk, kept as static assets so the path always resolves. If `maplibre-gl` is upgraded, re-copy both files from `node_modules/maplibre-gl/dist/`.

## How a train gets on the map

1. **Boot.** As soon as the map mounts (before the basemap style even finishes loading), the first Network Sync dispatches the 4 Strategic Hubs first, followed by the remaining 16 Major Stations (`src/data/live_stations.json`), through a bounded parallel queue (8 in flight on web, 4 on native). Meanwhile the Alameda-inspired splash (`WelcomeScreen.jsx`) holds for 500–1000 ms and fades on the compositor as soon as the map is ready (and is skipped on same-session reloads).
2. **Predictions land.** FGV answers with upcoming trains grouped by Line (`horarios-prevision-3/{stationId}`), and the store stamps each with an absolute `Target Arrival Timestamp` (`Date.now() - ageMs + seconds * 1000`, minus the Propagation Lag: 15 s for metro, 10 s for trams on Lines 4, 6, 8 and 10). `arrivalStore` keeps these in memory and in `sessionStorage`, coalescing notifications to once per animation frame.
3. **Positions are walked.** `trainPositionEngine` steps back along the line's station chain from the station a train is due at, spending each segment's real timetabled interval and dwelling at each platform, until the countdown is used up. Where the same vehicle is predicted at two stations, the nearest sighting anchors the walk and the pair settles the direction.
4. **The map animates.** `MapView` walks live Vehicles once per frame, eases each marker towards its new anchor, and writes marker DOM attributes only when they change.
5. **Network Sync.** Every two minutes the 20 Major Stations are refetched through the bounded queue, because predictions age out after ~18 minutes.

Lines with no live predictions fall back to simulated trains. They are drawn hollow and dashed — they are a headway guess, not a reported train, and must never look like one.

### Why some live trains look faint

A marker is drawn at the confidence its position actually carries. Two things blur it, and neither is the prediction's age on its own — `targetTimestamp` is absolute, so a prediction sitting in memory keeps counting down correctly and the walk gets *more* accurate as the train approaches. What blurs it is the length of the walk (the feed states every time to a whole minute, so each segment spent carries ±30s, accumulating as √n) and the time since the last sync (the train drifting from what the API predicted). Both convert to metres at the line's commercial speed, and 200 m to 1 km of uncertainty takes a marker from full strength down to 0.45.

A train that has run out of prediction — past its arrival time and past the dwell, dead-reckoning forward at timetable speed — sits below all of that, at 0.35. It gets a floor of its own because uncertainty is measured in metres and therefore scales with line speed: on line 1 at 11 m/s a full-length countdown alone is already 991 m of doubt, so without the separation a dead-reckoned train there would look identical to one that still has a prediction to spend. That state is not about age either — a prediction fetched a second ago can already be in it.

The drift half of that is the weakest number here. Nothing in this repo measures how far a train strays from what the API predicted; the rate is calibrated so two missed syncs cost about what a full-length countdown costs on a median line. [#4](https://github.com/JieGH/vib_metroValencia/issues/4) is the live watch that would replace it with a measurement.

### Why the walk, not a speed constant

The engine used to place a train by multiplying its countdown by one commercial speed. Real segments run from 3.9 m/s (Machado → Alboraia Palmaret) to 16.9 m/s (La Pobla de Farnals → Rafelbunyol), so no constant fits. Measured against live data — pairs where the API reported one vehicle at two stations, making the gap between timestamps ground truth — the walk cut mean timing error from 74s to 18s and mean position error from 534m to 130m, and was closer on 39 of 40 pairs.

The residual is dominated by the feed quantising every time to a whole minute. `Colón → Alameda` is timetabled at 60s and consistently runs ~100s.

## Data pipeline

The app imports four generated files (`gtfs_expanded.json`, `segment_times.json`, `live_stations.json`, and `metro_lines.json`). All are committed; the feeds they come from are not.

```bash
npm run fetch:gtfs     # download the current feed into a dated directory
npm run build:data     # regenerate gtfs_expanded.json + segment_times.json
npm run fetch:basemap  # the offline basemap: tiles, glyphs and sprites
npm run sweep          # sweep all 143 stations on FGV and measure vehicle coverage
npm test               # confirm the network still looks sane
```

- **`src/data/gtfs_expanded.json`** — every station with the lines it serves, plus line geometry.
- **`src/data/segment_times.json`** — median seconds between consecutive station arrivals, per line. ~440 segments, 12 KB. This is what the walk spends.
- **`src/data/live_stations.json`** — the 4 Strategic Hubs and 20 Major Stations the app asks FGV about. Chosen by measured coverage under FGV's 8-train-per-Station cap, not by hand: `npm run sweep` asks FGV about every Station, saves the sweep under `data/sweeps/`, and recommends the set that sees the most live Vehicles (86% across the saved sweeps, up from 36%); `npm run sweep -- report data/sweeps/*.json` merges saved sweeps. Re-sweep when the timetable changes.
- **`src/data/metro_lines.json`** — the Track Geometry the engine projects onto. Simplified to 3 m tolerance by `npm run build:geometry` (5,747 → 988 points, 414 KB → 29 KB) because the engine imports it synchronously, so it ships in the JS chunk and has to be small. The script stamps the file and **refuses to run on an already-stamped one** — re-running would measure drift against its own output. To re-simplify: `git checkout src/data/metro_lines.json` first, then run it. Always follow with `npm test`: the track-geometry-fidelity tests fail if simplification drops a station out of a chain.
- **`public/line4_osm.geojson`** — line 4's finer OSM alignment, `fetch`ed at runtime rather than imported, so it was never in the bundle. It must live in `public/`: served from `src/` it resolved in dev and 404'd in production, where the failure was swallowed and line 4 quietly fell back to the coarser `metro_lines.json` alignment.
- **`data/line4_osm_raw_overpass.json`** — the raw Overpass dump that `npm run build:line4` converts into the file above. Committed rather than gitignored, which [ADR-0003](adr/0003-gtfs-feeds-are-refetchable-input.md) would otherwise argue against, because it is **not** currently refetchable: `scripts/fetch_line4_overpass.cjs` needs `node-fetch` and `osmtogeojson`, and neither is a dependency. Gitignore it once that script can actually run.
- **`public/basemap/`** — the offline basemap, ~35 MB, **gitignored**: a PMTiles extract of the Valencia region from [Protomaps](https://protomaps.com), plus the glyphs and sprites its style needs. Vector rather than raster, because every keyless raster provider stops having real tiles around zoom 16 — Esri's Gray Canvas serves a "map data not yet available" placeholder above it, and CARTO's keyless tiles come back stamped "API KEY REQUIRED". Vector has no such ceiling: the archive stops at zoom 15 and MapLibre draws it sharp at 20, because it is rendering geometry rather than stretching pixels. It is also genuinely offline — read straight off disk in the native app, and by HTTP range request on the web, so a visitor pulls the handful of tiles they look at rather than all 34 MB. Refetchable input rather than committed data, on [ADR-0003](adr/0003-gtfs-feeds-are-refetchable-input.md)'s reasoning: 34 MB of binary has no business in git history. **The app falls back to online raster tiles when it is absent**, so a fresh clone still shows a map — just one that stops resolving past zoom 16.
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
- **The public website cannot reach FGV.** FGV never answers connections from Netlify's servers: a diagnostic from the deployed function (AWS us-east-2) timed out on FGV's API, with plain and browser-like headers alike, and on the FGV homepage, while the old relay answered in 1.8 s. So the public website serves live arrivals from that relay ([`netlify/functions/metro-proxy.js`](../netlify/functions/metro-proxy.js)), with its rate limits and thinner coverage, while the iOS and Android apps, `npm run dev`, and `npm run serve` (from a Spanish connection) use FGV directly. Set `METRO_SOURCE` to switch the Netlify function over if hosted where FGV answers. Details in [`docs/fgv-api.md`](fgv-api.md), [ADR-0005](adr/0005-live-arrivals-come-straight-from-fgv.md), and [ADR-0006](adr/0006-self-host-on-the-lan-with-a-prevision-only-proxy.md).
- **Station ids.** The GTFS `stop_id` space and the live API's id space disagree for most stations; `/api/metro/horarios-prevision-3/<id>` uses the API's. Never hand-write one — derive it from `paradas_api.json`. A wrong id fails silently, and `npm test` guards the ones we hardcode.
- **The eastern stations have no arrival endpoint.** Ayora, Amistat and Aragó carry trains and appear in search, but the API exposes no station id for them, so they have no arrivals card of their own.
- **The APK release path is new.** The GitHub APK is still debug-signed, so Android warns it is unverified; the Play Store route (signed `.aab`, R8 on) is described in [`docs/android/release-checklist.md`](android/release-checklist.md) and has not yet been through a Play pre-launch report. High-density screens log a missing `@2x` icon sheet (`basemap/sprites/dark@2x.json`, only 1x ships), so a few small map icons (park, university, marina) are absent; the map and trains are unaffected. On Android 7, "round" launcher icons show the square art rather than a circle crop.
- **Markers sometimes never appear in `npm run dev`.** A `StrictMode` double-mount races MapLibre's `style.load` over shared marker refs, so the map can load with no stations and no trains at all. It looks exactly like broken data and it is not — it does not happen in a production build. Reload, or see [#8](https://github.com/JieGH/vib_metroValencia/issues/8). Check `vite preview` or `npm run serve` before believing a rendering bug is real.
