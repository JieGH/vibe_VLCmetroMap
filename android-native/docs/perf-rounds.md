# Native app latency rounds

Status: rounds R1-R3 run on the emulator; R8 / baseline profile left to the agent that owns `app/build.gradle.kts`; the phone check is blocked while the phone is locked.

## Method

`tools/bench.sh` (emulator first, phone as sanity check). Build with `./gradlew :app:assembleBench` (release settings, debug keystore, `XarxaPerf` logcat marks; `isMinifyEnabled` is still false, so R8 is itself a candidate round). Marks are milliseconds since process start (`Process.getStartElapsedRealtime`).

```
tools/bench.sh [-s SERIAL] [-n RUNS] [-m launch,tap,frames,locate,coldloc] [-l LABEL] [-a APK]
```

Run 0 after install is a warm-up and is dropped; the table is median / p90 over 5 runs. Conditions: emulator-5554 (xarxa_pixel, API 36, Play image), screen on, animations unchanged, mobile network, no wipe, `adb emu geo fix -0.3763 39.4699` before each run (fix delay of the cold-location mode: 3 s after launch). Modes:

| Mode | What it measures |
|---|---|
| launch | `am start -W` and marks: app/activity create, graph ready, style loaded, first map frame, map fully rendered (basemap tiles drawn), first arrival, hubs done (all 4 Strategic Hubs in memory), sync done |
| tap | warm (hub, cached) and cold (uncached) station tap -> sheet with arrivals, tap -> camera idle |
| frames | gfxinfo janky % and render-thread frame intervals during pans and double-tap zooms with marker updates |
| locate | launch with permission and a recent fix: launch -> dot -> nearest sheet -> camera idle |
| coldloc | location toggled off and on (no last-known fix); the emulator fix arrives 3 s after launch: fix -> dot -> sheet |

Emulator `geo fix` is not representative of a real phone indoors (no network provider, GNSS polled about every second); the phone check is still to do.

## Rounds

| Round | Change | Result (emulator, median) | Kept |
|---|---|---|---|
| R0 | Baseline: the app as it stood after the gesture fix, hub chips, web-style bitmap train icons (commit state `snap/R0` in the scratchpad, not in the repo) | launch: TotalTime 125 ms; map_async 202; style_loaded 232; first_frame 229; map_fully_rendered 600; first_arrival 487; hubs_done 779 (p90 1543); sync_done 5925. tap: warm 14 ms to arrivals, 665 ms to camera idle; cold 908 ms to arrivals. frames: UI janky 10.0%, p90 21 ms, p99 32 ms. locate (recent fix): dot 189 ms (one run 4168 ms), sheet 1054. coldloc: fix -> dot 1242 (p90 1391), fix -> sheet 1519 | baseline |
| Rloc | Location: `ui/FastLocation.kt` asks FUSED, NETWORK and GPS in parallel, reads last-known (<= 30 s) first, accepts the first usable fix and refines only inside 6 s with a clearly tighter one; `Locator.kt` paints the dot, nearest Station and camera on the first fix, no GPS-only 8 s wait, spinner from tap | coldloc: fix -> dot 1046 (p90 1528), fix -> sheet 1740; locate: dot 181. frames: map slow frames 8.5% | kept (semantics better: nothing waits for GPS precision; on the emulator the remaining ~1 s of fix -> dot is the emulator's own GNSS delivery) |
| RUI | State after all UI work (snap, merge, chips, banner, 4-row sheet, zoom curve, 30 Hz smooth trains, no phantom trains, 400 ms camera eases, FAB 45 dp) | launch: TotalTime 150 ms; map_async 210; style_loaded 249; map_fully_rendered 663; first_arrival 445; hubs_done 732; sync_done 5522. tap: warm 15 ms to arrivals, 479 ms to camera idle (was 665 with the 600 ms ease). frames: map slow frames 7.9% (8.5% in Rloc), UI janky 10.0%, p99 40 ms. locate: dot 174; coldloc: fix -> dot 1032, fix -> sheet 1437 | current baseline for the next rounds |

Findings so far:

- Camera ease 600 -> 400 ms cut tap -> camera idle from 665 to 479 ms and locate dot -> zoom done from 1151 to 461 ms (locate mode).
- The 30 Hz marker loop did not make the map render worse (slow-frame share 8.5% -> 7.9%), so smooth motion is free at this size.
- Network is server-bound: `curl` shows HTTP/1.1 only (no HTTP/2), TTFB 0.4-0.7 s per station, so hubs_done (~0.7 s) is already near one round trip. Gains left there are connection reuse (`HttpURLConnection.disconnect()` in `FgvPrevisionSource` closes the socket after every request, so each of the 4 parallel requests pays a new TLS handshake) and starting the sync earlier.
- `tap` cold figures are missing in RUI: after the warm tap the sheet closes with the new zoom-out and Colon is off screen at the next tap position. In `bench.sh` re-launch (or re-read `stpx`) between the warm and the cold tap.
- At night (service off, 02:00-05:00) no real trains are placed, so `first_trains` is only meaningful by day; use `am start --ez fakeTrains true` (debug/bench builds) to see markers.

### Rounds after the UI-complete baseline

RUI3 is the baseline for these (same tree as RUI plus the locate button layout and `TrainTracker`; `bench.sh` tap mode now launches twice per run so the cold station is tapped on a fresh app).

| Round | Change | Result (emulator, median of 5) | Kept |
|---|---|---|---|
| RUI3 | Baseline | launch: TotalTime 136; graph_ready 74; map_async 180; style_loaded 219; map_fully_rendered 557; first_arrival 557; hubs_done 687; sync_done 2286 (p90 6784). tap: warm 8 ms to arrivals, cold tap -> camera idle 463, warm 460. coldloc: fix -> dot 682 (p90 1142). frames (no trains at night): map slow 9.4%, UI janky 7.7% | baseline |
| R1 | Startup: graph built in `Application.onCreate` on a background scope, sync started there, nine assets decoded in parallel, builders in parallel, `System.loadLibrary("maplibre")` on a thread | graph_ready 95 (worse), first_arrival 1007 (was 557), hubs_done 1133 (was 687), one run in five never produced marks (WaitTime 10 s) in launch and coldloc | reverted: slower and flaky (the extra threads compete with the main thread on the emulator's few cores; the concurrent native-library load is the likely cause of the missing run) |
| R2 | Network: keep sockets in the pool (no `disconnect()` after a fully read answer) | launch: map_async 165, first_arrival 604 (was 557), hubs_done 762 (was 687), sync_done 2600 (was 2286); tap: cold 911 ms to arrivals, warm 12 ms | reverted: no measurable gain (server-bound, ~0.4-0.7 s TTFB per request) |
| R3 | Map: markers update every 100 ms (not 33 ms) while the camera is moving. Measured with ~140 fake markers (`--ez fakeTrains true --ez fakeMany true`) because the real service is off at night; baseline is the same build with the moving period at 33 ms | map slow frames 11.4% -> 10.9%, map max frame 48 -> 43 ms, map p90 20.3 -> 20.1 ms, UI janky 9.7% -> 9.7%, UI p99 32 -> 32 ms | kept (marginal, consistent direction on 4 of 5 numbers, no cost) |

Other findings:

- Hand-off validation (`HandOffTest`): a vehicle predicted at A, B and C, then heard only at B and C (A's feed dropped it), keeps the id `live-3-3309`, never disappears and moves at most 12.9 m between 1 s samples (a metro does about 20 m/s); it is dropped only once its last arrival is more than 20 s past. `TrainTrackerTest` covers the refresh priority (due soonest first, next station in the train's direction, dead-reckoned trains refresh their own target, simulated ignored, duplicates removed).
- The engine is untouched, so the 72 original tests plus the new ones stay green (`:app:testDebugUnitTest`).
- Phone (OPPO foldable): the app's location requests are registered as background (`{bg}`, throttled to 10 minute intervals) while the keyguard is showing, so no fix arrives until the phone is unlocked. Over four runs taken while it was unlocked, location toggled off and on (no last-known fix), the first fix -> dot took 3.2 s median (p90 3.4 s) with the new locator; the old locator was not measured on the phone. `pm grant` is refused over adb on this phone, so location must already be allowed in Settings.
- `FastLocation` logs `providers wanted` and each provider's result to `XarxaPerf` (no-op in release) to make the phone check diagnosable.

## Not run yet

1. R8 (`isMinifyEnabled = true`, keep rules for kotlinx.serialization) and a baseline profile (`androidx.profileinstaller`, `src/main/baseline-prof.txt`): needs edits to `app/build.gradle.kts`, which another agent owns; compare `am_TotalTime` and `map_async` after `cmd package compile -f -m speed-profile`.
2. Phone sanity check of the best build with the phone unlocked: `tools/bench.sh -s 30168fc7 -n 5 -m locate,coldloc` for the new locator, then the same with `snap/R0.apk` for the old one (the scratchpad copy; rebuild from git history otherwise).
3. Daytime run of `TrainTracker` (count live trains against before, screenshot a line for gaps, compare with the web app).
4. StrictMode pass for main-thread IO.

## Resume

```
cd android-native
export JAVA_HOME=/opt/homebrew/opt/openjdk@21 ANDROID_HOME=/opt/homebrew/share/android-commandlinetools PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH
./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleBench
tools/bench.sh -n 5 -l NEXT -a app/build/outputs/apk/bench/app-bench.apk     # all modes, ~30 min; do not build while it runs
```

Keep a copy of `app/src` per round before editing (revert by copying back; no commits were made). Compare each round with RUI3 above. Keep only changes that improve the emulator median without hurting p90.
