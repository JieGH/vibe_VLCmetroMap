# Local scheduled Journey routing

The application Journey API adapts a fixed operator-configured OTP endpoint. It does not calculate transit trips from marker positions or approximate walking with straight lines. The graph supports Metrovalencia metro/tram and, when prepared with `--include-emt`, scheduled EMT buses and pedestrian transfers.

## Requirements and inputs

Use Node with built-in fetch, `curl`/network access for inputs, `unzip`, `zip`, and Java 21. OTP is pinned to **2.7.0**; its Maven checksum is verified before launch. No service account, Docker installation, or paid host is required for local development.

The [versioned OTP tutorial](https://docs.opentripplanner.org/en/v2.7.0/Basic-Tutorial/) confirms Java 21 support and the GTFS/PBF graph workflow. Input sources are the [official Metrovalencia GTFS ZIP](https://www.metrovalencia.es/google_transit_feed/google_transit.zip) and [Geofabrik Valencia OSM extract](https://download.geofabrik.de/europe/spain/valencia.html). The regional street extract is about 134 MB, the OTP binary about 161 MB, and a locally built rail graph about 180 MB. Allow additional working disk and memory during builds. OSM attribution and applicable input licences still apply.

All binary inputs, graph outputs, probe results, and input manifests stay under the ignored `.cache/navigation` directory. Do not commit raw feeds or the graph.

## Prepare, build, and serve

Run from the repository root:

```sh
node scripts/navigation/otp.mjs prepare
node scripts/navigation/otp.mjs build
node scripts/navigation/otp.mjs serve
```

For the complete rail/EMT graph, use `node scripts/navigation/otp.mjs prepare --include-emt` before building. EMT's current ZIP is discovered from the municipality's stable CKAN dataset API rather than a hardcoded dated resource. The [official municipal dataset](https://opendata.vlci.valencia.es/dataset/google-transit-lines-stops-bus-schedules) publishes the schedules under CC BY 4.0. Preparation assigns stable `metrovalencia` and `emt` feed namespaces so Station and EMT Bus Stop identities do not collide.

Preparation downloads the pinned runtime and streets if absent, refreshes the rail ZIP, validates required GTFS files and calendar bounds, and records hashes/source metadata in `inputs.json`. A failed refresh leaves the last successfully prepared graph input in place rather than replacing it with a truncated ZIP. Each download has a ten-minute deadline. Preparing changed inputs does not rebuild an already running graph.

For an explicit, identified existing official snapshot instead of a successful fresh download:

```sh
node scripts/navigation/otp.mjs prepare --rail-dir 20260902_084044_Metro_Valencia
node scripts/navigation/otp.mjs build
node scripts/navigation/otp.mjs serve
```

This does not establish that the snapshot is the latest export. Check its source/date and service range in `inputs.json`; request a date inside that range. A calendar that covers today can still contain outdated timetables.

The default Java heap cap is 3 GB, adjustable with `OTP_HEAP=1G`, `2G`, `3G`, or `4G`. `OTP_JAVA` can select the Java executable; otherwise the script uses `JAVA_HOME`, the known Homebrew Java 21 location when present, or `java` on PATH. The service binds only `127.0.0.1:8801`, with four HTTP threads. Build and serve separately to avoid maintaining two large graph processes. Stop the serve command with Ctrl-C when no longer needed.

In another terminal, configure the application backend:

```sh
OTP_URL=http://127.0.0.1:8801/otp/gtfs/v1 OTP_GRAPH_MANIFEST=.cache/navigation/built.json npm run serve
```

The root application's integration supplies the fixed `POST /api/journeys` route. Development uses its configured navigation backend proxy; the OTP GraphQL listener itself is not intended as a public API. For native or separately hosted clients, `VITE_NAVIGATION_API_URL` is the reachable application backend origin, shared with place search. A phone cannot reach the developer computer using the phone's own `127.0.0.1`. Use an appropriately configured HTTPS endpoint and allowed origins; do not embed service secrets in Vite variables.

Choosing a route sends the Starting Point and Destination coordinates to the application routing backend; explain that use in the product's contextual location copy. OTP remains a local backend component rather than an arbitrary internet relay.

`OTP_GRAPH_MANIFEST` is an operator-configured path to the manifest for the graph actually loaded by that OTP service. Successful builds record the graph's SHA-256 and byte size alongside each feed's calendar bounds and source hashes. The backend reads that trusted file at startup; restart it after changing graphs/manifests. Do not accept a manifest path from a passenger request. For a separately hosted OTP instance, supply the matching build manifest with the application backend; a local filename alone cannot prove what a remote process has loaded.

The response sets `feedCalendarsVerified` only when compatible build metadata exists for both rail and EMT. It returns operator-specific warnings when a requested Madrid calendar date falls outside an included feed's range. For example, after this EMT feed ends, a valid rail Journey remains available with a `BUS`/`calendar-expired` warning rather than implying that missing bus alternatives prove no bus service. Missing/unreadable/unrecognized metadata keeps verification false; the UI must explain that coverage could not all be verified. These warnings do not fabricate service or mark a graph fresh.

## Health and real Journey probe

With OTP running:

```sh
node scripts/navigation/otp.mjs probe
```

This plans Àngel Guimerà → Benimaclet at the current time through the same normalization adapter used by the API. It writes the complete result to `probe.json`, prints a short summary, and exits nonzero unless at least one transit Journey is returned. This is an explicit live diagnostic, not part of ordinary automated tests and not a background polling loop.

The API uses named longitude/latitude coordinate pairs and an ISO departure time including timezone. Responses contain `status`, `generatedAt`, `servicePeriod`, and normalized `journeys`; Journey and leg timestamps are Unix milliseconds. Leg modes are `WALK`, `METRO`, `TRAM`, or `BUS`, with scheduled provenance, route/headsign, boarding/alighting places, intermediate call times, and GeoJSON LineString geometry. Accessibility is `unknown` until verified separately.

Alternatives prioritize earliest arrival, collapse repeated departures on the same public Line and passenger call path even when upstream GTFS branch IDs differ, and retain useful lower-walking/fewer-transfer choices when present. No more than three are returned. The default limit is 15 minutes per contiguous walking portion. If all candidates exceed it, the API returns `walking-limit` with no silently accepted Journey; explicit `allowLongerWalk` allows the passenger to review longer options.

The adapter has a two-request upstream cap, a 12-second deadline, a 2 MB response limit, and no passenger-provided upstream URL. Client requests have a 15-second deadline and support cancellation. Missing configuration returns `routing-unavailable`; an out-of-range service calendar returns `calendar-expired`; a valid date with no connection returns an empty `no-route` result. These conditions must remain visible rather than falling back to invented transit or walking paths.

## Verification record

On 2026-10-31, the pinned JVM built a real rail/street graph with a 3 GB heap cap: 949,343 vertices, 2,484,494 edges, and 144 transit stops. An actual normalized Àngel Guimerà → Benimaclet Journey returned WALK → METRO → WALK, including Xàtiva, Colón, Alameda, and Facultats - Manuel Broseta intermediate calls and OSM walking geometry. The real adapter also returned `calendar-expired` for May 2027 and `no-route` for an out-of-area Destination.

That initial graph used the explicitly identified **2026-09-02 rail export**, whose calendar covers **2026-09-02 through 2026-12-27**. The first fresh-download attempt timed out after 180 seconds and left an invalid partial archive; this partial archive was not used for the graph. A subsequent full refresh succeeded. The reproducible prepare command then downloaded the current official rail ZIP (archive entries dated **2026-10-28**) and current municipal EMT ZIP (resource **2026-10-29**, `feed_version` **23-10-2026**). The resulting `built.json` records source URLs, hashes, preparation/build times, and rail calendar bounds **2026-09-05 through 2026-12-27**, with EMT bounds **2026-10-16 through 2026-11-22**. These bounds do not imply every day inside them has service; OTP applies calendar weekdays and exceptions.

The fresh combined graph built successfully with the same 3 GB heap cap: **952,642 vertices, 2,491,100 edges, 1,261 transit stops, and 255 patterns**. Real current-calendar requests on 2026-10-31 verified:

- **EMT-only:** Plaça de l'Ajuntament → Doctor J.J. Dòmine/Port returned Line 4 with 12 intermediate EMT Bus Stops, plus distinct Line 92 and less-walking Line 19 alternatives.
- **Mixed rail/EMT:** Aeroport → Hospital La Fe returned WALK → METRO 5 → WALK → BUS 9 → WALK, with one transfer and ordered scheduled calls. No live Arrival identity was inferred.
- **Distinct rail alternatives:** Àngel Guimerà → Benimaclet returned two passenger paths, public Lines 3 and 9, fastest first. Live validation exposed separate GTFS Line 9 branch IDs for the identical passenger path; the deduplication regression and actual rerun confirm those later departures no longer fill a third slot.
- **Individual feed expiry:** A real request for 2026-11-23 retained valid Line 9/3 rail Journeys while returning a `BUS`/`calendar-expired` warning from the matching graph manifest. A current-date request verified both feeds without that warning.

Full local results are saved under `.cache/navigation/bus-verification.json`, `mixed-verification.json`, and `probe.json`. They are explicit development diagnostics, not committed fixtures or promises of deployed infrastructure. Production/native backend reachability remains unverified. OTP's overall `servicePeriod` is not proof that every included operator has valid service throughout that entire range; check individual feed calendars when refreshing the graph.

Automated adapter/client tests use controlled OTP and HTTP responses; they do not replace the real graph probe. Locked-phone navigation and actual notification delivery are outside this routing verification.

## On-demand Journey Arrivals

Journey Arrivals leave the chosen Journey's scheduled times unchanged and present separate Line predictions. Rail predictions read Arrival Memory synchronously. EMT predictions reuse the existing 20-second cache and in-flight deduplication, with original fetch timestamps exposed through a read-only snapshot so displaying cached information never resets its countdown.

Only the passenger's explicit Refresh arrivals action fetches the single relevant Station or EMT Bus Stop. Selecting another portion, advancing Journey Progress, or ticking the displayed countdown does not fetch transit predictions. Hidden views do not initiate refresh. Cached predictions count down from their original Target Arrival Timestamp, become stale according to their source cache policy, and disappear once that timestamp passes.

Line and headsign filtering narrows predictions to the selected transit portion but does not establish a scheduled trip match or identify the passenger's Vehicle. The UI keeps that uncertainty explicit, including when the underlying prediction is live; stale fallback never becomes a fresh live Journey departure. Network failures retain the schedule and label any usable old predictions stale.
