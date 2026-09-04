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
The method of calculating a Vehicle's coordinate and heading: step back along the Station Chain from the Station it is due at, spending each Segment Interval in turn, until its time remaining ($T$) is used up. Replaced Kinematic Track Projection, which multiplied $T$ by a single Commercial Speed and so placed every Vehicle about 40% too far back.
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
A Line's median observed speed, used only where no Segment Interval covers a pair of Stations. A fallback, never the primary model.
_Avoid_: Max speed, cruise velocity

**Sighting**:
One prediction of one Vehicle at one Station. The same Vehicle is routinely sighted at several Stations at once; each is an independent constraint on where it is, and the nearest in time anchors the Timetable Walk because walk error grows with $T$.
_Avoid_: Observation, ping, report

**Off-Track Station**:
A Station a Line serves that its Track Geometry cannot reach, because the geometry omits a branch — Line 9 lists Rafelbunyol but its geometry stops 9.8 km short. Held out of the Station Chain, since projecting it onto the nearest point of the wrong track corrupts every position computed through it.
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

### Data Sources

**GTFS Feed**:
Official General Transit Feed Specification dataset providing scheduled trips, calendar dates, stop times, and station positions.
_Avoid_: Timetable dump, static schedule

**OSM Rail Geometry**:
Geospatial railway alignment data extracted from OpenStreetMap via Overpass API queries.
_Avoid_: Map extract, raw coordinates
