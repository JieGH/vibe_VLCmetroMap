# 1. Walk the timetable to place trains

Date: 2026-09-04

## Status

Accepted.

## Context

The live API tells us a countdown, not a position: "vehicle 5301 reaches Àngel Guimerà in 415 seconds". Turning that into a coordinate is the core problem this app has to solve.

The original engine converted the countdown to a distance with one Commercial Speed per line — 10.5 m/s for metro, 6.8 m/s for tram — and stepped that far back along the Track Geometry.

No single speed fits. Median run times on Line 3, taken from the GTFS Feed:

```
 3.9 m/s   472m / 120s   Machado → Alboraia Palmaret
 5.4 m/s   644m / 120s   Colón → Xàtiva
10.0 m/s  1203m / 120s   Museros → Massamagrell
16.9 m/s  1014m /  60s   La Pobla de Farnals → Rafelbunyol
```

The network median is 7.5 m/s against an assumed 10.5, so trains were placed about 40% too far back — roughly two stations of error in the dense centre — while the long northern segments erred the other way. The error scaled with the countdown, so it was worst immediately after a fetch, which is exactly when the data was freshest.

## Decision

Place a Vehicle with a **Timetable Walk**: step back along the Line's Station Chain from the Station it is due at, spending each Segment Interval in turn and dwelling at each platform, until the countdown is used up.

Segment Intervals are distilled from GTFS `stop_times.txt` into `src/data/segment_times.json` — the median seconds between consecutive Station arrivals, per ordered pair. Around 440 segments, 12 KB.

Commercial Speed survives only as a fallback for pairs the timetable does not cover, and is the line's median observed speed rather than a guess.

## Consequences

Validated against live data, using pairs where the API reported one Vehicle at two Stations so the gap between the two `trainTimestamp`s is ground truth:

```
                      flat speed    timetable walk
mean timing error         74s            18s
mean position error      534m           130m
closer on                              39 / 40 pairs
```

The flat-speed model underestimated on every single pair, confirming the systematic backward bias rather than merely noisy error.

**The full timetable is deliberately not shipped.** `line3_timetable.json` is 1.6 MB for one line; ten of those is not a sensible bundle. Only the distilled medians are imported. The cost is that we cannot say which scheduled trip a train is, only how long its segments take — which is all the walk needs.

**The residual error is the feed's, not the model's.** This feed quantises every time to a whole minute, so Segment Intervals carry ±30s, which puts a floor of roughly ±200 m on the walk. `Colón → Alameda` is timetabled at 60s and consistently runs ~100s. Closing that gap needs a better feed, not better code.

**A first attempt at the fallback had to be thrown away.** Fitting `interval = intercept + distance/speed` by least squares looked right but collapsed under the minute quantisation: on tram lines whose segments are all 60s or 120s the slope became noise and implied 90 m/s. The median of per-segment implied speeds cannot do that, and is what ships.
