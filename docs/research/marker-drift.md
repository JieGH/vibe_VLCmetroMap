# Vehicle marker drift: measured causes and fix plan

Problem: a live Vehicle marker reaches a Station, then slides hundreds of metres along the track and snaps back, sometimes repeatedly.

Vocabulary follows `CONTEXT.md`. Arithmetic done here is marked **[derived]**.

## Evidence

### 1. Ground truth: a stopwatch on a Line 5 Vehicle (2026-10-24)

The rider timed a Line 5 Vehicle, compared with what the Timetable Walk spends (`segment_times.json`, `dwellSeconds` 12.5):

| Leg | Measured | Walk | Error |
|---|---|---|---|
| Amistat → Aragó, running | 42.8 s | 107.5 s | walk 2.5× too slow |
| Station Dwell, Aragó | 42.4 s | 12.5 s | 30 s short |
| Aragó → Alameda, running | 74.1 s | 107.5 s | 33 s too slow |
| Station Dwell, Alameda | 166.0 s | 12.5 s | 154 s short |
| Alameda → Colón, running | 51.3 s | 47.5 s | ok |

These Segment Intervals are stored as 120 s and 60 s because GTFS `stop_times.txt` states times to the minute, so the medians land on whole minutes. The ±30 s quantisation that `trainPositionEngine.js` attributes to "the feed" belongs to the GTFS Feed, not to FGV.

### 2. FGV's countdown is a model that steps when real events happen

A live capture polled 16 central Line 3/5 Stations every 10 s for 15 minutes (2026-10-24 10:01–10:16 UTC, 10,158 rows, 193 Vehicle×Station series). Script: `marker-drift/capture.cjs`.

- `seconds` has second resolution: all 60 values of `seconds % 60` occur.
- Far from arrival, the predicted arrival time is steady: the median change between polls is 0.3 s.
- Within 120 s of arrival it is not. The p90 change between polls is 25 s, and the largest is 75 s. On a typical close approach, the largest single step *upwards* in the final 3 minutes is 29 s (p50) and 48 s (p90).
- The steps follow real events. For example, Line 7 at Colón reads `…93, 83, 73, 35, 25, 15, 5`: a 38 s drop as the Vehicle leaves the previous Station. Line 3 at Colón reads `…66, 56, 86, 76…`: a 30 s rise while the Vehicle is held at the previous Station.
- A Vehicle drops off a Station's list once it arrives: `seconds = 0` is almost never held.

Script: `marker-drift/near.cjs`, `marker-drift/analyze.cjs`.

### 3. Replaying the capture through the real engine

`marker-drift/replay.mjs` loads the capture into `arrivalStore.memory` on the app's own cadence. Each Station is refreshed every N s, 1 s apart, with the current 25 s shift (Propagation Lag plus the countdown lead). It then steps `getLiveVehiclesFromMemory` in 250 ms frames and counts every jump of more than 25 m, by cause:

| Refresh | Jumps/min | Backward travel | Re-timed prediction at the same Station | Anchor switched to another Station |
|---|---|---|---|---|
| 120 s (the app) | 10.2 | 15.5 km | 90, mean 204 m | 55, mean 159 m |
| 60 s | 16.4 | 28.5 km | 188, mean 213 m | 48, mean 191 m |
| 10 s | 22.8 | 58.5 km | 274, mean 199 m | 54, mean 564 m |

The 120 s row also has 1 jump of 177 m from inside the walk itself.

**Fresher data makes it worse.** The jumps don't come from stale predictions. Every new prediction re-places the Vehicle by a walk whose Segment Intervals and Station Dwell disagree with FGV's own model, so each re-time is a fresh jump. `smoothVehicle` then eases it over 900 ms, which is the fast slide the rider sees.

### 4. Prototype: a marker that only moves forward

The prototype runs in the replay harness, not in the app: the marker never steps backwards along its direction of travel, and closes a forward gap at no more than C m/s. At the app's 120 s cadence:

| C | Jumps > 25 m | Backward travel | Mean distance from the raw estimate |
|---|---|---|---|
| 15 m/s | 0 | 0 m | 30 m |
| 25 m/s | 0 | 0 m | 24 m |
| 40 m/s | 0 | 0 m | 23 m |

The zero jumps follow from the 250 ms frame: at 40 m/s the marker can move at most 10 m per frame. The real cost is the last column, about 24 m from the estimate on average. That is well inside the walk's own Position Uncertainty, which starts at 200 m.

## Causes, ranked

1. **Every prediction is re-walked and the result is drawn as-is.** Corrections in either direction become visible jumps. This is 62% of jumps at 120 s and 84% at 10 s.
2. **The Station Dwell is far too short.** At 12.5 s, the walk sends the Vehicle out of the platform while it is still there, so the next prediction drags it back. This is the "reaches the Station, then drifts away" half of the symptom.
3. **The anchor switches to another Station.** The anchor is the Sighting with the smallest |countdown|. When the passed Station's Sighting ages past `MAX_SECONDS_PAST` (20 s), the anchor flips to the Station ahead, and the two walks disagree because of cause 4.
4. **The Segment Intervals are quantised to the minute.** Wrong by up to 2.5× in the city centre.

## Fix plan

Each phase is measured with `replay.mjs` against a recorded capture, and phase 1 is checked with the stopwatch as well.

1. **Forward-only marker** (`smoothVehicle`): never draw a Vehicle moving backwards, and catch up at no more than 25 m/s. Snap without easing when the gap passes about 1.5 km or the direction flips, since that is a re-identification and not a correction. This is the smallest change and removes the visible back-and-forth.
2. **Anchor on the Station ahead, and hold at the platform.** Anchor on the smallest *non-negative* countdown instead of the smallest |countdown|, so the walk always works back from where the Vehicle is going. Stop Dead Reckoning out of a Station: once the Vehicle has arrived, hold At Platform until the next Station's prediction shows it has left. This removes the anchor-switch jumps and the false departure.
3. **Re-measure the Segment Intervals from FGV.** For the same Vehicle in the same poll, the gap between its countdowns at two Stations is FGV's own second-resolution interval. For example, Amistat → Aragó is 91 s in FGV's model, 120 s in GTFS, and about 85 s measured. Build `segment_times.json` from sweeps rather than GTFS medians. Fix the comment on `QUANTISATION_SECONDS` and its value.
4. **Re-check the 25 s shift.** The 10 s countdown lead was tuned while the marker was still drifting. FGV re-times by 25 s (p90) within the last 2 minutes, so a single ride cannot separate the lead from the noise. Re-time it with several stopwatch rides once phases 1 and 2 are in.

## Results after phases 1–3

A second capture polled all 143 Stations every 30 s for 20 minutes (2026-10-24, 39,718 rows, 89 live Vehicles; `marker-drift/capture_network.cjs`). From it, `scripts/calibrate_segment_times_fgv.mjs` measured 364 Segment Intervals into `src/data/segment_times_fgv.json`. They cover 194 of the 212 adjacent Station pairs the engine walks. Against the stopwatch:

| Segment, including the dwell at origin | Stopwatch | FGV-measured | GTFS |
|---|---|---|---|
| Aragó → Alameda | 116.5 s | 110 s | 120 s |
| Amistat → Aragó | ? + 42.8 s run | 91 s | 120 s |
| Alameda → Colón | 217 s (166 s hold) | 107 s | 60 s |

FGV states arrivals only, so the dwell split is set by hand at 40 s for measured intervals. That figure comes from the 42.4 s timed at Aragó, and from 91 − 42.8 = 48 s left at Amistat **[derived]**. GTFS intervals keep 12.5 s, since their 60 s segments would otherwise leave almost no running time.

Replaying the drawn marker (`DRAWN=1`) shows what the map draws. Before is commit `5c64364`; after is phases 1–3 plus voting on direction:

| Capture | Refresh | Before: jumps/min | Before: backward travel | After: jumps/min | After: backward travel |
|---|---|---|---|---|---|
| 16 central Stations, 14 min | 120 s | 21.4 | 14.1 km | 0 | 0 m |
| All 143 Stations, 19 min | 120 s | 79.8 | 113.8 km | 0.4 | 20.5 km |
| All 143 Stations, 19 min | 10 s | 126.1 | 141.0 km | 0.9 | 29.6 km |

Each of the 8 jumps left at 120 s is over 2 km: a Vehicle turning back at a terminus, or one Vehicle id matched to a different trip. They are resyncs, not drift.

**Direction now goes by vote.** Before the vote, the network capture still showed 1.4 jumps/min, mostly on trams 4 and 6. The polyline projects La Cadena after Beteró, though trains bound for Marítim reach it first. Because only the sighting nearest in time decided direction, the train flipped whenever La Cadena was that sighting. Now every sighting votes.

## Reproduce

```
node docs/research/marker-drift/capture.cjs /tmp/raw.jsonl 900000     # 15 min, needs a Spanish IP
node docs/research/marker-drift/analyze.cjs /tmp/raw.jsonl
node docs/research/marker-drift/near.cjs /tmp/raw.jsonl
node docs/research/marker-drift/pairs.cjs /tmp/raw.jsonl
npx vite-node docs/research/marker-drift/replay.mjs /tmp/raw.jsonl 120 1         # raw walk
DRAWN=1 npx vite-node docs/research/marker-drift/replay.mjs /tmp/raw.jsonl 120 1 # what the map draws
node docs/research/marker-drift/capture_network.cjs /tmp/net.jsonl 1200000     # all Stations, 20 min
npx vite-node scripts/calibrate_segment_times_fgv.mjs /tmp/net.jsonl            # rebuild segment_times_fgv.json
MONO=25 npx vite-node docs/research/marker-drift/replay.mjs /tmp/raw.jsonl 120 1 # forward-only prototype
node scripts/build_return_tracks.cjs                                           # coastal return track from OSM (ADR-0007)
npx vite-node scripts/build_direction_stations.mjs                             # Stations per direction from GTFS
TAP=60 SEED=1 npx vite-node docs/research/marker-drift/app_replay.mjs /tmp/net.jsonl  # app-faithful replay, with taps
```

Run them from the repo root. The capture itself is not committed: it is about 1 MB and goes out of date as soon as FGV changes its model.

## Phase 4: per-line backtest (2026-10-24)

A 30-minute whole-network capture (59,622 rows, 29.4 min) was replayed through `marker-drift/app_replay.mjs`. The replay models what the app actually fetches:
- a Network Sync of the 19 Strategic Hubs and Major Stations every 120 s, honouring the 60 s memory pause and 4 requests in flight;
- Station taps, with the panel polling while it is open.

Five agents each took two Lines (L1+L2, L3+L9, L4+L6, L5+L7, L8+L10), and the L8+L10 agent also took taps across every Line. Their reports agree:

1. **The walk ran faster than any train.** A 40 s dwell carved out of a minute-quantised interval left 20 s for 500–3,300 m. Examples: Seminari-CEU > Moncada at 36.6 m/s, Col·legi El Vedat > Realón at 41 m/s, Mas del Rosari > La Coma at 26 m/s. FGV's far-out countdowns, and its tram intervals, are timetable figures stated to the minute.
2. **Catch-up slides are FGV re-timing a whole train.** When a train is held or released, every one of its ETAs shifts by 15–115 s at once. That shift arrives with the next sync or tap and moves the estimate up to 1.4 km. The anchor handover at arrival is a minor cause. Usually it moves the estimate backwards, and the forward-only marker already holds there.
3. **A tap adds no slides of its own.** It brings forward the correction the next sync would make. Refreshing a Sighting 60–120 s old moved the estimate more than 100 m on 32% of refreshes; one under 30 s old never did (0 of 490). The worst case was L1 1061: the anchor flipped to a 438 s-old Sighting and the marker chased for 175 s.
4. **Holds mirror the re-timing**, when FGV pushes a train later. The worst is L4 4083: held about 285 s at Beteró, with every downstream ETA moved +285 s. No engine change fixed holds. Only fresher data does.
5. **An open Station panel refreshed every 120 s, not 60 s.** Its 60 s poll landed 59.5 s after the tap's fetch, inside the memory pause.

Fixes taken:
- **Running ceiling per Line.** The ceiling is 1.8× the Line's Commercial Speed, at least 10 m/s and at most 17 m/s. The dwell gives way first, down to 12.5 s, and only then does the interval stretch.
- **Catch-up at twice the Vehicle's own running speed**, clamped to 6–20 m/s, instead of a flat 25 m/s.
- **Panel poll at `CACHE_TTL_MS + 1000`.**

All lines, app sync, before → after:

| | No taps | Tap every 60 s |
|---|---|---|
| Slides (> 20 m/s for ≥ 1 s) | 183 → 0 | 183 → 0 |
| Seconds drawn > 15 m/s faster than the estimate | 964 → 463 | 1149 → 398 |
| Seconds drawn > 8 m/s faster than the estimate | 2057 → 1852 | — |
| Holds ≥ 20 s (max) | 144 (274 s) → 145 (274 s) | unchanged |
| Mean offset from the estimate, sum over 10 Lines | 267 → 295 m | — |

The slide count reaching 0 is partly by construction, because the 20 m/s ceiling equals the slide threshold. The cap-independent rows are the "faster than the estimate" seconds. Accuracy against the freshest data does not improve: data age dominates.

Left open:
- **Tram loop geometry.** La Cadena projects after Beteró; the coastal loop is walked as two-way, and its west leg is missing from the polyline (ADR-0002).
- **L10 coverage.** Only Russafa is synced. Adding Alacant and Natzaret lifts the share of trains shown from 65% to 82%.
- **Resyncing forward at 600 m.** This trades a 40 s chase for a ~900 m hop. It is a UX call, and not taken.

Agent reports are not committed; they lived in the session scratchpad.

## Phase 5: the coastal one-way section (issue #84, 2026-10-24)

Phase 4 left Lines 4 and 6 with long holds and an offset above the other trams. Three causes, all at the coast. Replayed with `app_replay.mjs` on the 29-minute capture (`net30`) and on a fresh 24-minute one (`net_fresh`, 49,940 rows) captured the same afternoon.

**1. The La Cadena "misorder" is an FGV artefact, not geometry.** The polyline order Beteró → La Cadena (about 440 m, 40 s) → Platja Malva-rosa is right; GTFS shapes 5/25 (L4) and 8/10 (L6) and the live feed both say so. Near-term Vehicles read it correctly (vehicle 4116: UPV 14 s, Beteró 254 s, La Cadena 293 s). Far-out ones sometimes state an eastbound La Cadena countdown earlier than Beteró (4118: La Cadena 923 s, Beteró 1048 s), and 4086 even got two La Cadena rows (80 s and 107 s) with UPV at 48 s and Beteró at 288 s. So La Cadena stays where it is, and Sightings that contradict the Station Chain are dropped.

**2. The coast is one-way, and the two lines differ** (ADR-0007). Out: Beteró → La Cadena → Platja Malva-rosa → Platja les Arenes, then Dr. Lluch (L4 terminates in a balloon) or Canyamelar → Grau → Marítim (L6). Back: Dr. Lluch → Cabanyal → La Cadena → Beteró, by another track. OSM carries no `oneway` tag on any of those ways, but the route relations use the beach ways only for "→ Dr. Lluch" (eastbound) and ways 875511137/875511139 only for "Dr. Lluch →" and L6 "Marítim → Tossal del Rei" (westbound). A return polyline from OSM, and a Station Chain per direction from GTFS trips, fix the walk: Dr. Lluch → Cabanyal is now 398 m (was 887 m on L4, 763 m on L6), at the 60 s GTFS states.

**3. The terminus layover.** Vehicles 4085 (T653) and 4087 (T1253) held At Terminus at Dr. Lluch, then re-anchored on a Benimaclet Sighting 780 s out. The raw estimate jumped by −1197 m and the marker slid about 1.3 km. With the return chain the walk from Benimaclet ends at Cabanyal's platform: the raw estimate moves −398 m (the segment times add up to about 60 s more than the Vehicle took), and the drawn marker, which cannot reverse, does not slide. No change to the terminus hold was needed.

### Sighting order filter

Drops (Vehicle × Station pairs, and the share of per-second placements with a drop), in replays where the filter can see La Cadena and Beteró, i.e. with taps or every Station synced; with the app's own sync set neither Station is fetched and nothing is dropped:

| Capture | Scenario | L4 | L6 | Other Lines |
|---|---|---|---|---|
| net30 | taps every 60 s | 6,739 of 92,831 (7%); Palau de Congressos, La Granja, Sagunt | 0 | 0 |
| net30 | every Station synced | 16,704 of 161,143 (10%); 22 Stations, La Cadena 3, Beteró 4 | 4,116 of 53,099 (8%); La Cadena 2, Platja les Arenes 2, Grau 1 | L1 2,342; L2 2,278; L3 6,040; L9 764; none moved a metric |
| net_fresh | every Station synced | 14,593 of 132,355 (11%); La Cadena 4, Platja les Arenes 2 and 12 others | 4,700 of 46,233 (10%); La Cadena 2, Dr. Lluch, Francesc Cubells and others | L1 756; L3 5,776 |

La Cadena is the most-dropped Station on the coast, as expected, but it is not the only one: with every Station fresh, FGV's far-out timetable figures are out of order for a few Stations on every Line (L3 Av. del Cid, Colón; L9 Colón; L1 Realón). The filter is generic and none of those changed a Line 1, 2, 3, 5, 7, 8, 9 or 10 metric. With the app's sync set it fires on no Line.

### Results, before → after

Main (`de6df47`) against this branch, same replay, all Lines (others identical: L1, 2, 3, 5, 7, 8, 9 and 10 are unchanged in every scenario). Slides stay 0 on both. Columns: holds ≥ 20 s (count, max s); mean offset (m); seconds drawn > 8 and > 15 m/s faster than the estimate.

| Capture / scenario | Line | Holds (max) | Mean offset | > 8 m/s | > 15 m/s |
|---|---|---|---|---|---|
| net30, app sync | L4 | 34 (274) → 33 (212.5) | 50 → 27 | 257 → 189 | 41 → 41 |
| | L6 | 15 (81.8) → 15 (63.3) | 23 → 24 | 118 → 202 | 32 → 4 |
| net30, taps 60 s | L4 | 26 (278) → 26 (212.5) | 67 → 39 | 306 → 217 | 42 → 56 |
| | L6 | 17 (81.8) → 17 (65.3) | 31 → 29 | 136 → 230 | 16 → 4 |
| net30, all synced | L4 | 50 (212) → 49 (212) | 39 → 33 | 429 → 441 | 56 → 56 |
| | L6 | 16 (155.5) → 16 (75.5) | 49 → 27 | 232 → 197 | 13 → 13 |
| fresh, app sync | L4 | 29 (114.5) → 29 (114.5) | 19 → 18 | 192 → 193 | 31 → 31 |
| | L6 | 15 (78) → 16 (78) | 26 → 24 | 141 → 75 | 17 → 0 |
| fresh, taps 60 s | L4 | 24 (114.5) → 24 (114.5) | 22 → 22 | 194 → 195 | 70 → 70 |
| | L6 | 15 (119.8) → 16 (119.8) | 27 → 26 | 133 → 75 | 9 → 0 |
| fresh, all synced | L4 | 39 (118) → 40 (118) | 32 → 28 | 334 → 339 | 60 → 60 |
| | L6 | 18 (97.5) → 17 (120.3) | 33 → 27 | 104 → 67 | 13 → 3 |

L6 in net30 with app sync or taps trades more seconds above 8 m/s for fewer above 15 m/s; the fresh capture shows no such trade. The 4083 hold at Beteró (274 s on net30) is FGV holding the tram and stays out of scope. The longest L4 hold on net30 fell from 274 s to 212 s (cause not isolated); the fresh capture has no such hold, so L4's maximum there does not move.

Not measured by the replay: the geometry itself. Bearings along the legs (engine output): Platja Malva-rosa → Platja les Arenes 180° (south) at longitude −0.32563; Dr. Lluch → Cabanyal 8° (north) at −0.32775; Cabanyal → La Cadena 325°; L6 Canyamelar → Dr. Lluch 332°. Tests assert the first two.

Tolerance of the order filter, 0 s / 10 s / 30 s, on net30: L4 and L6 holds, offsets and > 15 m/s seconds moved by a few units at most (taps and every-Station scenarios), so 10 s is a judgement call, not a tuned value.

### Left open

- `segment_times_fgv.json` was calibrated on the outbound chain only. FGV's measured La Cadena → Platja Malva-rosa is 286 s on L4 (57 samples; 113 s on L6, GTFS 120 s), which may carry some of the bogus La Cadena countdowns above (not checked). `calibrate_segment_times_fgv.mjs` should run the filter and both chains. Dr. Lluch → Cabanyal and Cabanyal → La Cadena still use the 60 s and 120 s GTFS figures.
- The return track is not drawn on the map.
- Line 8's coastal Stations stay excluded (issue #2).

