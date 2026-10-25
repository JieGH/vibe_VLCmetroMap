# Native app work state

Updated after every completed item. Status: todo / in-progress / done (built, tests green) / verified (seen working on a device).

| # | Owner item | Status | Notes |
|---|---|---|---|
| 1 | Pinch / pan / gestures wrong | verified (emulator) | Root cause: `ModalNavigationDrawer` swipe gesture stole every horizontal pan and pinch (pinch 14.6 -> 14.7 only, pan 0.0003 deg). Fix: `gesturesEnabled = drawerState.isOpen`. Camera request no longer re-eases after the viewer touched the map. UiAutomator test `MapGestureTest` (androidTest) drives real pinch/pan: pinch open 14.60 -> 15.63, close -> 14.68, pan and fling move the camera. |
| 2 | Location speed (cold + warm), top perf target | done, measured on emulator | `ui/FastLocation.kt` (all providers in parallel, last-known <= 30 s first, refine window 6 s), `Locator.kt` paints the first usable fix at once. See perf-rounds.md. Phone check still to do. |
| 3 | Zoom-in speed | partly done | All camera eases 600 -> 400 ms (`CameraPlan.EASE_MS`). Marker update cost during gestures measured in the frames mode. |
| 4 | Train marker parity with web | verified on emulator with `--ez fakeTrains true` | Bitmap icons (`map/TrainIcons.kt`, 2x density), number only, 28 dp base. The real service is off at night, so use the fake trains (debug/bench builds only). |
| 5 | Train marker and station dot -15% (0.85), one smooth zoom curve | done | `zoomCurve`/`zoomStops` in `XarxaMap.kt`: web curve to zoom 12.3, then +0.12 per level; dot, ring, shadow, selected ring, icon size and pulse all derive from it. |
| 6 | Smooth train motion | done (30 Hz evaluation of the time-based Timetable Walk) | `engine.livePositions` every ~33 ms on Default, hand-built GeoJSON, loop only while STARTED. Per-frame delta report still to measure. |
| 7 | Remove phantom (simulated) trains; continuous tracking by vehicle id | phantom removal verified; hand-off validated by `HandOffTest` (12.9 m max 1 s step, id kept, dropped 20 s after the last arrival); next-station refresh scheduler unit-tested (`domain/TrainTracker.kt`, started from `MainViewModel`), not yet watched live | The engine already chains sightings by `line-vehicleId`. The scheduler refreshes the Station after each train's target (2 per 5 s tick, store limits apply). Needs a daytime run: count live trains shown against before, screenshot a line for gaps, compare with the web app. |
| 8 | Popular-stops chips (name only) | done | `COMMON_STOPS`: Grau - La Marina, Marítim, Colón, Xàtiva, Àngel Guimerà, La Carrasca, Russafa. No separate "Grau" station exists in the data. |
| 9 | Walking time formula + strings | done | `domain/Walking.kt`, `WalkingTest`. |
| 10 | Floating walking box for any selected Station | verified (short/medium light, medium dark) | `ui/WalkBanner.kt`, green/amber/coral at 5/15 min, icon per category, 6 s auto-hide, raw meters formatted at render with the configuration locale. Replaced the old snackbar notice. Long (coral) state only unit-tested. |
| 11 | Compact sheet: header + 4 rows, LazyColumn scroll | verified (Àngel Guimerà) | `StationSheet.kt`. A 1-2 arrival station not yet screenshotted. |
| 12 | Remove "Recentre on map" button | done | Strings, callback and `MainViewModel.recentre` removed. |
| 13 | Snap station dots onto the line (Xàtiva acceptance) | verified on emulator | `StationPresentation` in `StationRepository.kt`, unit-tested; Xàtiva within 3 m of its track. `StationPresentationTest` prints the moved stations. |
| 14 | Merge duplicate Pl. Espanya | done | Same apiId within 150 m merged; only `st-plaça-espanya` dropped (145 -> 144 stations); no other twins in the repository list. |
| 15 | Perf rounds (startup, network, map, frames) | done except R8/profile and phone check | R1 startup reverted (slower, flaky), R2 keep-alive reverted (no gain), R3 100 ms marker updates while the camera moves kept (marginal).  R0, location round (Rloc) and the UI-complete baseline (RUI) measured on the emulator. Startup, network, R8/baseline profile, map rounds and the phone check are NOT run; see `perf-rounds.md` (Not run yet, Resume). |
| 16 | Zoom out when the sheet closes | verified (14.6 -> 12.6 on Colón) | `CameraPlan.zoomOutTarget`, unit-tested. |
| 17 | Floating box wording short + language switch | done | "N min walk · Station · dist". |
| 18 | Line number proportion in marker and sheet badges | done | Number is part of the 2x bitmap; `LineBadge` font = 0.5 x size. |
| 19 | Banner must never cover the GPS FAB | done, verified (360dp-class portrait on emulator, sheet open) | One bottom column above the sheet: locate button, walking box, snackbar. Still to check: sheet closed, 4-row sheet expanded, 412 dp width. |
| 20 | GPS FAB 20% smaller, 48 dp touch target | done, verified | 45 dp `FloatingActionButton` inside `minimumInteractiveComponentSize`, icon 19 dp. |
| 21 | Phone check of location speed (indoors, no recent fix) | partly done, blocked while the phone is locked | New locator, no last-known fix: first fix -> dot 3.2 s median over 4 runs (phone unlocked at the time). Warm runs failed because the keyguard was showing (requests become `{bg}`, throttled to 10 min). Unlock the phone, then run `tools/bench.sh -s 30168fc7 -m locate,coldloc`; compare with the old locator (`snap/R0.apk` in the scratchpad). |

Verified since the last update (screenshots, emulator): empty-arrivals sheet is compact and shows the 2-digit badge "10" cleanly; the 15 min / 1,1 km walk shows the amber box (boundary is inclusive). Coral (20 min · 1,4 km) verified; empty and 1-2 arrival sheets verified; layout at 360 dp (density 480) verified: the box wraps its distance onto a second line but nothing overlaps and the locate button stays above it. Not checked: 4-row sheet expanded together with the banner at 360 dp.

Build state: `:app:testDebugUnitTest :app:assembleDebug :app:assembleBench` green after the last change.

Resume order: 21 (phone, unlocked), 7 (daytime check of the tracker), the R8 / baseline-profile round (needs `app/build.gradle.kts`, owned by another agent), then the 4-row-sheet-plus-banner check at 360 dp.

Build state when this was written: `./gradlew :app:testDebugUnitTest :app:assembleDebug :app:assembleBench` green.

Quota note: if a rate limit stops the work, resume from the first row that is not done/verified.
