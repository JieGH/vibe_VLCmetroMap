# 14. Live bus tracking: normalise `fecha`, match buses by line + trayecto + nearest prior fix, heading from successive fixes

Date: 2026-10-29

## Status

Accepted. Result of the spike #147 (part of #146, live EMT bus tracking for line 19). Builds on [ADR-0011](0011-on-demand-realtime-bus-fetching-and-prototype-preservation.md) (the **Bus GPS Stream**, ArcGIS Layer 384, is the live fleet source). No earlier ADR 0014 existed. Vocabulary (**Bus GPS Stream**, **Fix**, **Track**, **Trayecto**) is defined in `CONTEXT.md`. Poll numbers below are 0-based indexes into `polls` in the fixture.

## Context

Three unknowns blocked building bus markers from the Bus GPS Stream (ArcGIS `Seguimiento_EMT` Layer 384): the `fecha` offset, how to keep a bus's identity across polls, and how to get a heading. Evidence: `src/data/fixtures/emt_line19_recording.json`, 42 polls of line 19 (`where=linea='19'`) every 15 s, 2026-10-29 21:15:37 to 21:25:52 UTC (22:15 to 22:26 in Valencia, CET), with each response's HTTP `Date` header. About 6 buses on the line (4 towards La Malva-rosa, 2 back).

Findings that differ from `docs/research/emt-valencia-bus-api.md`:

1. **`gid` is not a bus id.** It is a table row id. The layer is rewritten about every 30 s (about every second poll at a 15 s cadence, 21 distinct non-empty snapshots in 42 polls); each rewrite gives every row a new `gid` (the whole table shifts by its size, 71 to 76 rows). 113 distinct `gid` for about 6 buses in 10 minutes. The research note calling it "stable across consecutive polls" is wrong beyond one rewrite.
2. **The layer updates in 30 s steps**, not 15 s. Polling faster than 30 s returns the same rows. Fix age after correcting `fecha` (below) was 3 s to 65 s, median 26 s. Two consecutive snapshots of a bus were 0 to 63 s apart (median 29 s), median 80 m, p90 233 m, max 334 m apart.
3. **Glitch responses exist.** Poll 2 returned 1 of 6 buses (a rewrite in progress); poll 41 returned 0 features. Neither was an error status.

## Decision

### `fecha`: local wall clock stored as UTC, and the offset flips

`fecha` is epoch milliseconds, but the number is the Valencia wall-clock time read as if it were UTC, so `fecha = trueUtc + offset(Europe/Madrid)` in the normal case (and `trueUtc` in the offset-0 case above). On 2026-10-29 (CET, UTC+1, DST ended on 2026-10-25) this gave `fecha - serverDate = +3600 s` (minus the fix age). It therefore follows DST: +3600000 ms in winter, +7200000 ms in summer. Summer was not observable on this date; it is derived from the local-as-UTC form and must be re-checked on the first CEST day (2027-03-28).

**Surprise: the offset is not constant.** In 32 of 227 rows (14 %), `fecha` was already true UTC (offset 0); 195 rows had +1 h. The flip is per response, not per layer rewrite: it hit all rows of 6 polls (16, 25, 27, 33, 34, 36) and none of the rows of the others. It is not tied to the 30 s rewrite either: polls 15 and 16 (and 33/34, 35/36) are identical `gid` sets, yet mean `fecha` minus the server `Date` drops from about +3581 s to about -34 s between 15 and 16 (a ~3615 s step) and returns to +3580 s at poll 17, while polls 25, 27 and 33 are new snapshots that arrived already at offset 0. Unpredictable, so decide the offset per row from its own value (rule below). Taking a fixed `fecha - 3600000` is wrong about one row in seven.

Rule (`normalizeFecha(fechaMs, nowMs)`, pure, unit-testable):

1. `offsetMs` = Europe/Madrid UTC offset (3600000 or 7200000), from `Intl.DateTimeFormat` with `timeZone: 'Europe/Madrid'`, not a hard-coded value. It is evaluated at the fix's own wall-clock time (the instant `fechaMs - offsetMs`, resolved by one fixed-point step starting from `nowMs`'s offset), not at `nowMs`, so a fix just before a DST change gets the offset that was in force then.
2. `ageMs = nowMs - fechaMs`.
3. If `ageMs < -(offsetMs / 2)` (fecha is in the future by more than half the offset), return `fechaMs - offsetMs`. Otherwise return `fechaMs`.
4. Use the response's HTTP `Date` as `nowMs` when readable, else `Date.now()`. Phone clocks that are off by more than about 25 min break rule 3; the server `Date` avoids that.
5. Around a DST change the local wall clock repeats or skips an hour, so a wall-clock `fecha` is ambiguous by about 1 h. The `ageMs < -(offsetMs / 2)` test in rule 3, run against the `Date` header, picks the candidate (`fechaMs` or `fechaMs - offsetMs`) closest to `nowMs`, which resolves it. Output is always clamped to at most `nowMs`.
6. **Date header is not CORS-readable.** Layer 384 exposes only `Access-Control-Allow-Origin/Credentials`, so in the web app and Capacitor `Date` cannot be read and `nowMs` falls back to the device clock. A phone clock off by a minute or more then clamps or inflates fix ages. Rule without `Date` (`resolveSnapshotClock`): all rows of a response share one offset, so decide it once from the median `fecha` against the device clock (still correct for skews up to about 25 min), then anchor `nowMs` to the snapshot: keep the device clock only if it puts the freshest fix 0 to 40 s old (the recording's freshest row is 3 to 36 s old, median 18 s), else use freshest fix + 18 s. Tested with device clocks skewed by +/-2 min and +/-10 min.

On the recording the normalised age was never negative: min 3 s, median 26 s, max 65 s. Two clocks, two rules, both with the same 120 s limit (about four missed rewrites, well above the 65 s maximum seen):

- **Fix age** (fix clock): `ageMs = nowMs - normalizeFecha(fechaMs, nowMs)`, clamped to 0 at the low end. A bus is **hidden** from the map when its fix age is strictly greater than 120 s. Exactly 120 s is still shown.
- **Track age** (poll clock): the time since the poll (`nowMs`, the `Date` header) of the track's last *matched* snapshot. A track is **dropped** when that is strictly greater than 120 s. Exactly 120 s is kept. Until then an unmatched track stays at its last position (and is hidden by the fix-age rule once its fix is old).

### Identity: line + `trayecto` + nearest prior fix

Because `gid` changes, identity is reconstructed on the client. Per poll, only on a new snapshot (see de-dup below):

1. Candidates are the fixes of the previous snapshot with the same `trayecto` (exact string, trimmed) and `fecha` not newer than the new fix's (`prev.t <= new.t`, after `normalizeFecha`).
2. Build all (previous, new) pairs, sort by great-circle distance ascending, and assign **greedily globally**: take the closest pair, lock both, continue. A previous fix is used at most once.
3. A pair is accepted only if its distance is at most `MATCH_GATE_M = 400`. The gate sits above the observed max step (334 m in 30 s, about 11 m/s) and well below the 489 m closest approach of two same-direction buses.
4. An unmatched new fix starts a new track. An unmatched old track is kept in place (no dead reckoning) until its track age exceeds 120 s (poll clock, see above), then dropped. This also covers the partial and empty responses.
5. Tie-breaks make the result deterministic: pairs at equal distance are ordered by lower previous `gid`, then lower new `gid`, then earlier input order. If `prev.t == new.t` (same normalised timestamp) the new fix is treated as the same fix: the match is kept, the position is not updated and heading is not recomputed.
6. De-dup snapshots: a poll whose set of (`gid`) equals the previous poll's is the same snapshot and updates nothing. An empty response, or one with fewer than half the tracked buses of that line, is ignored for matching (it is a rewrite in progress), not treated as the buses disappearing.

Measured on the recording, using the constant `gid` shift between consecutive snapshots as ground truth (slot position in the table; 96 bus steps across 17 consecutive snapshot pairs with equal bus count, out of 21 non-empty snapshots):

| gate (m) | greedy global: wrong / unmatched | per-bus nearest: wrong / unmatched |
|---|---|---|
| 100 | 0 / 36 | 0 / 36 |
| 200 | 0 / 12 | 0 / 12 |
| 300 | 0 / 4 | 0 / 4 |
| 400 | 0 / 1 | 1 / 0 |
| 600 | 0 / 1 | 1 / 0 |

- 0 wrong matches for the greedy rule at every gate (re-run: at gate 400, 96 steps, 0 wrong, 1 unmatched). A purely per-bus nearest rule produces 1 wrong match at gate 400 and above, so assignment must be global (one-to-one), not per bus.
- **The one unmatched bus is a terminus turnaround**: at La Malva-rosa a bus changed `trayecto` from "Est.del Nord - La Malva-rosa" to "La Malva-rosa - Est.del Nord" (moved 169 m in 37 s). The strict `trayecto` rule starts a new track there, which is the correct outcome for a visual marker (it reverses). The per-bus rule without a `trayecto` check would have stolen a different bus 374 m away. Do not relax the `trayecto` check.
- **Two buses close together:** the closest same-`trayecto` pair on the recording was 489 m apart (snapshot 16), then 706 m, 766 m. Closer buses would be a convoy; the greedy global rule still matches them correctly while each step stays shorter than the gap between them, and degrades to a possible swap otherwise. Swapping two identical, adjacent buses of the same line and direction is visually harmless; it only mislabels which one is which.
- Buses at a stop stay put: of the step distances, many were 1 to 7 m of GPS jitter with a new `fecha`.

### Heading: successive fixes, not the route tangent

`heading(prev, next)` = initial great-circle bearing from `prev` to the new fix, degrees clockwise from north, 0 to 360, when the distance between them is at least `HEADING_MIN_MOVE_M = 10`. `prev` is the reference fix of the track and **stays fixed until the bus has moved at least 10 m from it**: only then is the heading updated and `prev` advanced to the new fix. Below that (stopped at a stop, GPS jitter was 1 to 7 m) the last heading is held and `prev` is not replaced, so a slow creep accumulates and eventually registers instead of being discarded 1 to 7 m at a time. A track's first fix has no heading (hide or do not rotate the arrow, do not guess). The marker interpolates between fixes, so the displayed heading holds the bearing of the segment being travelled.

Route tangent was rejected as the heading source. Layer 74 ("Ruta", line 19) is 75 `LineString` segments with no sequence field. Probe on 2026-10-29: `id_tramo` is `<from node><to node>` (a node is `P` + stop code x 100 + 2 digits, or `L` + id for a non-stop waypoint), the 75 segments form **one closed directed loop** (every node in and out degree 1, joints within 5 m), and the 51 stops of Layer 73 match `src/data/emt_stops.json` by `stopCode`. So order and direction are recoverable by chaining on `id_tramo`, but turning that into a tangent still means snapping fixes onto it and choosing the direction from `trayecto` text, and it breaks silently on temporary detours (Layer 75). Successive fixes cost nothing, are always correct for detours, and 30 s steps of median 80 m are long enough to make the bearing stable. Snapping to the route shape may be added later as optional smoothing of the marker position, never as the source of heading. If a visible lag at turns matters, add a tangent only for the first fix.

## Consequences

- Poll the Bus GPS Stream no faster than 30 s, with a 30 s TTL cache (ADR-0011 sets a 20 s TTL for the SAE arrivals feed; this layer only changes every ~30 s, so 20 s would re-fetch identical rows); with the line filter `where=linea='19'` the payload is under 1.5 KB.
- The matching and `fecha` rules are pure functions over `{gid, trayecto, fecha, lon, lat}` and should be unit-tested against the fixture: `normalizeFecha` flips (polls 16, 25, 27, 33, 34, 36 in the recording are offset-0 responses; all rows of a response flip together, including polls 16, 34 and 36 which repeat the previous poll's `gid` set), partial poll 2, empty poll 41, the turnaround between snapshots 15 and 16, and zero wrong matches over all consecutive snapshot pairs.
- The identity rule is a heuristic and could swap two buses that cross within one 30 s step; it never invents a bus.
- Open check: the CEST offset (+7200000 ms) is derived, not observed. Re-run a short recording on the first summer-time day.
- The fixture holds only public municipal positions and times. No keys or personal data.
