# Metrovalencia Real-Time Transit Map

Real-time tracking and interactive transit visualization for the Metrovalencia railway network in Valencia, Spain.

## Language

### Network Infrastructure

**Line**:
A numbered transit corridor (metro or tram) characterized by an official brand color, set of stations, and geometric alignment.
_Avoid_: Route, branch, service line

**Station**:
A passenger transit stop along one or more Lines with geographical coordinates and platform designations.
_Avoid_: Stop, parada, depot, terminal (when referring generically to stops)

**Track Geometry**:
The geographic polyline (GeoJSON LineString) representing the physical rail alignment traversed by vehicles on a Line.
_Avoid_: Shape, track path, railway vector

### Operations & Tracking

**Vehicle**:
An active transit carriage (train or tram) moving along a Line's track geometry with a known or calculated position.
_Avoid_: Unit, engine, car

**Arrival**:
A calculated or live prediction of a Vehicle reaching a specific Station, with estimated countdown time and headsign.
_Avoid_: ETA, incoming train, arrival forecast

**Arrival Memory**:
The client-side cache and countdown state tracking predicted vehicle arrivals at each Station across navigation sessions without redundant network fetches.
_Avoid_: Local storage cache, arrival buffer

**Target Arrival Timestamp**:
The absolute wall-clock epoch timestamp (`fetchedAt + seconds * 1000`) when a vehicle is predicted to reach a Station. Enables autonomous client-side countdowns without calling the API.
_Avoid_: Due date, deadline, scheduled epoch

**Rate Budget**:
The consumption limit of upstream real-time API requests, managed by client-side TTL caching, request deduplication, and cooldown throttling.
_Avoid_: Request ceiling, throttle counter

**Timetable Walk**:
The method of calculating a Vehicle's coordinate and heading: step back along the Station Chain from the Station it is due at, spending each Segment Interval in turn, until its time remaining ($T$) is used up. Replaced Kinematic Track Projection, which multiplied $T$ by a single Commercial Speed and so placed every Vehicle about 40% too far back. See ADR-0001.
_Avoid_: Kinematic track projection, coordinate mapping, vector estimation

**Station Chain**:
The Stations of one Line in track order, the sequence a Timetable Walk steps through. Holds only Stations that actually lie on that Line's Track Geometry — see Off-Track Station.
_Avoid_: Stop list, route order

**Segment Interval**:
Median seconds from arriving at one Station to arriving at the next, distilled from the GTFS Feed into `segment_times.json`. Includes the Station Dwell at the origin.
_Avoid_: Segment time, run time, leg duration

**Station Dwell**:
The stationary duration a Vehicle remains paused at a Station platform before proceeding downstream. Carved out of the Segment Interval, since the GTFS Feed records arrival and departure as the same instant and so states no dwell of its own.
_Avoid_: Stop pause, platform wait

**Commercial Speed**:
A Line's median observed speed. Never used to place a Vehicle except where no Segment Interval covers a pair of Stations — that is ADR-0001, and it stands. It is, separately, the conversion from seconds of doubt to metres in Position Uncertainty, which is a measure of a position rather than a position, so a Line's speed is exactly the right scale for it.
_Avoid_: Max speed, cruise velocity

**Sighting**:
One prediction of one Vehicle at one Station. The same Vehicle is routinely sighted at several Stations at once; each is an independent constraint on where it is, and the nearest in time anchors the Timetable Walk because walk error grows with $T$.
_Avoid_: Observation, ping, report

**Propagation Lag**:
A fixed per-mode offset, in seconds, between the API's reported Target Arrival Timestamp and the vehicle's true position in reality. Observed empirically (2026-09-09): metro lines run 15 s behind, tram lines 4 and 6 run 10 s behind. Applied by subtracting the lag from the Target Arrival Timestamp at fetch time so the Timetable Walk starts from the corrected epoch rather than the lagged one. Not a function of network age or Position Uncertainty — it is a systematic bias in the upstream data feed.
_Avoid_: Display delay, clock offset, Position Uncertainty (which is a walk-error term, not a feed-bias term)

**Position Uncertainty**:
Metres of doubt around a walked position. Two terms, both seconds of doubt converted at the Line's Commercial Speed: √(segments walked) × 30 s, because the GTFS Feed states every time to a whole minute so each Segment Interval carries ±30 s; plus a quarter-second per second unheard beyond one Network Sync interval, for the Vehicle drifting from what the API predicted. The first term is measured from the feed; the second is calibrated, not measured, and awaits the live watch in issue #4. Not a function of age alone — a Target Arrival Timestamp is absolute, so a prediction sitting in memory keeps counting down correctly.
_Avoid_: Error, margin, tolerance, accuracy

**Position Confidence**:
The scale a live Vehicle's marker is drawn at. A walked position runs from 1 down to 0.45 as Position Uncertainty goes from 200 m to 1 km; Dead Reckoning sits below all of it at 0.35. Two floors rather than one, because they are two different claims: however long the walk, it still rests on a prediction the API made. Floored rather than taken to zero — a Vehicle whose position is a guess must read as uncertain, not absent. Simulated Trains are excluded: hollow and dashed is a different claim, not a fainter one. The CSS opacity a marker is finally drawn with keeps its own name at the render boundary; "faint" and "fades" describe what the reader sees, but the quantity is this.
_Avoid_: Opacity, alpha, staleness

**Dead Reckoning**:
Walking a Vehicle on past a spent countdown, once its Target Arrival Timestamp has passed and the Timetable Walk has no prediction left to spend. The sharpest loss of Position Confidence there is, and unrelated to age: a prediction fetched a second ago can already be in it. Sitting out a Station Dwell at the Station it was reported for is *not* this — that Vehicle is where the API said it would be.
_Avoid_: Extrapolation, coasting, projection

**Off-Track Station**:
A Station a Line serves that its Track Geometry cannot reach, because the geometry omits a branch — Lines 5 and 7 both run north to Machado, 2 km off their polylines. Held out of the Station Chain, since projecting it onto the nearest point of the wrong track corrupts every position computed through it. See ADR-0002.
_Avoid_: Missing station, unmatched stop

**Simulated Train**:
A Vehicle generated from a headway guess for a Line with no live Arrivals. Never a reported train, and drawn hollow and dashed so it cannot be mistaken for one.
_Avoid_: Mock vehicle, fake train, ghost train

**Strategic Hub**:
One of a fixed 3-Station boot set, queried automatically when the map opens, chosen for combined Line coverage across the network rather than any single-Station threshold.
_Avoid_: Boot station, seed station

**Major Station**:
A Station served by more than 3 Lines (or, for the 2 Lines with no such Station, the Station closest to qualifying), forming the fixed list a Network Sync fetches.
_Avoid_: Interchange, key station, hub (ambiguous with Strategic Hub)

**Network Sync**:
A sweep that fetches live Arrivals for every Major Station at once, subject to the same Arrival Memory pause as any other fetch, building a fuller picture of Vehicle positions than the Strategic Hubs give at boot. Runs every two minutes while the map is visible, because Arrivals age out after about 18 minutes and without it the whole network decays into Simulated Trains.
_Avoid_: Refresh all, sync all, update all stations

### The Viewer

**User Location**:
The device's own geographic fix, read on demand when the viewer asks to be located. Deliberately not a "position": Position is spent on Vehicles in this glossary — see Position Uncertainty and Position Confidence — and one word doing both jobs would leave every mention of it ambiguous. A reading taken from the device, never an estimate this app computes.
_Avoid_: User position, current position, GPS position, my location

**Location Accuracy**:
Metres of doubt the device itself reports around a User Location. Stated by the operating system rather than derived, which is exactly what separates it from Position Uncertainty — a quantity this app computes from the Timetable Walk. The two measure different things and are never compared or combined.
_Avoid_: Position uncertainty, GPS error, precision, margin

**Nearest Station**:
The Station lying the smallest straight-line distance from a User Location. Straight-line rather than along the network, because a viewer walks to a Station rather than riding to it. Undefined beyond a threshold distance: away from the network there is no nearest Station worth naming, only a far one.
_Avoid_: Closest stop, local station, nearest stop, my station

### Data Sources

**GTFS Feed**:
Official General Transit Feed Specification dataset providing scheduled trips, calendar dates, stop times, and station positions. Refetched rather than committed (`npm run fetch:gtfs`), because a feed carries a service calendar that expires — a lapsed one lists no trips for today. See ADR-0003.
_Avoid_: Timetable dump, static schedule

**OSM Rail Geometry**:
Geospatial railway alignment data extracted from OpenStreetMap via Overpass API queries.
_Avoid_: Map extract, raw coordinates

### Build & Platforms

**iOS Sync**:
The synchronization of compiled web distribution assets (`dist/`) into the native Capacitor iOS container (`ios/App/App/public`). Configured as an automatic `postbuild` lifecycle step so every local production build (`npm run build`) automatically updates the native iOS app bundle without a separate manual step. Skipped on CI build hosts (`CI=true`, e.g. Netlify) since those environments deploy the web build only and have no iOS toolchain to sync into.
_Avoid_: Manual sync, Xcode copy

**Test & Sync Protocol**:
The required completion protocol whenever an agent finishes changes: run tests, execute an **iOS Sync** via `npm run build`, and declare `test done` to the user. The user then launches or updates the native app on their physical phone using Xcode's Run (Play) button.
_Avoid_: Incomplete handoff, unsynced iOS build
