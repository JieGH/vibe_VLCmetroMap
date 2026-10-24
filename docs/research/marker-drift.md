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
```

Run them from the repo root. The capture itself is not committed: it is about 1 MB and goes out of date as soon as FGV changes its model.
