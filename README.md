# Metrovalencia Real-Time Tracker

Live train positions on the Metrovalencia network, drawn on real rail geometry.

```bash
npm install
npm run dev      # http://localhost:5173
npm test
```

`CONTEXT.md` is the glossary — read it before naming anything. The decisions behind the design are in `docs/adr/`:

- [ADR-0001](docs/adr/0001-walk-the-timetable-to-place-trains.md) — why positions come from a timetable walk, not a speed constant
- [ADR-0002](docs/adr/0002-one-polyline-per-line-no-branches.md) — why branches are unsupported, and what that costs
- [ADR-0003](docs/adr/0003-gtfs-feeds-are-refetchable-input.md) — why feeds are fetched, not committed

## How a train gets on the map

1. **Boot.** `arrivalStore.seedStrategicHubs()` fetches three interchange stations.
2. **Predictions land.** The API answers "vehicle 5301 reaches Àngel Guimerà in 415s", stamped with an absolute `trainTimestamp`. `arrivalStore` keeps these in memory and in `sessionStorage`.
3. **Positions are walked.** `trainPositionEngine` steps back along the line's station chain from the station a train is due at, spending each segment's real timetabled interval and dwelling at each platform, until the countdown is used up. Where the same vehicle is predicted at two stations, the nearest sighting anchors the walk and the pair settles the direction.
4. **The map animates.** `MapView` samples the engine each frame and eases each marker towards its new anchor.
5. **Network Sync.** Every two minutes the Major Stations are refetched, because predictions age out after ~18 minutes.

Lines with no live predictions fall back to simulated trains. They are drawn hollow and dashed — they are a headway guess, not a reported train, and must never look like one.

### Why the walk, not a speed constant

The engine used to place a train by multiplying its countdown by one commercial speed. Real segments run from 3.9 m/s (Machado → Alboraia Palmaret) to 16.9 m/s (La Pobla de Farnals → Rafelbunyol), so no constant fits. Measured against live data — pairs where the API reported one vehicle at two stations, making the gap between timestamps ground truth — the walk cut mean timing error from 74s to 18s and mean position error from 534m to 130m, and was closer on 39 of 40 pairs.

The residual is dominated by the feed quantising every time to a whole minute. `Colón → Alameda` is timetabled at 60s and consistently runs ~100s.

## Data pipeline

The app imports two generated files. Both are committed; the feeds they come from are not.

```bash
npm run fetch:gtfs     # download the current feed into a dated directory
npm run build:data     # regenerate gtfs_expanded.json + segment_times.json
npm test               # confirm the network still looks sane
```

- **`src/data/gtfs_expanded.json`** — every station with the lines it serves, plus line geometry.
- **`src/data/segment_times.json`** — median seconds between consecutive station arrivals, per line. ~440 segments, 12 KB. This is what the walk spends.
- **`src/data/metro_lines.json`** — the Track Geometry the engine projects onto. Simplified to 3 m tolerance by `npm run build:geometry` (5,747 → 988 points, 414 KB → 29 KB) because the engine imports it synchronously and so it ships in the JS chunk. Re-run that after replacing the geometry, and check `npm test` — the track-geometry-fidelity tests fail if simplification drops a station out of a chain.
- **`public/line4_osm.geojson`** — line 4's finer OSM alignment, `fetch`ed at runtime rather than imported so its 209 KB stays out of the bundle. It must live in `public/`; served from `src/` it resolves in dev and 404s in production.
- **`src/data/network_overlay.json`** — corrections applied on top of the feed. **Empty is the healthy state.** It exists because the feed bundled in July 2026 had already expired and predated lines 5 and 7 returning east of Alameda, while the live API was reporting trains bound for Marítim. A fresh feed made the overlay redundant; its `history` records why it existed.

**Refetch the feed when positions look wrong.** A GTFS feed carries a service calendar that expires, and a lapsed feed yields a timetable with no trips for today. The scripts always take the newest dated directory.

## Known limits

- **Branches.** A line is modelled as one polyline with a scalar distance along it, which cannot represent a fork. Lines 5 and 7 run north to Machado, line 1 to Torrent Avinguda, and line 8 through the line 6 corridor, but none of those branches are in `metro_lines.json`. Stations more than 250 m off their line's geometry are held out of its chain and listed in `trainPositionEngine.offTrackStations` — better an honest gap than a train drawn on the wrong track.
- **Station ids.** The GTFS `stop_id` space and the live API's id space disagree for most stations; `/api/metro/prevision/<id>` uses the API's. Never hand-write one — derive it from `paradas_api.json`. A wrong id fails silently, and `npm test` guards the ones we hardcode.
- **The eastern stations have no arrival endpoint.** Ayora, Amistat and Aragó carry trains and appear in search, but the API exposes no station id for them, so they have no arrivals card of their own.
