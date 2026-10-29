# 14. Live bus tracking: normalise `fecha`, match buses by line + trayecto + nearest prior fix, heading from successive fixes

Date: 2026-10-29

## Status

Accepted. Result of the spike #147 (part of #146, live EMT bus tracking for line 19). Builds on [ADR-0011](0011-on-demand-realtime-bus-fetching-and-prototype-preservation.md) (Layer 384 is the live fleet source). No earlier ADR 0014 existed.

## Context

Three unknowns blocked building bus markers from ArcGIS `Seguimiento_EMT` Layer 384: the `fecha` offset, how to keep a bus's identity across polls, and how to get a heading. Evidence: `src/data/fixtures/emt_line19_recording.json`, 42 polls of line 19 (`where=linea='19'`) every 15 s, 2026-10-29 21:15:37 to 21:25:52 UTC (22:15 to 22:26 in Valencia, CET), with each response's HTTP `Date` header. About 6 buses on the line (4 towards La Malva-rosa, 2 back).

Findings that differ from `docs/research/emt-valencia-bus-api.md`:

1. **`gid` is not a bus id.** It is a table row id. The layer is rewritten about every 30 s (every second poll at a 15 s cadence); each rewrite gives every row a new `gid` (the whole table shifts by its size, 71 to 76 rows). 113 distinct `gid` for about 6 buses in 10 minutes. The research note calling it "stable across consecutive polls" is wrong beyond one rewrite.
2. **The layer updates in 30 s steps**, not 15 s. Polling faster than 30 s returns the same rows. Fix age after correcting `fecha` (below) was 3 s to 65 s, median 26 s. Two consecutive snapshots of a bus were 0 to 63 s apart (median 29 s), median 80 m, p90 233 m, max 334 m apart.
3. **Glitch responses exist.** Poll 2 returned 1 of 6 buses (a rewrite in progress); poll 41 returned 0 features. Neither was an error status.

## Decision

### `fecha`: local wall clock stored as UTC, and the offset flips

`fecha` is epoch milliseconds, but the number is the Valencia wall-clock time read as if it were UTC, so `fecha = trueUtc + offset(Europe/Madrid)`. On 2026-10-29 (CET, UTC+1, DST ended on 2026-10-25) this gave `fecha - serverDate = +3600 s` (minus the fix age). It therefore follows DST: +3600000 ms in winter, +7200000 ms in summer. Summer was not observable on this date; it is derived from the local-as-UTC form and must be re-checked on the first CEST day (2027-03-28).

**Surprise: the offset is not constant.** In 32 of 227 rows (14 %), `fecha` was already true UTC (offset 0); 195 rows had +1 h. The switch happens per rewrite, and the same rows flipped between two polls of one snapshot (polls 15 and 16, 35 and 36). Taking a fixed `fecha - 3600000` is wrong one time in seven.

Rule (`normalizeFecha(fechaMs, nowMs)`, pure, unit-testable):

1. `offsetMs` = Europe/Madrid UTC offset at `nowMs` (3600000 or 7200000), from `Intl.DateTimeFormat` with `timeZone: 'Europe/Madrid'`, not a hard-coded value.
2. `ageMs = nowMs - fechaMs`.
3. If `ageMs < -(offsetMs / 2)` (fecha is in the future by more than half the offset), return `fechaMs - offsetMs`. Otherwise return `fechaMs`.
4. Use the response's HTTP `Date` as `nowMs` when readable, else `Date.now()`. Phone clocks that are off by more than about 25 min break rule 3; the server `Date` avoids that.

On the recording the normalised age was never negative: min 3 s, median 26 s, max 65 s. A fix is **stale** when its normalised age exceeds 120 s (about two missed rewrites) and the bus is dropped when no fix has arrived for 120 s. Ages below 0 after normalising are clamped to 0.

### Identity: line + `trayecto` + nearest prior fix

Because `gid` changes, identity is reconstructed on the client. Per poll, only on a new snapshot (see de-dup below):

1. Candidates are the fixes of the previous snapshot with the same `trayecto` (exact string, trimmed) and `fecha` not newer than the new fix's (`prev.t <= new.t`, after `normalizeFecha`).
2. Build all (previous, new) pairs, sort by great-circle distance ascending, and assign **greedily globally**: take the closest pair, lock both, continue. A previous fix is used at most once.
3. A pair is accepted only if its distance is at most `MATCH_GATE_M = 400`. The gate sits above the observed max step (334 m in 30 s, about 11 m/s) and well below the 489 m closest approach of two same-direction buses.
4. An unmatched new fix starts a new track. An unmatched old track is kept in place (no dead reckoning) for up to 120 s, then dropped (also covers the partial and empty responses).
5. De-dup snapshots: a poll whose set of (`gid`) equals the previous poll's is the same snapshot and updates nothing. An empty response, or one with fewer than half the tracked buses of that line, is ignored for matching (it is a rewrite in progress), not treated as the buses disappearing.

Measured on the recording, using the constant `gid` shift between consecutive snapshots as ground truth (slot position in the table; 78 bus steps across 14 snapshot pairs with equal bus count):

| gate (m) | greedy global: wrong / unmatched | per-bus nearest: wrong / unmatched |
|---|---|---|
| 100 | 0 / 36 | 0 / 36 |
| 200 | 0 / 12 | 0 / 12 |
| 300 | 0 / 4 | 0 / 4 |
| 400 | 0 / 1 | 1 / 0 |
| 600 | 0 / 1 | 1 / 0 |

- 0 mismatches for the greedy rule at every gate. A purely per-bus nearest rule produces 1 wrong match at gate 400 and above, so assignment must be global (one-to-one), not per bus.
- **The one unmatched bus is a terminus turnaround**: at La Malva-rosa a bus changed `trayecto` from "Est.del Nord - La Malva-rosa" to "La Malva-rosa - Est.del Nord" (moved 169 m in 37 s). The strict `trayecto` rule starts a new track there, which is the correct outcome for a visual marker (it reverses). The per-bus rule without a `trayecto` check would have stolen a different bus 374 m away. Do not relax the `trayecto` check.
- **Two buses close together:** the closest same-`trayecto` pair on the recording was 489 m apart (snapshot 16), then 706 m, 766 m. Closer buses would be a convoy; the greedy global rule still matches them correctly while each step stays shorter than the gap between them, and degrades to a possible swap otherwise. Swapping two identical, adjacent buses of the same line and direction is visually harmless; it only mislabels which one is which.
- Buses at a stop stay put: of the step distances, many were 1 to 7 m of GPS jitter with a new `fecha`.

### Heading: successive fixes, not the route tangent

`heading(prev, next)` = initial great-circle bearing from the previous accepted fix to the new one, degrees clockwise from north, 0 to 360, when the distance between them is at least `HEADING_MIN_MOVE_M = 10`. Below that (stopped at a stop, GPS jitter was 1 to 7 m) keep the last heading. A track's first fix has no heading (hide or do not rotate the arrow, do not guess). The marker interpolates between fixes, so the displayed heading holds the bearing of the segment being travelled.

Route tangent was rejected: Layer 74 ("Ruta", line 19) is 75 unordered, undirected `LineString` segments (`id_tramo` = stop-to-stop pieces, both directions and detour stubs mixed, no sequence field). Using it means snapping and ordering a graph and picking the direction from `trayecto` text, which is a project of its own and breaks silently on detours (Layer 75). Successive fixes cost nothing, are always correct for temporary detours, and 30 s steps of median 80 m are long enough to make the bearing stable. If a visible lag at turns matters later, add a tangent only for the first fix.

## Consequences

- Poll Layer 384 no faster than 30 s (ADR-0011's "15 to 20 s" budget is more than the data changes); with the line filter `where=linea='19'` the payload is under 1.5 KB.
- The matching and `fecha` rules are pure functions over `{gid, trayecto, fecha, lon, lat}` and should be unit-tested against the fixture: `normalizeFecha` flips (polls 16, 25, 27, 33, 34, 36 in the recording are offset-0 rows; all rows of a snapshot flip together), partial poll 2, empty poll 41, the turnaround between snapshots 15 and 16, and zero wrong matches over all consecutive snapshot pairs.
- The identity rule is a heuristic and could swap two buses that cross within one 30 s step; it never invents a bus.
- Open check: the CEST offset (+7200000 ms) is derived, not observed. Re-run a short recording on the first summer-time day.
- The fixture holds only public municipal positions and times. No keys or personal data.
