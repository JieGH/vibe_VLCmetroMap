# Local scheduled Journey routing

The application Journey API adapts a fixed operator-configured OTP endpoint. It does not calculate transit trips from marker positions or approximate walking with straight lines. The initial graph supports Metrovalencia metro/tram; EMT schedule inclusion is a separate slice.

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
OTP_URL=http://127.0.0.1:8801/otp/gtfs/v1 npm run serve
```

The root application's integration supplies the fixed `POST /api/journeys` route. Development uses its configured navigation backend proxy; the OTP GraphQL listener itself is not intended as a public API. For native or separately hosted clients, `VITE_NAVIGATION_API_URL` is the reachable application backend origin, shared with place search. A phone cannot reach the developer computer using the phone's own `127.0.0.1`. Use an appropriately configured HTTPS endpoint and allowed origins; do not embed service secrets in Vite variables.

Choosing a route sends the Starting Point and Destination coordinates to the application routing backend; explain that use in the product's contextual location copy. OTP remains a local backend component rather than an arbitrary internet relay.

## Health and real Journey probe

With OTP running:

```sh
node scripts/navigation/otp.mjs probe
```

This plans Àngel Guimerà → Benimaclet at the current time through the same normalization adapter used by the API. It writes the complete result to `probe.json`, prints a short summary, and exits nonzero unless at least one transit Journey is returned. This is an explicit live diagnostic, not part of ordinary automated tests and not a background polling loop.

The API uses named longitude/latitude coordinate pairs and an ISO departure time including timezone. Responses contain `status`, `generatedAt`, and normalized `journeys`; Journey and leg timestamps are Unix milliseconds. Leg modes are `WALK`, `METRO`, or `TRAM` initially, with scheduled provenance, route/headsign, boarding/alighting places, intermediate call times, and GeoJSON LineString geometry. Accessibility is `unknown` until verified separately.

The adapter has a two-request upstream cap, a 12-second deadline, a 2 MB response limit, and no passenger-provided upstream URL. Client requests have a 15-second deadline and support cancellation. Missing configuration returns `routing-unavailable`; an out-of-range service calendar returns `calendar-expired`; a valid date with no connection returns an empty `no-route` result. These conditions must remain visible rather than falling back to invented transit or walking paths.

## Initial verification record

On 2026-10-31, the pinned JVM built a real rail/street graph with a 3 GB heap cap: 949,343 vertices, 2,484,494 edges, and 144 transit stops. An actual normalized Àngel Guimerà → Benimaclet Journey returned WALK → METRO → WALK, including Xàtiva, Colón, Alameda, and Facultats - Manuel Broseta intermediate calls and OSM walking geometry. The real adapter also returned `calendar-expired` for May 2027 and `no-route` for an out-of-area Destination.

That initial graph used the explicitly identified **2026-09-02 rail export**, whose calendar covers **2026-09-02 through 2026-12-27**. The first fresh-download attempt timed out after 180 seconds and left an invalid partial archive; this partial archive was not used for the graph. This demonstrates in-range scheduled routing, not freshness of the latest official timetable or production/native network reachability. Refresh feeds and rebuild before claiming those operational criteria.

Automated adapter/client tests use controlled OTP and HTTP responses; they do not replace the real graph probe. Locked-phone navigation, actual notification delivery, and live Arrival matching are outside this rail-planning verification.
