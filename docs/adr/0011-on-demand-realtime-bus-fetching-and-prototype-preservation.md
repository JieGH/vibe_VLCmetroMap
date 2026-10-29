# 11. On-demand real-time bus fetching and prototype UX preservation

Date: 2026-10-26

## Status

Accepted.

## Context

During October 2026, multimodal transit features were developed across two repositories:
1. **Production repository:** `/Users/peterab/Documents/GitHub/vib_metroValencia` (branch `main`).
2. **Prototype worktree:** `/Users/peterab/Documents/GitHub/vib_bus_prototype` (branch `prototype/bus-roadmap`).

In `vib_bus_prototype`, the user iteratively fine-tuned a multimodal transit UX (running at `http://localhost:5174/?variant=A`), culminating in commit `465201e`:
- **Clean Metro Card:** Metro stations display rail arrivals only, avoiding cluttered tab interfaces or invasive mixed lists.
- **Dedicated EMT Board:** Bus stops open a dedicated `BusStopBoard` formatted for surface transit.
- **Walk Radius Transit Spawn:** Dropping a pin or tapping GPS spawns Metro stations within 450 metres and EMT bus stops within 300 metres (`WALK_RADIUS_METRO_METRES`, `WALK_RADIUS_BUS_METRES`; was 320 m / 280 m, before that one 225 m / 3-minute radius, before that 5 minutes / 375 m, #119) ("Where you're at" hub).
- **Refined Map Bubbles:** Two-row square-ish bubbles, 2-column stacked layout for stops serving more than 2 lines, with transport logos and numeric stop IDs removed from floating bubbles to avoid map clutter.
- **Selected Highlight:** Yellow rim highlight on chosen station/stop.

When asked to connect real-time bus arrival APIs, a prior LLM agent inadvertently modified working tree files across both repositories, introducing unauthorized new tab controls and altering the user's fine-tuned UX.

Concurrently, deep research on EMT València's data feeds confirmed:
- EMT manages 1,155 stops (8× more than Metrovalencia). Continuous network-wide polling would trigger firewall rate limits and drain mobile batteries.
- EMT's open SAE endpoint (`https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=getSAE&parada={stopCode}`) provides real-time arrival countdowns, but inspects the HTTP `User-Agent`. Standard browser user-agents receive live XML data, while generic scrapers (`curl`) receive decoy errors.
- Real-time fleet positions for all city buses are broadcast via municipal ArcGIS Layer 384 (`Seguimiento_EMT`) in a single query (~130ms), meaning Kinematic Timetable Walks (ADR-0001) are unnecessary for buses.

## Decision

1. **Preserve Fine-Tuned UX Benchmark:**
   The UX established at commit `465201e` (`http://localhost:5174/?variant=A`) is the strict benchmark. Agents must never unilaterally redesign layouts, inject tabs, or alter the station sheet structure. Real-time data must plug cleanly into existing presentation slots (`BusStopBoard`, `ConnectingBusSection`).

2. **Strict Repository Boundaries:**
   Keep the production repository (`vib_metroValencia`) and prototype repository (`vib_bus_prototype`) strictly isolated. Never perform bulk file copies or cross-repo overwrites that pollute working trees.

3. **On-Demand Bus Fetching Only:**
   Never poll the entire 1,155-stop EMT network. Arrivals are fetched strictly on demand when a user selects a stop, inspects a station with bus connections, or drops a pin within the spawn radius (bus stops 300 m).

4. **Browser User-Agent Required:**
   All web, native app (Capacitor), and LAN proxy calls to EMT SAE must present a valid browser `User-Agent` string to avoid the municipal anti-scraping decoy.

5. **Train-First, Then Bus (Asynchronous UI):**
   Metro arrivals must render immediately (0ms) from client Arrival Memory. Connecting EMT bus predictions fetch in the background and pop in smoothly once received.

6. **Client Caching & Deduplication:**
   Live arrival predictions are cached in-memory with a 20-second TTL (`EMT_CACHE_TTL_MS = 20000`). Concurrent requests for the same stop share a single in-flight promise.

## Consequences

- The user's fine-tuned Variant A UX remains protected from unintended AI redesigns.
- Device battery, mobile data, and municipal server load are protected by the on-demand policy.
- Future LLM agents have explicit instructions on the repository split, the API architecture, and the user's UX expectations.

## Follow-up (#109): visible stops only

A locate or a 45 m tracking anchor used to fetch every feeder stop in range (about 34 `getSAE` requests in the centre). `ConnectingBusSection` now fetches only the nearest `FEEDER_FETCH_BATCH` (8) stops (`src/services/feederArrivalFetch.js`) and widens the batch by 8 when a sentinel after the last card scrolls into view. Nothing fetches while the bus list is not shown (metro-only tab) or the page is hidden. Stops still fresh in the 20 s cache cost no request, so an anchor refresh with an overlapping set fetches only new stops. Budget: at most 8 EMT requests per locate or anchor in a dense area, typically fewer.

## Update

The `?variant=A` address above is the prototype worktree's. Production no longer has a variant switch: Variant A is its only UI, and the B/C layouts, mode toggle and walking box were removed (commit `3599c8d`). The preservation rule is unchanged.
