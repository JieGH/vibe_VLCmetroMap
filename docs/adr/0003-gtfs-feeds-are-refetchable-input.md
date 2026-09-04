# 3. GTFS feeds are refetchable input, not committed data

Date: 2026-09-04

## Status

Accepted. Supersedes the `network_overlay.json` workaround, which is now empty.

## Context

The repo carried a GTFS Feed exported on 2026-07-28. Two things were wrong with it, and neither was visible from the code.

Its service calendar ran `20260728 → 20260830`. By 2026-09-04 it had **expired**: any query for today's trips returned nothing.

It also had no Line 5 or Line 7 service east of Alameda, so Ayora, Amistat and Aragó did not exist anywhere in the project — not in the map, not in search, not in the Station Chains. Meanwhile the live API was returning `{"destino":"Marítim","line":5}`. The network was running; the snapshot was stale.

The first fix was an overlay: hand-added Stations with coordinates from OpenStreetMap, applied on top of the feed at generation time. That worked, but it was a workaround for a stale input dressed up as a data correction — and it would have quietly diverged as the real feed moved on.

## Decision

Treat the feed as **refetchable input**. `npm run fetch:gtfs` downloads the current export into a directory named for the feed's own export time; the build scripts always take the newest such directory.

Feeds are gitignored. What is committed is what the app imports — `gtfs_expanded.json` (96 KB) and `segment_times.json` (12 KB) — both generated from the feed by committed scripts.

`network_overlay.json` stays, emptied, with a `history` entry recording why it once had contents. **Empty is its healthy state.** It is there for a genuine feed error, not for a stale one.

## Consequences

Refetching produced a feed valid `20260902 → 20261227` carrying Ayora (122), Amistat (121) and Aragó (120) as real stops with the eastern routes, so the overlay deleted itself. Lines 5 and 7 gained eight Segment Intervals each: the eastern chain is now real timetable data rather than fallback estimates.

It also **corrected** the network. The old feed claimed Line 9 served Rafelbunyol, which is 9.8 km beyond where its geometry ends; the current feed does not. Off-track Stations (see [ADR-0002](0002-one-polyline-per-line-no-branches.md)) fell from 26 to 14, and every remaining one is a genuine missing branch rather than a data error.

**Feeds expire, so "refetch first" is the first debugging step** when positions look wrong, ahead of reading any code. The README says so.

The trade-off is that a fresh clone cannot regenerate the data files without network access. That is acceptable because the generated files are committed, so the app builds and the tests pass without ever fetching; only regeneration needs the network.
