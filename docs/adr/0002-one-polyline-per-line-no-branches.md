# 2. One polyline per line, and no branch support

Date: 2026-09-04

## Status

Accepted, with a known cost. Revisit when a branch matters to a user.

## Context

`metro_lines.json` holds one LineString per Line, and the engine reduces a Vehicle's position to a single scalar: distance along that polyline. Every operation — projecting Stations, ordering the Station Chain, interpolating a coordinate — assumes that scalar is meaningful.

Several Lines fork. Line 1 runs to Bétera, Llíria and Seminari-CEU in one direction and Torrent, Picassent and Castelló in the other. Lines 5 and 7 run north to Machado as well as east to Marítim. Line 8 has through-services down the Line 6 corridor. A scalar distance cannot represent a fork: two points on different branches can sit at the same distance from the origin.

The polylines only cover the trunk. So Stations on a branch project onto the *nearest point of the wrong track* — Torrent Avinguda landed 1,025 m off Line 1's geometry, and Machado 2,076 m off Line 5's.

This is worse than it first appears. Those Stations were being sorted into the Station Chain by their bogus distance, which corrupts the ordering that [ADR-0001](0001-walk-the-timetable-to-place-trains.md)'s Timetable Walk steps through. One misplaced Station makes every position computed through that part of the chain wrong, not just its own.

## Decision

Keep the single-polyline model, and **hold Stations more than 250 m from their Line's geometry out of that Line's Station Chain**, recording them on `trainPositionEngine.offTrackStations`.

The tolerance exists because real platforms sit beside the alignment rather than on it; the observed honest offsets are all under 200 m and the real mismatches all over 340 m, so the threshold is not finely balanced.

## Consequences

Fourteen Stations are currently held out. An Arrival naming one of them finds no Station on that Line, so the Vehicle is skipped rather than drawn somewhere wrong.

**We show a gap instead of a lie.** A train that vanishes is visibly missing and invites a bug report; a train confidently drawn 2 km off the rails looks authoritative and does not.

Line 8's chain reduces to its four real shuttle Stations — Neptú, Grau - La Marina, Francesc Cubells, Marítim — which is the geometry we actually have.

**This decision was taken deliberately and under time pressure**, in favour of the accuracy work in ADR-0001. It was scoped out before a test caught Torrent Avinguda, which is what turned an abstract limitation into a measured one. Proper support means modelling a Line as a graph of branch segments rather than one polyline, and picking the branch from the headsign. The Station Chain is already keyed on the headsign's direction, so that is the seam to cut at when the time comes.

Until then the exclusion list is the honest record of what the map cannot show, and a test asserts the known entries so the list cannot grow silently.
