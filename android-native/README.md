# Xarxa Native (android-native/)

Fully native Android port (Kotlin, Jetpack Compose, Material 3, MapLibre Native). No WebView or Capacitor. `applicationId` / package: `com.jielei.xarxa.nativeapp`.

## Build and run

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
tools/sync-data.sh            # copy data + basemap into assets, regenerate styles (needs node, repo node_modules)
./gradlew assembleDebug       # app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.jielei.xarxa.nativeapp/.MainActivity
```

Run `tools/sync-data.sh` after any change in `../src/data`, `../public/basemap`, or `tools/build-style.mjs`. `assets/basemap/valencia.pmtiles` (36 MB) is gitignored; everything else generated is committed.

## Versions actually used
Gradle 8.14.3, AGP 8.13.0, Kotlin 2.1.21 (compose, serialization plugins), Compose BOM 2025.09.00, activity-compose 1.10.1, lifecycle-*-compose 2.9.2, kotlinx-serialization-json 1.8.1, coroutines 1.10.2, `org.maplibre.gl:android-sdk:13.7.1`, JUnit 4.13.2, compileSdk/targetSdk 36, minSdk 26. All resolved as requested.

## Spike result: offline basemap works, no fallback needed
`pmtiles://asset://basemap/valencia.pmtiles` renders streets offline (verified with wifi and data disabled), with glyphs from `asset://basemap/fonts/{fontstack}/{range}.pbf` and sprite from `asset://basemap/sprites/<flavour>`. `androidResources { noCompress += "pmtiles" }` is set.

Gotchas found:
- MapLibre Native requests `sprite@2x.json/png` on dense screens and does not fall back to 1x (logs "Failed to load sprite: Could not read asset"). `sync-data.sh` aliases the 1x sprites as `@2x`.
- Only three Noto Sans glyph ranges (0-255, 256-511, 8192-8447) are bundled, same as the web app; rare-script ranges can log "Failed to load glyph range" harmlessly.
- The theme is the platform DayNight Material theme (values / values-night); Compose `MaterialTheme` does the Material 3 colouring. No material-components dependency.

## Interfaces and paths for B and C
- Assets `app/src/main/assets/data/`: gtfs_expanded, metro_lines, return_tracks, direction_stations, segment_times, segment_times_fgv, paradas_api, live_stations, line_colors_from_image (all `.json`), `line4_osm.geojson`, and generated `lines.geojson` (the merged Line features plus return legs with `color` and `offset` properties, same composition as MapView.jsx: metro_lines, Line 4 from OSM, GTFS fallback, image colour overrides, return legs via `pathsOffReference`).
- Styles `assets/basemap/style-dark.json` / `style-light.json` (flavours dark / white, as the web app). They contain an empty GeoJSON source `metro-lines` with layers `metro-casing` and `metro-fill` between the basemap geometry and the labels. Load with `Style.Builder().fromUri("asset://basemap/style-dark.json")`, then `(style.getSource("metro-lines") as GeoJsonSource).setGeoJson(...)`. Line dimming: set `line-opacity` on `metro-fill` at runtime (MapView uses `lineOpacityExpression`). Add station/vehicle layers or sources on top in code.
- Kotlin, package `com.jielei.xarxa.nativeapp.data`: `Models.kt` (`Geometry` with `point()`/`line()`, `StationProperties`, `RawFeature`/`FeatureCollection`, `DirectionStations`, `ReturnTracks`, `SegmentTimes`, `SegmentTimesFgv`, `Parada`, `LiveStations`, `LineColors`) and `NetworkData.load(context)` (suspend, IO) which decodes all of them. `NetworkData.parse(reader)` allows JVM unit tests without Android. Station ids: `stop_id` (GTFS) and FGV `Parada.id` are different id spaces; map by name as the web app does (`STATION_ID_MAP` in `src/services/arrivalStore`).
- `MainActivity.kt` is currently the spike (`SpikeMap` composable: MapView lifecycle wiring in Compose, theme-keyed style load). Replace it with the real screen; keep `MapLibre.getInstance(this)` before `setContent` and the `enableEdgeToEdge()` call.
- Manifest: INTERNET, ACCESS_NETWORK_STATE, ACCESS_FINE/COARSE_LOCATION, `enableOnBackInvokedCallback`.
