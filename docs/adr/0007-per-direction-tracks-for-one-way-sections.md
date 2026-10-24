# 7. Per-direction tracks for one-way sections

Date: 2026-10-24

## Status

Accepted. Refines [ADR-0002](0002-one-polyline-per-line-no-branches.md) without replacing it: one polyline per Line stays the rule, and a second one is added only where a Line's two directions run on different track.

## Context

The coast end of Lines 4 and 6 is one-way, and the two lines treat it differently. Going out, a tram runs Beteró → La Cadena → Platja Malva-rosa → Platja les Arenes, down the beach, then on to Dr. Lluch (L4's balloon, where it terminates) or Canyamelar and Marítim (L6). Coming back it uses another track, Dr. Lluch → Cabanyal → La Cadena → Beteró, and never touches the beach. FGV, GTFS and the OSM route relations agree. No OSM way carries a `oneway` tag, so the direction is read from the relations.

`metro_lines.json` holds the outbound track only. Cabanyal (168 m off) and Dr. Lluch (97–197 m off) sat inside ADR-0002's 250 m tolerance, so they were projected onto the beach leg. A westbound tram was walked from Dr. Lluch to Cabanyal via Les Arenes: 887 m on L4 (763 m on L6) at about 200 s, where FGV states 60 s and the platforms are 397 m apart. A Vehicle near the L4 balloon carries both headsigns' Sightings at once, and nothing could tell which Station Chain they belonged to. At the terminus layover that moved the raw estimate by 1.2 km and slid the marker 1.3 km (issue #84, section 3).

A separate finding: the La Cadena "misorder" in the issue is not geometry. The polyline is right, and FGV states a bogus eastbound countdown for La Cadena on some far-out Vehicles. The fix for that is to drop Sightings that contradict the chain, not to move the Station.

## Decision

- **A return polyline** per Line with a one-way section, built from OSM by `scripts/build_return_tracks.cjs` into `src/data/return_tracks.json`. It is oriented like the outbound one, trunk first, so going back is still decreasing track distance. Its trunk is the outbound polyline's own vertices, so trunk Stations keep their distances. It is not drawn: `metro_lines.json` and the map are unchanged.
- **A Station Chain per direction**, from the GTFS Feed by `scripts/build_direction_stations.mjs` into `src/data/direction_stations.json`. Each Station is projected onto the track of its own chain, so Dr. Lluch has a distance on both. Nothing is listed by name.
- **The engine keys tracks and chains by `(line, isForward)`** only for a Line with a return track. Every other Line shares one track and one chain, and behaves as before.
- **Direction is chosen by trying both chains.** Each keeps the Sightings that belong to it, in order; the one that keeps more wins, and a tie falls back to the headsign. Sightings at Stations on the other chain are ignored.
- **A Sighting that contradicts the chain is dropped** (the largest consistent subset, ties broken by fit to the Segment Intervals). This is generic: it applies on every Line.

## Consequences

- No train is drawn against the one-way direction or on the wrong leg: bearings are asserted per leg in the tests.
- Line 8's coastal Stations stay excluded. That is issue #2's scope, because its polyline is a different shape.
- Segment Intervals measured from FGV were calibrated against the outbound chain only. The return pairs (Dr. Lluch → Cabanyal, Cabanyal → La Cadena) still use the GTFS figures.
- A second kind of one-way section would need a second return polyline and a generator run. Branches (ADR-0002's original problem) are still unsolved.
