# Integrating EMT València Buses into Metrovalencia: UI/UX Research, Architectural Constraints, and Design Directions

**Document Status:** Architectural Research & Design Specification  
**Author:** AI Pair Assistant (Research Subagent)  
**Date:** October 2026  
**Target Repository:** `vib_metroValencia` (React 19, Vite, MapLibre GL, Capacitor iOS/Android)  
**Scope:** Information architecture, interaction patterns, visual design systems, and data pipelines for integrating the ~60 bus lines and ~1,000 stops of the Empresa Municipal de Transports de València (EMT) into the existing live Metrovalencia transit application.

---

## 1. Executive Summary & Grounding in Current App Architecture

### 1.1 Scope and Objective
The existing application (`vib_metroValencia`) delivers real-time tracking, autonomous client-side countdowns (Arrival Memory), and high-FPS map interaction for the **Metrovalencia** railway network (Lines 1–10, comprising underground heavy rail, suburban rail, and surface tramways across ~140 stations). 

This research investigates the user experience (UI/UX) and system design required to integrate the municipal city bus system (**EMT València**: ~60 daytime and night lines, ~1,000 active stops, ~450 peak vehicles) into the existing product. The goal is to provide a unified, multimodal transit companion for València while preserving the core strengths of the current app:
1. **Instant, glanceable legibility** on both handheld mobile devices (one-handed thumb zone) and unattended ambient tablet departure boards (read at 2–3 m).
2. **Fluid, stutter-free performance** (60–120 FPS ProMotion/V-Sync display refresh rates per `docs/research/ui-smoothness.md`).
3. **Rigorous adherence to accessibility and design standards** (WCAG 2.2 AA contrast, TCRP Report 45 route legibility, Apple Human Interface Guidelines, and Material Design canonical adaptive layouts).

---

### 1.2 Grounding in the Existing Design Language & Vocabulary
All concepts and critiques in this document directly interface with the domain model established in `CONTEXT.md` and the existing UI components:

```
┌────────────────────────────────────────────────────────────────────────┐
│ TOP BAR: [☰ Menu]  [🔍 SearchBar / Direction Query]  [🌙/☀️] [💬 Help]  │
├────────────────────────────────────────────────────────────────────────┤
│ CHIP STRIP: [Àngel Guimerà] [Xàtiva] [Colón] [Benimaclet] [L3 ✕] [L5 ✕] │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                       MAP CANVAS (MapLibre GL)                         │
│                                                                        │
│    Line Polylines: Metro/tram tracks with casing & brand colours       │
│    Vehicle Markers: DOM elements with heading, pulse, and alpha        │
│    Station Dots: Circular nodes scaling dynamically with zoom          │
│                                                                        │
│    [Station Focus Node]                                                │
│      ◄───┤ ÀNGEL GUIMERÀ ├───► (Direction Groups & Next Countdowns)    │
│                                                                        │
├────────────────────────────────────────────────────────────────────────┤
│ FLOATING CONTROLS (Bottom Right):                                      │
│    [WalkBanner: "6 min walk (480m) to Xàtiva"]                         │
│    [LocateButton: Auto-locate / GPS fix]                               │
├────────────────────────────────────────────────────────────────────────┤
│ STATION PANEL / BOTTOM SHEET:                                          │
│    Docked Right (Landscape/Tablet) or Docked Bottom (Portrait/Phone)   │
│    Arrivals Table | Countdown Heat Ramp | Fresh vs Memory Badge        │
└────────────────────────────────────────────────────────────────────────┘
```

* **Information Architecture**: Map-first canvas with an overlaid SearchBar, a horizontal HubChips row, a floating StationPanel (docked bottom in portrait with drag-to-dismiss, docked right in landscape/tablet), and a dedicated ambient `/dashboard` departure board.
* **Domain Primitives**: `Line` (brand color, geometry), `Station` (geographic node), `Vehicle` (carriage moving on track geometry), `Arrival` (predicted timestamp), `Arrival Memory` (client-side countdown engine), `Position Confidence` (visual weighting of estimates), and `Dead Reckoning` (holding spent vehicles at platforms).
* **Station Focus Interaction**: Tapping a station eases the camera, expands a floating bilingual node (`focusMarkerRef`) indicating bidirectional line departures, and opens `StationPanel` displaying arrivals grouped into `Direction Groups` with accessible `Countdown Heat` styling.

---

### 1.3 The Scale Mismatch: Metro vs. Bus
Integrating city buses is not merely adding "more lines." The operational, spatial, and mechanical differences between rail transit and surface bus transit represent a fundamental scale mismatch:

| Dimension | Metrovalencia (Current) | EMT València (Bus Addition) | UX & System Impact |
| :--- | :--- | :--- | :--- |
| **Network Extent** | 10 lines (L1–L10) | ~60 lines (C1–C3, 4–99) | 6× increase in lines; impossible to assign 60 distinct saturated colors (violates TCRP 45 §3.4.2). |
| **Stop Density** | ~140 stations | ~1,000+ stops | 7× increase in nodes; rendering 1,000 DOM markers will crush MapLibre main-thread performance. |
| **Right-of-Way** | Dedicated subterranean & surface rail tracks | Mixed street traffic, bus lanes, traffic signals | Bus travel times exhibit high variance; kinematic track projection is prone to road congestion errors. |
| **Stop Geometry** | Single consolidated station node serving multiple platforms | Pairs of directional curbside poles separated by street widths (e.g. Parada 1234 vs Parada 1235) | Selecting a bus stop requires bidirectional grouping or pole-level precision. |
| **Telemetry Quality** | Structured FGV API predictions with known propagation lag (~15s) | GPS AVL pings, legacy SAE feeds, periodic stop-countdown APIs | Prone to "ghost buses," sudden headway bunching, and stale GPS reports. |
| **Fares & Ticketing** | SUMA multi-operator ticket / FGV single ticket | SUMA multi-operator ticket / EMTicket / Bonobús | Shared ticketing (SUMA) provides strong user demand for unified trip awareness. |

---

## 2. Competitive Teardowns & Industry Precedents (Primary Sources)

To establish industry best practices, we analyze ten leading commercial transit applications, national agency design systems, and the official València transit apps.

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    COMPETITIVE UX MATRIX: METRO + BUS                                     │
├───────────────────┬──────────────────────┬──────────────────────┬────────────────────┬────────────────────┤
│ Application       │ Map Density Strategy │ Bus Representation   │ Multimodal Board   │ Key Lesson         │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **Transit**       │ Line-on-demand only; │ Pulsing vehicle icon │ Unified nearby list│ "What leaves near  │
│ (transitapp)      │ map suppresses       │ on selected line;    │ sorted by walking  │ me now" trumps all │
│                   │ unselected routes    │ signal wave badge    │ distance           │ map clutter.       │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **Citymapper**    │ Polylines hidden     │ Live vehicle dots;   │ Combined transit   │ Group duplicate    │
│                   │ until line clicked;  │ ETA countdown;       │ corridors (e.g.,   │ corridors; step-   │
│                   │ grouped corridors    │ traffic delay alerts │ "Bus 19/31/32")    │ by-step "GO" mode. │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **TfL Go**        │ Simplified schematic │ Stop poles appear on │ Mode-isolated      │ Low-anxiety design;│
│ (London)          │ Tube map; bus stops  │ zoom; route ribbon   │ search; step-free  │ bus lines as point-│
│                   │ contextual only      │ strip on demand      │ accessibility hero │ to-point entities. │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **Apple Maps**    │ Consolidated transit │ Bus stop clusters    │ Entrance-level     │ Distinctive badge  │
│                   │ hub shields; lines   │ at stations; live    │ station cards;     │ shields; Live      │
│                   │ hidden until zoomed  │ vehicle along route  │ Dynamic Island     │ Activities support.│
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **Google Maps**   │ Stop pins on zoom;   │ Real-time vehicle    │ Mixed schedule tab;│ Retract live claim │
│                   │ lines draw on route  │ icons; falls back to │ stale predictions  │ after 15 min; no   │
│                   │ selection            │ static schedule      │ disappear          │ confidence fade.   │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **MTA Live Map**  │ Zoom morphing:       │ (In MYmta app): stop │ Web departures;    │ Geographic morph   │
│ (NYC / Work & Co) │ Vignelli schematic → │ countdowns & vehicle │ service disruption │ solves macro/micro │
│                   │ geographic street    │ positions            │ overlays           │ visual tension.    │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **BVG Jelbi**     │ Mobility hub icons;  │ Departures board;    │ Multimodal nearby  │ Strict modal badge │
│ (Berlin / Trafi)  │ mode toggle pill     │ live ETA by stop     │ departure stream   │ shapes (U, S, Bus).│
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **Wiener Linien** │ Trunk U-Bahn lines   │ Feeder bus lines     │ Multimodal monitor │ Rail spine acts as │
│ (WienMobil)       │ drawn; buses nested  │ grouped under hub    │ per station        │ visual anchor.     │
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **RATP Bonjour**  │ Integrated multimodal│ Real-time crowding;  │ Nearby departures  │ Crowd indicators;  │
│ (Paris)           │ network overlay      │ live vehicle track   │ list               │ unified station hub│
├───────────────────┼──────────────────────┼──────────────────────┼────────────────────┼────────────────────┤
│ **KMB / HK**      │ Extreme bus density; │ Bus occupancy levels │ Corridor point-to- │ Letter-number line │
│ (Hong Kong)       │ point-to-point       │ (empty/half/full);   │ point arrival list │ taxonomy; clear    │
│                   │ route tracing        │ ETA countdown        │                    │ terminus labels.   │
└───────────────────┴──────────────────────┴──────────────────────┴────────────────────┴────────────────────┘
```

---

### 2.1 Transit (Transit App)
*Primary Source:* [Transit Help Center: How to track departures](https://help.transitapp.com/article/445-how-to-track-departures-on-your-transit-line); [Transit Partners: Trip Updates](https://resources.transitapp.com/article/462-trip-updates).
* **Core Philosophy**: "Nearby Departures Stream." The map does not show a pre-rendered web of bus lines. When opened, the app defaults to a high-contrast list of nearby lines sorted by walking distance.
* **Line-on-Demand**: The map remains clean and muted. Only when the user taps a specific line card in the list does that line's full polyline snap onto the map, with live vehicles animating along that route alone.
* **Uncertainty Encoding**: Real-time departures are rendered in **bold with pulsating signal waves**; scheduled departures are greyed out; disrupted services are struck through. Transit **withholds predictions older than 10 minutes**, falling back to static timetables.

### 2.2 Citymapper
*Primary Source:* [Citymapper Multimodal Routing & Bus Live Features](https://citymapper.com/news/141/frequently-asked-questions); [Citymapper Design Teardowns](https://prototypr.io/post/citymapper-redesign).
* **Corridor Consolidation**: Citymapper combats line clutter by grouping parallel services that share a street trunk (e.g., showing a unified departure card for "EMT Lines 19, 32, 92" heading towards Platja de la Malva-rosa).
* **Live Vehicle Tracking**: Live buses are rendered as circular dots with direction indicators and line numbers. When a bus arrives at a stop, it visually "absorbs" into the stop circle.
* **Multimodal Turn-by-Turn ("GO")**: Step-by-step guidance bridges underground rail and street buses with micro-guidance (e.g., "Take Exit Carrer de Xàtiva, walk 40m right to Stop 1234").

### 2.3 Transport for London (TfL Go)
*Primary Source:* [TfL Go Product Design Documentation & Awards](https://www.dandad.org/awards/professional/2021/234475/tfl-go-journey-app/); [TfL Line Diagram Standard Issue 4](https://content.tfl.gov.uk/tfl-line-diagram-standard.pdf).
* **Low-Anxiety Spatial Hierarchy**: TfL operates >700 bus routes and 8,000 buses. Drawing these on the iconic Tube map was intentionally rejected. TfL Go uses a dual-layer strategy:
  1. The default map displays the rail network (Tube, DLR, Overground, Elizabeth line).
  2. Bus stops appear as subtle circular pins *only at deep pedestrian zoom*.
  3. Selecting a bus stop isolates a "Next Bus" sheet; selecting a bus line renders a temporary single-color ribbon strip.
* **Accessibility Integration**: Accessibility (step-free access) is a persistent toggle, changing the visual map hierarchy rather than hiding information in sub-menus.

### 2.4 Apple Maps & Google Maps Transit Layers
*Primary Sources:* [Apple Support: Get transit directions on iPhone](https://support.apple.com/guide/iphone/get-transit-directions-ipha44f57caa/ios); [Google Transit Partners Realtime Specification](https://support.google.com/transitpartners/answer/10104663?hl=en).
* **Apple Maps**: Uses **Station Hub Badges**. When multiple bus stops cluster around a subway station (e.g. Àngel Guimerà or Xàtiva), Apple Maps groups them into a single multimodal transit hub pin with entrance indicators. Live vehicle positions are rendered cleanly on the route polyline with bearing orientation.
* **Google Maps**: Renders bus stop markers dynamically based on viewport vector tile tiling. Bus line paths are never shown system-wide; they are drawn exclusively during route guidance or when inspecting a line. Real-time vehicle positions disappear automatically if telemetry is missing for >15 minutes.

### 2.5 MTA Live Subway Map & MYmta (Work & Co / Transit Innovation Partnership)
*Primary Source:* [MTA Launches Groundbreaking Live Subway Map](https://www.mta.info/press-release/mta-launches-groundbreaking-subway-map-creating-next-generation-map-following-iconic-hertz-and-vignelli-designs).
* **Zoom-Morphing Engine**: Work & Co solved the schematic vs. geographic dilemma by dynamically interpolating geometry based on zoom level:
  * *Low/Mid Zoom (z10–z13)*: The map displays a geometric, diagrammatic schematic (Vignelli heritage) optimizing corridor legibility and line connectivity.
  * *Deep Zoom (z14+)*: Lines smoothly morph into true geographic street alignments, revealing subway entrances, ADA elevators, and surrounding street-level bus stops.

---

### 2.6 The Official València Transit Apps: Usability Critique & Pain Points
To understand the unmet needs of local riders, we examined user feedback and technical architectures of the official **EMT Valencia - App Oficial** and **Metrovalencia** mobile apps.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   OFFICIAL APPS USABILITY DEFICITS                                      │
├────────────────────────────────────────┬────────────────────────────────────────────────────────────────┤
│ Official EMT València App              │ Official Metrovalencia (FGV) App                               │
├────────────────────────────────────────┼────────────────────────────────────────────────────────────────┤
│ ❌ "Ghost Buses": ETA displays "2 min",│ ❌ Static PDF-like map view; zero real-time train movement.    │
│    then vehicle disappears or jumps    │ ❌ Separate web views for timetables and route planning.       │
│    suddenly to 15 min.                 │ ❌ Clunky NFC card balance checks (inconsistent SUMA support). │
│ ❌ Visual Clutter: Map renders >1,000   │ ❌ No integration with surface street buses.                   │
│    tiny blue dots; tapping a specific  ├────────────────────────────────────────────────────────────────┤
│    pole on mobile is error-prone.      │ Common Cross-System Failure:                                   │
│ ❌ Search requires knowing 4-digit     │ Complete institutional silo. Even though the regional SUMA     │
│    stop codes or exact line numbers.   │ card unifies fares across Metro, Tram, Bus, and Cercanías,     │
│ ❌ Tourist/Visitor Failure: Foreign IPs│ both apps force users to switch between disconnected tools.    │
│    and roaming SIMs face geoblocking.  │ Neither app shows how to transfer between rail and bus.        │
└────────────────────────────────────────┴────────────────────────────────────────────────────────────────┘
```

* **App Store Ratings**: The official EMT Valencia app holds a rating between 1.8 and 2.2 out of 5 stars across Google Play and Apple App Store, driven by inaccurate wait predictions and interface crashes.
* **The "Ghost Bus" Epidemic**: Unlike trains on dedicated rail circuits, EMT buses run in surface traffic. Outdated automated vehicle location (SAE) systems lead to unsignaled dropouts. Riders frequently experience buses passing early or phantom vehicles counting down to 0 without appearing.
* **The Multimodal Silo**: València introduced the integrated **SUMA fare card** in January 2022, allowing seamless free transfers between Metrovalencia, EMT buses, Metrobús, and Renfe Cercanías within Zone A. However, the software ecosystems remain strictly fractured. A rider exiting Metrovalencia at *Xàtiva* has no tool that tells them which EMT bus departs outside the station entrance.

---

## 3. Core UX/UI Architectural Topics

### 3.1 Topic A: Map Density & Rendering Performance

#### The "Rainbow Spaghetti" Anti-Pattern
Drawing all ~60 bus lines simultaneously over the Metrovalencia rail lines produces an unusable visual tangle:
1. Overlapping polylines along major avenues (e.g. Carrer de Xàtiva, Carrer de Colón, Gran Via de Ferran el Catòlic, Avinguda de Blasco Ibáñez) obscure the base street map completely.
2. Distinct saturated colors cannot exceed 9 without degrading human cognitive categorization (TCRP Report 45 §3.4.2). 60 bus lines sharing colors creates false connections between unrelated routes.

#### The DOM Marker Bottleneck
The benchmark measurements in `docs/research/ui-smoothness.md` established that updating 25–50 DOM markers with MapLibre's `new Marker({ element })` costs <0.01 ms on the main thread. However:
* Instantiating **1,000+ DOM markers** for every bus stop creates severe DOM memory footprint and garbage collection pauses.
* During pinch-to-zoom gestures, recalculating CSS 3D transforms on 1,000 DOM elements causes dropped frames on mobile GPUs, violating the 120 FPS ProMotion target.

#### Architectural Solution: Layer-on-Demand + Vector Tile Symbols
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                            ZOOM PROGRESSION ARCHITECTURE                             │
├────────────────────┬─────────────────────────┬───────────────────────────────────────┤
│ Zoom Level         │ Metro / Rail Elements   │ EMT Bus Elements                      │
├────────────────────┼─────────────────────────┼───────────────────────────────────────┤
│ **z8 – z11.9**     │ Full network polylines; │ Completely hidden.                    │
│ (System Overview)  │ Major strategic hubs.   │ Zero bus overhead.                    │
├────────────────────┼─────────────────────────┼───────────────────────────────────────┤
│ **z12 – z13.9**    │ All station nodes;      │ Major Multimodal Transfer Hubs only   │
│ (City Scale)       │ Live train markers.     │ (e.g., Estació del Nord, Porta de la  │
│                    │                         │ Mar, Nou d'Octubre) as unified icons. │
├────────────────────┼─────────────────────────┼───────────────────────────────────────┤
│ **z14 – z15.9**    │ Full detail;            │ Clustered street bus stop dots        │
│ (Neighborhood)     │ Expanded focus node.    │ rendered via MapLibre GL Vector Layer │
│                    │                         │ (zero DOM markers).                   │
├────────────────────┼─────────────────────────┼───────────────────────────────────────┤
│ **z16+**           │ Full detail.            │ Directional bus stop poles; stop      │
│ (Pedestrian)       │                         │ codes; line badges; interactive tap.  │
├────────────────────┼─────────────────────────┼───────────────────────────────────────┤
│ **ANY ZOOM**       │ Always visible.         │ Selected bus line polyline is drawn   │
│ (Line Selected)    │                         │ dynamically as a single ribbon layer. │
└────────────────────┴─────────────────────────┴───────────────────────────────────────┘
```

1. **MapLibre Style Layer for Bus Stops**: Bus stops are stored in a GeoJSON vector source and rendered using MapLibre `circle` or `symbol` layers (hardware-accelerated on GPU). 
2. **Dynamic Highlighting via `feature-state`**: Hovering or selecting a stop sets `hover: true` via MapLibre feature state, changing the circle radius and outline without recreating DOM nodes.
3. **DOM Markers Reserved for Selection**: A DOM marker is created *only* for the currently focused bus stop or the 3–6 active buses on an inspected route.

---

### 3.2 Topic B: Live Bus Representation, Latency & Uncertainty ("Ghost Buses")

#### Telemetry Differences: Trains vs. Buses
* Metrovalencia trains follow a fixed **Station Chain** with calculated **Segment Intervals** via Timetable Walk (`CONTEXT.md`). Propagation lag is consistent (~15s for metro, ~10s for tram).
* EMT buses experience **road congestion, double parking, and signal priority variance**. A bus can be delayed by 4 minutes at a single intersection on *Carrer de Sant Vicent Màrtir*.

#### Visualizing Uncertainty Without Breaking WCAG 1.4.11
As documented in `docs/research/transit-ui-best-practice.md` §1.2, **fading marker opacity breaks WCAG 2.2 SC 1.4.11 Non-text Contrast** (requires 3:1 contrast against adjacent background colors). 

Furthermore, neither Google Maps, Apple Maps, nor Transit app uses a continuous opacity gradient for vehicle uncertainty. Instead, the industry uses **categorical tokens and withdrawal rules**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              LIVE VEHICLE STATUS TOKENS                                │
├───────────────────────────────┬────────────────────────────────────────────────────────┤
│ Visual Treatment              │ Operational Meaning                                    │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ **Solid Badge + Pulsing Ring**│ Fresh live GPS telemetry (<60 seconds old).            │
│ `[ 🚌 19 ]` ● (Green glow)    │ High confidence prediction.                            │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ **Dashed Outline + Asterisk** │ Extrapolated / Stale live telemetry (60–180s old).     │
│ `[ 🚌 19* ]` ◌ (Amber border) │ Darwin convention: "*" indicates uncertain prediction. │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ **Grey Monochrome Badge**     │ Scheduled timetable departure; no live GPS signal.     │
│ `[ 🚌 19 ]` (Grey #6b7280)    │ Fallback mode.                                         │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ **Struck-through + Red Tag**  │ Trip cancelled or bypassed stop.                       │
│ `[ ~19~ ] CANCELLED`          │ Clear categorical warning.                             │
├───────────────────────────────┼────────────────────────────────────────────────────────┤
│ **WITHDRAWAL (>10 minutes)**  │ Prediction removed from board and map entirely.        │
│ (Hidden)                      │ Prevents misleading "ghost bus" countdowns.            │
└───────────────────────────────┴────────────────────────────────────────────────────────┘
```

* **The 10-Minute Withdrawal Threshold**: Following Google Maps (15m) and Transit app (10m), if an EMT bus prediction fails to refresh within 10 minutes, the real-time arrival is discarded and replaced with the scheduled timetable time.

---

### 3.3 Topic C: Multimodal Departure Boards & Glanceable Surfaces

#### The "What Can I Catch Now?" Board
When a user opens the app on foot in València (e.g. at the intersection of *Carrer de Colón* and *Carrer de Russafa*), their immediate mental question is not "What is the complete topology of Line 5?", but rather:
> *"What vehicle can I board in the next 3 to 7 minutes to travel along this corridor?"*

A multimodal departure board solves this by aggregating both rail platforms and street bus stops within walking range (straight-line radius < 350 meters), sorted strictly by **time until departure (accounting for walking time)**:

```
┌───────────────────────────────────────────────────────────────────────┐
│ NEARBY DEPARTURES (Walk: <4 min)                        [Filter: ALL] │
├───────────────────────────────────────────────────────────────────────┤
│ 🚇 METRO L3       Rafelbunyol (Colón Station)              3 min walk │
│    Due in 2 min   Heat: 🔥 Due                   Platform 1 (Undergr) │
├───────────────────────────────────────────────────────────────────────┤
│ 🚌 EMT 19         La Malva-rosa (Parada 1245 - Colón)      1 min walk │
│    Due in 4 min   Heat: 🟠 4 min                 Street Pole (C/Colón)│
├───────────────────────────────────────────────────────────────────────┤
│ 🚇 METRO L9       Riba-roja de Túria (Colón Station)       3 min walk │
│    Due in 6 min   Heat: 🟡 6 min                 Platform 2 (Undergr) │
├───────────────────────────────────────────────────────────────────────┤
│ 🚌 EMT 40         Universitats (Parada 1532 - Russafa)     2 min walk │
│    Due in 7 min   Heat: 🟢 7 min                 Street Pole (C/Russ) │
└───────────────────────────────────────────────────────────────────────┘
```

#### Ambient Dashboard Mode Evolution
In the current app, `/dashboard` displays a large-type departure board rotating through key Metrovalencia stations for ambient tablets mounted on walls or shelves (`docs/design/station-focus-and-dashboard-mode.md`).
* **Multimodal Hub Extension**: For ambient tablets located in residential lobbies, hotels, or offices in València, Dashboard mode can display a **Unified Hub Departure Board**. For instance, an ambient tablet near *Plaza del Ayuntamiento* shows real-time arrivals for Metro lines at *Xàtiva* alongside key radial buses (Lines C1, 19, 70, 71).
* **Ambient Legibility Preservation**: Type sizes strictly follow DfT *Inclusive Mobility* (character height = distance / 137.5) maintaining **42–75 CSS px** for destination names at a 2-meter viewing distance.

#### Native Platform Integration: iOS Live Activities & Dynamic Island
When a rider boards an EMT bus or transfers between Metro and Bus:
1. **ActivityKit (iOS Live Activity & Dynamic Island)**: Tracks the active trip in the Lock Screen and Dynamic Island:
   * Dynamic Island Compact: `[🚇 L3: 4m] ➔ [🚌 19: 8m]`
   * Dynamic Island Expanded: Live countdown to the transfer stop (*Xàtiva*), followed by walking guidance (60m) and the real-time countdown for connecting bus Line 19.
2. **Android Ongoing Notification**: Equivalent persistent, low-power notification updating countdowns autonomously.

---

### 3.4 Topic D: Visual Grammar, Color Systems, Accessibility & i18n

#### The Red Collision: Resolving Metro Line 3 vs. EMT Corporate Red
This is the single most critical graphic design collision in the integration:
* **Metrovalencia Line 3** is officially branded as **Red (`#E2001A`)**.
* **EMT València's corporate color** is identically **Red (`#D62828` / `#E2001A`)**.
* **Countdown Heat** uses Red (`#ff6369` / `#c62828`) for "Due / Imminent" arrivals (`docs/design/station-focus-and-dashboard-mode.md` §Countdown Heat).

If EMT buses are styled with red badges or red polylines, riders will visually confuse an EMT bus with a Line 3 subway train. Furthermore, Metrovalencia already occupies 10 distinct saturated colors (Yellow, Magenta, Red, Dark Blue, Green, Purple, Orange, Cyan, Brown, Light Green).

#### Resolution: The Geometric Shape & Badge Taxonomy
Following TCRP Report 45 §3.5.1 ("Even if routes are color-coded, do not let color be the only identifier") and MTA badge practices:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               BADGE & SHIELD TAXONOMY                                  │
├────────────────────┬──────────────────┬──────────────────┬─────────────────────────────┤
│ Transit Mode       │ Geometric Shape  │ Color Application│ Example Rendering           │
├────────────────────┼──────────────────┼──────────────────┼─────────────────────────────┤
│ **Metro Heavy Rail**│ Circular Pill /  │ Official Line    │  ╭─────╮                    │
│ (Lines 1, 2, 3, 5, │ Capsule          │ Brand Fill;      │  │  3  │  (Red Pill)        │
│  7, 9)             │ (Full Radius)    │ High-contrast text│  ╰─────╯                    │
├────────────────────┼──────────────────┼──────────────────┼─────────────────────────────┤
│ **Tram Surface Rail│ Diamond / Lozenge│ Official Tram    │     ◇                       │
│ (Lines 4, 6, 8, 10)│ or Double Pill   │ Brand Fill       │   [ 4 ]  (Blue Lozenge)     │
├────────────────────┼──────────────────┼──────────────────┼─────────────────────────────┤
│ **EMT Radial Bus** │ Square / Chamfer │ Neutral Dark     │  ┌───────┐                  │
│ (e.g. Lines 19, 71)│ Rounded Box      │ fill (`#1f242d`);│  │ 🚌 19 │  (Dark badge,    │
│                    │ (4px Radius)     │ Red Top Accent Bar│  └───────┘   Red top bar)  │
├────────────────────┼──────────────────┼──────────────────┼─────────────────────────────┤
│ **EMT Circular**   │ Ring / Hollow    │ Red Border       │  ╭───────╮                  │
│ (Lines C1, C2, C3) │ Outline Shield   │ (`#E2001A`);     │  │ ◯ C1  │  (Red Ring)      │
│                    │                  │ White/Black fill │  ╰───────╯                  │
├────────────────────┼──────────────────┼──────────────────┼─────────────────────────────┤
│ **Night Lines**    │ Dark Shield with │ Indigo Fill      │  ┌───────┐                  │
│ (Corredor Nocturn) │ Moon Icon        │ (`#312e81`)      │  │ 🌙 93 │  (Indigo shield) │
│                    │                  │                  │  └───────┘                  │
└────────────────────┴──────────────────┴──────────────────┴─────────────────────────────┘
```

* **Mode Differentiation by Shape**: Metro uses **Pills/Circles**; Trams use **Lozenges/Double Rings**; Buses use **Chamfered Rectangles/Badges** with a bus pictogram.
* **Stroke Casings for Polylines**: When an EMT bus route polyline is drawn on demand, it is rendered with a 1.5px high-contrast casing (dark casing in light mode, white casing in dark mode) ensuring it clears WCAG 2.2 SC 1.4.11 (3:1 contrast against basemaps).

#### Trilingual Support (i18n) & Stop Naming Conventions
València is officially bilingual (Valencian and Spanish), with high international tourism (English required):
* **Stop Names**: Follow official municipal cartography in Valencian (*Plaça de l'Ajuntament*, *Estació del Nord*, *Pont de Fusta*, *Ciutat de les Arts i les Ciències*).
* **Direction / Headsign Prefixes**:
  * Valencian (default): `Cap a Rafelbunyol` / `Cap a La Malva-rosa`
  * Spanish: `Hacia Rafelbunyol` / `Hacia La Malva-rosa`
  * English: `Towards Rafelbunyol` / `Towards La Malva-rosa`
* **Accessibility Labels (VoiceOver / TalkBack)**:
  * Full spoken descriptions: e.g. `aria-label="EMT Bus Línia 19 cap a La Malva-rosa, arriba en 4 minuts, parada 1245 Carrer de Colón"` avoiding unexpanded abbreviations.

---

### 3.5 Topic E: Mobile Gesture Ergonomics & Sheet Mechanics

#### The Reachability Problem on Modern Phones
Modern flagship smartphones (iPhone 16 Pro Max, Samsung Galaxy Ultra) measure 6.7 to 6.9 inches diagonally. One-handed thumb reach is restricted to the **bottom 35% of the display**:
* The top search bar is out of natural thumb reach and requires two hands or shifting grip.
* The bottom sheet pattern (docked at the screen base) is ergonomically mandatory for transit interactions.

```
┌─────────────────────────────────────────────────────────────┐
│                   BOTTOM SHEET DETENTS                      │
├─────────────────┬───────────────────┬───────────────────────┤
│ Detent Level    │ Sheet Height      │ Primary Content       │
├─────────────────┼───────────────────┼───────────────────────┤
│ **Peek**        │ ~72–88 CSS px     │ Single summary line:  │
│ (Collapsed)     │                   │ Next arrival at       │
│                 │                   │ nearest stop/station. │
├─────────────────┼───────────────────┼───────────────────────┤
│ **Medium**      │ ~45% of viewport  │ Direction Groups;     │
│ (Default Half)  │ height            │ next 3–4 arrivals;    │
│                 │                   │ walk banner; filter.  │
├─────────────────┼───────────────────┼───────────────────────┤
│ **Expanded**    │ ~88% of viewport  │ Full arrivals table;  │
│ (Full Browse)   │ height            │ transfer connections; │
│                 │                   │ line frequency chart. │
└─────────────────┴───────────────────┴───────────────────────┘
```

#### Gesture Smoothness & Zero-Reconciliation Dragging
Following the findings in `docs/research/ui-smoothness.md` §Implementation Plan item 5:
* Native-like drag-to-dismiss and sheet dragging must **not** trigger React `setState` during active touch movement. Calling React re-renders on every `pointermove` (120–240 Hz touch sampling rate) drops frames on mobile devices.
* Touch handling must mutate `element.style.transform` directly via a `requestAnimationFrame` loop, committing to React state only when the gesture ends (`pointerup`).

---

## 4. Five "Think Big" Structural Design Directions

We present five structurally distinct design concepts. Each concept rethinks how buses and metro interact spatially, interactionally, and architecturally.

---

### Concept 1: "Line-on-Demand" Multimodal Canvas (Map-First Progressive Hybrid)

#### Concept Overview
The map canvas remains the undisputed hero. Metrovalencia rail lines are permanently visible as the city's structural backbone. EMT bus lines are **hidden by default** to avoid visual noise. Bus stops appear as subtle vector dots only at neighborhood zoom (z14+). 

Selecting a bus stop or searching a bus line dynamically draws that line's full route polyline as an illuminated ribbon on the map, animating the 3–5 active live buses operating on that line.

```
ASCII WIREFRAME: CONCEPT 1 (PHONE PORTRAIT & AMBIENT TABLET)

Phone Portrait (Line 19 Inspected):
┌───────────────────────────────────────┐
│ [☰]  [🔍 Search metro or bus...]  [🌙]│
├───────────────────────────────────────┤
│ [All] [🚇 Metro] [🚌 Bus]  (Mode Filter)│
│                                       │
│            MAP CANVAS                 │
│                                       │
│   ======== Metro L3 (Permanent) ===   │
│                 \                     │
│                  \ (Transfer Walk)    │
│                   * Parada 1245       │
│                  /                    │
│   ~~~~~~~~~~ EMT Line 19 (Ribbon) ~~~ │
│           [🚌 19] ➔                   │
│                                       │
│                  [🚶 Walk: 2 min]     │
│                  [ ⌖ Locate ]         │
├───────────────────────────────────────┤
│ ┌─ EMT PARADA 1245 · C/ COLÓN ──────┐ │
│ │ 🚌 19  La Malva-rosa   🔥 2 min   │ │
│ │ 🚌 40  Universitats    🟠 5 min   │ │
│ │ 🚌 92  La Fe           🟢 11 min  │ │
│ └───────────────────────────────────┘ │
└───────────────────────────────────────┘

Ambient Tablet (Station + Bus Feeder Split):
┌───────────────────────────────────┬───────────────────────────────────┐
│                                   │ XÀTIVA · MULTIMODAL HUB           │
│                                   │                                   │
│            MAP VIEW               │ 🚇 METROVALENCIA PLATFORMS        │
│                                   │ L3 Rafelbunyol            2 min   │
│   Metro Lines (L3, L5, L9)        │ L5 Marítim                4 min   │
│   plus connecting EMT Stops       │ L9 Riba-roja              7 min   │
│   within 200m radius              │                                   │
│                                   │ 🚌 STREET-LEVEL BUS STOPS (0-3m)  │
│                                   │ Parada 1002 (C/ Xàtiva):          │
│                                   │   19 La Malva-rosa        3 min   │
│                                   │   C2 Circular             6 min   │
└───────────────────────────────────┴───────────────────────────────────┘
```

* **Primary Affordance**: Map exploration first. Tapping any bus stop or typing a line number (e.g. "19" or "C1") illuminates the route.
* **What Changes in Current Metro UI**:
  * `MapView.jsx`: Adds dynamic GeoJSON vector sources for EMT stops and selected bus route ribbon. Line ribbon uses hardware-accelerated WebGL line rendering.
  * `SearchBar.jsx`: Autocomplete expands to index EMT line numbers, stop names, and 4-digit stop codes.
  * `StationPanel.jsx`: Generalizes into a unified `TransitDetailPanel` supporting both Metro stations (platforms, lines) and Bus stops (pole code, routes).
* **Pros**:
  * Eliminates map clutter completely; zero "spaghetti" effect.
  * Preserves the fast, responsive 120 FPS performance of the existing app.
  * Familiar mental model for users who love the existing map.
* **Cons**:
  * Does not give an immediate system-wide overview of bus coverage without searching or zooming.
* **Data Requirements**: GTFS static shapes for all bus lines (~12 MB compressed); live arrival prediction API per stop. Live bus vehicle positions are queried on-demand only for the active line.
* **Implementation Effort**: **Medium** (2–3 engineering sprints).

---

### Concept 2: "Nearby-First" Multimodal Departure Stream (Transit-App Paradigm)

#### Concept Overview
Inverts the app's hierarchy on handheld phones. The bottom sheet becomes the primary interface, resting at 50% screen height upon launch. It streams a real-time, proximity-sorted list of departures combining Metro and EMT, calculated from the device's GPS fix.

The top 50% map acts as an active visual companion: scrolling through the departure list automatically highlights that route and pans to its nearest boarding location.

```
ASCII WIREFRAME: CONCEPT 2 (NEARBY STREAM)

Phone Portrait (App Launch with Location Fix):
┌───────────────────────────────────────┐
│               MAP VIEW                │
│       (Pans to selected line)         │
│                                       │
│          ⌖ You are here               │
│          /            \               │
│      60m walk       180m walk         │
│        /                \             │
│    Parada 1245        Xàtiva Metro    │
├───────────────────────────────────────┤
│ ≡ NEARBY DEPARTURES (Within 300m)     │
│ [⚡ All Modes] [🚇 Metro] [🚌 Bus]    │
├───────────────────────────────────────┤
│ 🚌 19  La Malva-rosa          🔥 1 min│
│    Parada 1245 · C/ Colón (60m walk)  │
├───────────────────────────────────────┤
│ 🚇 L3  Rafelbunyol            🟠 3 min│
│    Xàtiva Station · Plat. 1 (180m walk)│
├───────────────────────────────────────┤
│ 🚌 C1  Centre Històric        🟡 5 min│
│    Parada 1005 · C/ Xàtiva (90m walk) │
├───────────────────────────────────────┤
│ 🚇 L5  Aeroport               🟢 8 min│
│    Xàtiva Station · Plat. 2 (180m walk)│
└───────────────────────────────────────┘
```

* **Primary Affordance**: Zero-tap immediate answer to "What can I take right now?".
* **What Changes in Current Metro UI**:
  * `App.jsx`: Launches bottom sheet at medium detent whenever User Location is available.
  * `StationPanel.jsx`: Replaced by a virtualized `NearbyStreamList` displaying mixed mode cards.
  * `MapView.jsx`: Camera auto-frames the user's location and nearest 3 departures.
* **Pros**:
  * Fastest possible time-to-value for daily commuters walking on the street.
  * Equalizes Metro and Bus: whichever leaves first and is closest wins.
* **Cons**:
  * Subordinates the map canvas; users who want to view the full network map must swipe the sheet down.
  * Requires immediate GPS location permission; degrades if location is denied or indoors.
* **Data Requirements**: High. Requires multi-stop batch arrival polling around the user's coordinates (within a 400m radius, fetching arrivals for 4–8 stops simultaneously).
* **Implementation Effort**: **High** (3–4 engineering sprints; needs robust geolocation fallbacks and virtualized list rendering).

---

### Concept 3: "Station-as-Multimodal-Hub" (Metro Spine with Feeder Bus Clusters)

#### Concept Overview
Metrovalencia remains the spine of the entire application. The map displays rail lines and stations exactly as it does today. However, every Metro station is elevated into a **Multimodal Hub**. 

When a user focuses on a station (e.g. *Colón*, *Àngel Guimerà*, or *Benimaclet*), the Station Focus node expands to reveal both rail platform departures AND surface street bus departures departing from stops within a 200m walking shed.

```
ASCII WIREFRAME: CONCEPT 3 (STATION FOCUS WITH BUS FEEDERS)

Phone Portrait (Àngel Guimerà Station Focused):
┌───────────────────────────────────────┐
│ [☰]   [🔍 Find station or bus...] [🌙]│
├───────────────────────────────────────┤
│                                       │
│            MAP CANVAS                 │
│                                       │
│          ╭──────────────╮             │
│   ◄──────┤ ÀNGEL GUIM.  ├──────►      │
│   L1,L2  │  (Metro Hub) │  L3,L5,L9   │
│          ╰──────┬───────╯             │
│                 │ (Dotted 80m walk)   │
│             [🚌 Stops]                │
│                                       │
├───────────────────────────────────────┤
│ ÀNGEL GUIMERÀ HUB            ● LIVE   │
│ ┌───────────────────────────────────┐ │
│ │ [🚇 Metro (5)]  [🚌 Buses (8)]     │ │
│ └───────────────────────────────────┘ │
│ STREET BUS DEPARTURES (Walk: 1-3 min):│
│ 🚌 70  La Fontsanta           2 min   │
│    Parada 128 · Gran Via Ferran       │
│ 🚌 C2  Circular               4 min   │
│    Parada 130 · Gran Via Ferran       │
│ 🚌 93  Passeig Marítim        6 min   │
│    Parada 245 · C/ Àngel Guimerà      │
└───────────────────────────────────────┘
```

* **Primary Affordance**: Station Focus. Tapping a metro station answers: *"I'm arriving here by train; how do I continue my journey by bus?"*.
* **What Changes in Current Metro UI**:
  * `StationPanel.jsx`: Gains segmented tabs `[🚇 Metro Platforms]` and `[🚌 Connecting Buses]`.
  * `MapView.jsx`: In focus mode, draws faint pedestrian walking links (dashed lines) connecting the metro station marker to its satellite street bus stops.
  * `services/stationFocus.js`: Augments the station focus data structure to join nearby bus stops from a precomputed spatial index (`data/station_bus_transfers.json`).
* **Pros**:
  * Minimal cognitive disruption: the existing metro map remains 100% familiar and clean.
  * Perfectly addresses the transfer behavior enabled by SUMA fare integration.
  * Lowest data overhead: bus arrival APIs are fetched *only* for the 1–3 stops linked to the focused metro station.
* **Cons**:
  * Does not support travelers taking purely bus-to-bus journeys outside the metro corridor.
* **Data Requirements**: Low. Pre-calculated mapping of Metro Station API IDs to nearby EMT Stop IDs.
* **Implementation Effort**: **Low-Medium** (1–2 engineering sprints).

---

### Concept 4: "Dual-Lens Mode Switcher" (Explicit Metro vs. EMT Silos with Combined Overlay)

#### Concept Overview
Provides an explicit tactile mode control at the top or bottom of the screen: `[🚇 Metro] | [🚌 Bus] | [✨ All]`. 
* In **Metro Mode**, the app behaves exactly as it does today (clean rail lines, train markers).
* In **Bus Mode**, the map transforms into a specialized bus network: the circular trunk corridors (**C1, C2, C3**) and major radial lines (e.g. 19, 92, 99) are drawn as high-contrast network lines; bus stops become first-class stations; and the Dashboard mode switches to an EMT terminal board.
* In **All Mode**, the two layers overlay with automatic progressive decluttering.

```
ASCII WIREFRAME: CONCEPT 4 (DUAL-LENS SWITCHER)

Phone Portrait (Bus Lens Activated):
┌───────────────────────────────────────┐
│ [☰]   [  🚇 Metro  |  🚌 Bus  ]   [🌙]│
├───────────────────────────────────────┤
│ [C1 Centre] [C2 Ring] [C3 Outer] [99] │
│                                       │
│          MAP CANVAS (BUS MODE)        │
│                                       │
│      ╭──────── C1 (Red Loop) ──────╮  │
│      │                             │  │
│      │   ╭──── C2 (Inner Ring) ──╮ │  │
│      │   │                       │ │  │
│      │   │     * Parada 1245     │ │  │
│      │   │    [🚌 C1] ➔          │ │  │
│      │   │                       │ │  │
│      ╰───┼───────────────────────┼─╯  │
│          ╰───────────────────────╯    │
│                                       │
│                  [ ⌖ Near Stop ]      │
├───────────────────────────────────────┤
│ EMT VALÈNCIA NETWORK                  │
│ Selected: C1 · Centre Històric        │
│ Next vehicle: 3 min (Pl. Ajuntament)  │
│ Headway: Every 6-8 minutes            │
│ 4 vehicles currently active on line   │
└───────────────────────────────────────┘
```

* **Primary Affordance**: Mode segmented control. The user explicitly decides which transport world they are navigating.
* **What Changes in Current Metro UI**:
  * Global state gains `activeMode: 'metro' | 'bus' | 'all'`.
  * `MapView.jsx` swaps visible style layers based on active mode.
  * `DashboardBoard.jsx` gains a dedicated Bus rotation mode.
* **Pros**:
  * Clean separation of concerns; zero risk of bus clutter degrading the metro experience.
  * Allows designing an EMT-optimized visual grammar without compromising metro standards.
* **Cons**:
  * Creates an artificial cognitive barrier; prevents seamless multimodal discovery.
  * Requiring the user to flip a switch defeats the purpose of an integrated transit map.
* **Data Requirements**: Medium. Requires two distinct GTFS feeds and separate arrival stores.
* **Implementation Effort**: **Medium** (2 sprints).

---

### Concept 5: "Trip & Live-Activity-First" (Commute & Dynamic Transfer Director)

#### Concept Overview
A trip-centric paradigm focused on frequent commutes and multi-leg transfers. Instead of just showing departure boards, the user pins their regular commute (e.g. *Benimaclet ➔ Ciutat de les Arts i les Ciències*). 

The app computes the multimodal handoff (e.g. Metro Line 3 to *Xàtiva*, walk 80m to Stop 1005, EMT Line 35 to destination), orchestrates live countdowns for both legs simultaneously, and pushes the live transfer journey directly to **iOS Dynamic Island & Live Activities** or **Android Ongoing Notifications**.

```
ASCII WIREFRAME: CONCEPT 5 (DYNAMIC TRANSFER DIRECTOR)

Phone Portrait (Active Multimodal Journey):
┌───────────────────────────────────────┐
│ [✕ Cancel Trip]   BENIMACLET ➔ CAC    │
├───────────────────────────────────────┤
│                                       │
│              MAP VIEW                 │
│      (Shows active journey route)     │
│                                       │
│      [Benimaclet]                     │
│           │ (L3: 6 min ride)          │
│      [Xàtiva Metro]                   │
│           : (Walk 80m · 2 min)        │
│      [Parada 1005]                    │
│           │ (Bus 35: 9 min ride)      │
│      [Ciutat Arts i Ciències]         │
│                                       │
├───────────────────────────────────────┤
│ ┌─ LIVE MULTIMODAL HANDOFF ─────────┐ │
│ │ STEP 1: Metro L3 to Xàtiva        │ │
│ │   Train departs in: 🔥 2 min      │ │
│ │                                   │ │
│ │ STEP 2: Transfer at Xàtiva        │ │
│ │   Walk 80m to Parada 1005 (2 min) │ │
│ │   Connecting Bus 35 due in: 11 min│ │
│ │   Transfer Buffer: +3 min SAFE    │ │
│ └───────────────────────────────────┘ │
│ [ 📲 Send to Lock Screen / Watch ]    │
└───────────────────────────────────────┘

Dynamic Island / Lock Screen Live Activity:
┌─────────────────────────────────────────────────────────────┐
│ 🚇 L3 in 2m ➔ 🚶 2m walk ➔ 🚌 Bus 35 in 11m (Safe +3m)      │
└─────────────────────────────────────────────────────────────┘
```

* **Primary Affordance**: Commute card / Transfer assistant.
* **What Changes in Current Metro UI**:
  * Adds an itinerary state machine tracking trip progress via geolocation triggers.
  * Adds native Capacitor plugins for iOS `ActivityKit` and Android Foreground Notifications.
* **Pros**:
  * Unrivaled utility for real-world riders navigating complex intermodal transfers.
  * Keeps the rider informed even when the phone is locked in their pocket.
* **Cons**:
  * Requires a routing / trip planning engine (A* or Raptor over combined GTFS graph).
  * High complexity; out of scope for a pure departure-board map.
* **Data Requirements**: Very High. Requires scheduled routing graph, live GTFS-RT updates, and native OS notification bridges.
* **Implementation Effort**: **Very High** (4–6 sprints).

---

## 5. Comparative Synthesis & Recommended Architecture

### 5.1 Architecture Comparison Matrix

| Evaluation Criteria | Concept 1: Line-on-Demand Map | Concept 2: Nearby Stream | Concept 3: Station Hub Feeder | Concept 4: Dual-Lens Switcher | Concept 5: Trip Director |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Map Cleanliness & Anti-Clutter** | **5 / 5** (Zero spaghetti) | **4 / 5** (Sheet covers map) | **5 / 5** (Rail backbone intact) | **4 / 5** (Separated) | **4 / 5** (Only trip path drawn) |
| **Glanceable Speed (Time-to-Value)**| **3.5 / 5** (Requires tap/search) | **5 / 5** (Instant near departures) | **4 / 5** (Instant at stations) | **2 / 5** (Manual toggle friction) | **4 / 5** (Instant for pinned trip)|
| **Mobile Thumb Ergonomics** | **4 / 5** (Bottom sheet) | **5 / 5** (Full lower half) | **4.5 / 5** (Bottom sheet dock) | **3 / 5** (Top toggle out of reach)| **4 / 5** (Card dock) |
| **Ambient Dashboard Suitability** | **3 / 5** (Map-focused) | **2 / 5** (Requires user GPS) | **5 / 5** (Multimodal station board)| **4 / 5** (Dedicated bus board) | **1 / 5** (Personal trip only) |
| **Performance (120 FPS V-Sync)** | **5 / 5** (Zero DOM marker bloat) | **4 / 5** (Virtualized list) | **5 / 5** (Minimal extra nodes) | **5 / 5** (Layer switching) | **4 / 5** (Routing computations) |
| **Engineering Effort** | **Medium** (2–3 sprints) | **High** (3–4 sprints) | **Low-Medium** (1–2 sprints) | **Medium** (2 sprints) | **Very High** (5+ sprints) |

---

### 5.2 The Recommended Synthesis: The "Multimodal Hub + Line-on-Demand" Hybrid

We recommend a phased hybrid combining the best attributes of **Concept 3 (Station Hub Feeders)**, **Concept 1 (Line-on-Demand Map)**, and **Concept 2 (Nearby Stream in Portrait)**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        RECOMMENDED HYBRID ARCHITECTURE                                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. THE EVERGREEN SPINE:                                                                │
│    Metrovalencia rail tracks remain permanently drawn with official casing.            │
│    Zero bus spaghetti by default.                                                      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. STATION-AS-HUB ENHANCEMENT (Concept 3):                                            │
│    Clicking any Metro station reveals rail departures AND linked street bus stops      │
│    within 200m in the StationPanel. Answers 80% of multimodal transfer questions.      │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. PROGRESSIVE BUS DISCLOSURE & LINE-ON-DEMAND (Concept 1):                            │
│    Bus stops fade in as neutral GPU vector dots at z14+. Tapping a bus stop or         │
│    searching a line renders that single line's ribbon and animates its live buses.     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. NEARBY PEEK IN PORTRAIT PHONE MODE (Concept 2):                                     │
│    When the phone is located via GPS and no station is selected, the bottom sheet rests │
│    in a compact "Nearby Peek" showing the 2 closest departures (Metro or Bus).         │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. AMBIENT MULTIMODAL DASHBOARD:                                                       │
│    The `/dashboard` departure board gains an option to display connecting bus feeders  │
│    alongside metro platforms for major interchange stations.                           │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 5.3 Phased Implementation Roadmap

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              PHASED ROLLOUT ROADMAP                                    │
├────────────────────────────┬───────────────────────────────────────────────────────────┤
│ Milestone                  │ Deliverables & Technical Changes                          │
├────────────────────────────┼───────────────────────────────────────────────────────────┤
│ **Phase 1: Hub Transfers** │ • Curate `data/station_bus_transfers.json` (stops <200m). │
│ (Low Effort, High Value)   │ • Implement EMT Stop Arrival REST client in services.     │
│                            │ • Enhance `StationPanel.jsx` with connecting bus section.  │
│                            │ • Add bus badge component with TCRP 45 compliant shapes.  │
├────────────────────────────┼───────────────────────────────────────────────────────────┤
│ **Phase 2: Line-on-Demand**│ • Build static EMT GTFS route extractor (`npm run build`).│
│ (Map Vector Integration)   │ • Add MapLibre vector circle layer for bus stops at z14+. │
│                            │ • Add dynamic ribbon polyline renderer for selected line. │
│                            │ • Expand `SearchBar.jsx` to index EMT lines and paradas.  │
├────────────────────────────┼───────────────────────────────────────────────────────────┤
│ **Phase 3: Nearby Stream** │ • Implement proximity aggregator for GPS user location.   │
│ (Mobile Ergonomics)        │ • Add 3-detent gesture bottom sheet (peek/half/expanded). │
│                            │ • Virtualized list rendering for nearby departures.       │
├────────────────────────────┼───────────────────────────────────────────────────────────┤
│ **Phase 4: Ambient & OS**  │ • Multimodal ambient dashboard rotation mode.             │
│ (Ecosystem Expansion)      │ • Capacitor plugin spike for iOS Dynamic Island.          │
└────────────────────────────┴───────────────────────────────────────────────────────────┘
```

---

## 6. Prototype Validation Questions & Research Agenda

To validate this design specification before writing production code, the following empirical and usability questions must be tested:

### Usability & Cognitive Questions
1. **Transfer Radius Acceptability**: Is a 200m straight-line radius around Metro stations appropriate for València, or does it include irrelevant stops on the other side of major physical barriers (e.g. crossing the Turia riverbed or railway tracks)?
2. **Badge Recognition**: Do users clearly distinguish the square chamfered bus badge `[🚌 19]` from the circular Metro Line 3 red pill `( 3 )` without confusion?
3. **Ghost Bus Toleration**: Does withholding bus predictions older than 10 minutes increase user trust compared to the official EMT app's erratic countdowns?
4. **Search Mental Model**: Do users search by destination name (*"El Saler"*), line number (*"25"*), or stop code (*"1452"*)? The search engine must weight these appropriately.

### Technical & Performance Validation Spikes
1. **MapLibre Vector Layer Benchmark**: Measure frame presentation times on a physical 120Hz iPhone and Android device with 1,200 bus stop points loaded in a GeoJSON vector layer at z14–z16. Confirm 0 dropped frames during rapid pan/zoom.
2. **EMT Open Data API Rate & CORS Spike**: Measure latency, rate limit thresholds, and CORS policies of `opendata.valencia.es` and EMT arrival endpoints. Determine whether a lightweight caching proxy (similar to the metro proxy) is needed.
3. **Memory Footprint**: Confirm that caching static shapes for ~60 bus lines in local storage or client memory does not exceed a 10 MB budget.

---

## 7. Primary Sources & Bibliography

### Standards, Design Systems & Guidelines
- W3C, [Web Content Accessibility Guidelines (WCAG) 2.2](https://www.w3.org/TR/WCAG22/) — SC 1.4.1 (Use of Color), SC 1.4.3 (Contrast Minimum), SC 1.4.11 (Non-text Contrast), SC 2.5.5/2.5.8 (Target Size).
- UK Department for Transport, [Inclusive Mobility: A Guide to Best Practice on Access to Pedestrian and Transport Infrastructure](https://assets.publishing.service.gov.uk/media/61d32bb7d3bf7f1f72b5ffd2/inclusive-mobility-a-guide-to-best-practice-on-access-to-pedestrian-and-transport-infrastructure.pdf) (2021) — §12.1–12.3, §13.1–13.4.
- Transportation Research Board (TRB), [TCRP Report 45: Passenger Information Services: A Guidebook for Transit Systems](https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_rpt_45.pdf) (1999) — §3.4–3.5 (Nine-color ceiling, shape redundancy).
- TRB, [TCRP Synthesis 48: Real-Time Bus Arrival Information Systems](https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_syn_48.pdf) (2003).
- Apple Inc., [Human Interface Guidelines: Layout, Accessibility, Dark Mode, Sheets, and Live Activities](https://developer.apple.com/design/human-interface-guidelines/).
- Google LLC, [Material Design: Canonical Adaptive Layouts & Window Size Classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/window-size-classes).

### Commercial Transit Applications & Agency Design Systems
- Transit App, [How to Track Departures on Your Transit Line](https://help.transitapp.com/article/445-how-to-track-departures-on-your-transit-line) and [Trip Updates Integration](https://resources.transitapp.com/article/462-trip-updates).
- Citymapper, [Frequently Asked Questions & Routing Features](https://citymapper.com/news/141/frequently-asked-questions).
- Transport for London, [TfL Go App Product Architecture](https://www.dandad.org/awards/professional/2021/234475/tfl-go-journey-app/) and [Line Diagram Standard Issue 4](https://content.tfl.gov.uk/tfl-line-diagram-standard.pdf).
- Metropolitan Transportation Authority (MTA / Work & Co), [MTA Launches Groundbreaking Live Subway Map](https://www.mta.info/press-release/mta-launches-groundbreaking-subway-map-creating-next-generation-map-following-iconic-hertz-and-vignelli-designs).
- Google Transit Partners, [How Data Gaps Affect Realtime Feeds](https://support.google.com/transitpartners/answer/10104663?hl=en).
- MobilityData, [GTFS-realtime Reference Specification](https://gtfs.org/documentation/realtime/reference/).

### Local Transit Agency Data Sources (València)
- Ajuntament de València, [Portal de Dades Obertes: Google Transit EMT Valencia](https://opendata.valencia.es/).
- Autoritat del Transport Metropolità de València (ATMV), [Integración Tarifaria SUMA](https://atmv.gva.es/).
- Empresa Municipal de Transports de València (EMT), [Red de Líneas y Estimación de Tiempos](https://www.emtvalencia.es/).
- Ferrocarrils de la Generalitat Valenciana (FGV), [Metrovalencia Información de Líneas y Horarios](https://www.metrovalencia.es/).
