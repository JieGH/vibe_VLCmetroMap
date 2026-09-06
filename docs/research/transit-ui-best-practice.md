# Transit UI best practice: primary-source research

Scope: what established transit products and standards actually do, for the two target contexts of this app — **(a) ambient tablet**, read at 1–3 m with no interaction, and **(b) phone**, one-handed at a Station.

Vocabulary follows `CONTEXT.md`: Line, Station, Vehicle, Arrival, Timetable Walk, Simulated Train, Position Confidence, Position Uncertainty, Dead Reckoning, Network Sync.

Every claim below is tied to the document that owns it. Secondary sources are labelled inline. Arithmetic I did myself is labelled **[derived]**.

---

## 1. Findings that should change a design decision here

**1.1 Nobody ships a confidence gradient. The established practice is a binary live/scheduled distinction plus withdrawal.**
Transit app renders live Arrivals bold with two pulsating "waves" and scheduled ones in grey, and *drops to scheduled times entirely* once the `TripUpdate` header is older than 10 minutes ([Transit Partners, Trip Updates](https://resources.transitapp.com/article/462-trip-updates)). Google Maps makes the realtime UI elements *disappear* and falls back to static schedule when a feed goes stale — `VehiclePositions` messages are stale after 15 minutes, at which point "the position of the vehicle and any predictions for arrival or departure time will disappear from Google Maps" ([Google Transit Partners, How data gaps affect realtime feeds](https://support.google.com/transitpartners/answer/10104663?hl=en)). London Buses removed a route from the Countdown sign entirely when AVL performance dropped below 65%, and required 80% before restoring it, showing an explicit "route currently not available" message in the interim ([TCRP Synthesis 48, p. 19](https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_syn_48.pdf)). GTFS-realtime *does* define a per-prediction `uncertainty` field, and it is optional and widely unset ([GTFS-realtime reference](https://gtfs.org/documentation/realtime/reference/)).

So this app's continuous Position Confidence ramp (1.0 → 0.45, with Dead Reckoning floored at 0.35) is doing something the industry does not do. That is defensible — the industry mostly has GPS and this app has a Timetable Walk — but it means there is no borrowed convention to lean on, and two consequences follow:

- **Add a categorical cue alongside the continuous one.** The one production system that ships a genuine "this prediction is shaky" marker is UK National Rail: Darwin/LDBWS times "may have an asterisk (`*`) appended to indicate that the value is 'uncertain'", and estimated times may be replaced by the literal strings `On time`, `Delayed`, `Cancelled`, `No report`, which "should be output in the user interface exactly as supplied" ([OpenLDBWS documentation](https://lite.realtime.nationalrail.co.uk/openldbws/)). A discrete token — an asterisk, a `~`, a dashed ring — survives being seen at 3 m in a way that a 0.45-vs-0.62 opacity difference does not.
- **Consider a withdrawal threshold, not just a floor.** Both Google and Transit define a staleness point past which the live claim is retracted rather than weakened. This app has no such point: a Dead Reckoning Vehicle is drawn forever at 0.35. The RDG code of practice makes the same call for station screens — "it may be necessary to show only trains that are running", and station facility owners "should document their policy for the suppression of non-critical messages" ([RDG/ATOC Approved Code of Practice, Provision of Customer Information, p. 7](https://www.chilternrailways.co.uk/sites/default/files/files/timetables/Approved_code_of_practice_%20provision_of_customer_information_0.pdf)).

**1.2 Opacity as the sole carrier of confidence breaks a WCAG requirement.**
SC 1.4.11 Non-text Contrast (AA) requires 3:1 against adjacent colours for "graphical objects" — "parts of graphics required to understand the content" ([Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)). A Vehicle marker faded to 0.35 over a map ground will not clear 3:1 against most basemaps. The "essential" exception covers presentations essential to the information (logos, photographs, heat maps); a *chosen* opacity encoding is not that. Keep the marker's outline/casing at full contrast and carry confidence in fill, dash, or a badge instead of in overall alpha.

**1.3 Line colour alone is not a valid Line identifier, and there is a transit-specific source that says so.**
TCRP Report 45 §3.5.1: "Even if routes are color-coded, do not let the color of the route be the only identifier." It also caps useful colour coding — "the number of colors should be kept at or below nine … more than nine different colors will not 'buy' more help in searching for or identifying routes" — and recommends line *patterns* alongside colour, with adjacent routes given different colours ([TCRP Report 45, 1999, §3.4.2, §3.5.1](https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_rpt_45.pdf)). Metrovalencia is right at that nine-colour ceiling. Practical resolution used across the industry (NYC route bullets, TfL line names): the **brand colour stays on the Line stroke**, and identity is carried by a labelled badge whose *text* meets 4.5:1 against the badge fill. That decouples the untouchable brand colour from the contrast obligation.

**1.4 For the ambient tablet, type has to be far larger than a normal web layout.**
DfT *Inclusive Mobility* (the UK government accessibility guide, 2021) states for information displays: "character height should be equal to the distance between the viewer and the screen, divided by 137.5. Thus, if viewed from 2 metres, character height should be approximately 14.5mm" ([Inclusive Mobility, §12.3](https://assets.publishing.service.gov.uk/media/61d32bb7d3bf7f1f72b5ffd2/inclusive-mobility-a-guide-to-best-practice-on-access-to-pedestrian-and-transport-infrastructure.pdf)). TCRP 45 specifies map and sign character sizes as visual angle: 1/4 degree (15 arcmin, 0.00436 rad) for wall-mounted maps, 1/12 degree (5 arcmin) being the bare 20/20 threshold. Apple's tvOS body text is 29 pt at @1x with viewing "often 8 feet or more". **[derived]** those three land at roughly 25, 15 and 14 arcmin respectively; on a 264 ppi tablet (132 CSS px per inch) that is **≈ 43–75 CSS px of type at 2 m and ≈ 65–110 CSS px at 3 m**. Section 5 shows the working. Whatever the ambient view is now, it is almost certainly several times too small.

**1.5 Countdown and clock time are not interchangeable; the split tracks headway, not preference.**
High-frequency urban services publish countdowns (TfL Countdown supplies "the predicted time until a bus or river bus is expected to arrive", limited to the next 30 minutes and refreshed every 30 seconds — [TfL Live Bus & River Bus Arrivals API documentation §2.1](https://content.tfl.gov.uk/tfl-live-bus-river-bus-arrivals-api-documentation.pdf)). Timetabled national rail publishes scheduled clock time *and* an expected time as separate fields (`std`/`etd`/`atd`, `sta`/`eta`/`ata` — [OpenLDBWS](https://lite.realtime.nationalrail.co.uk/openldbws/)). Metrovalencia sits closer to the first. Recommendation: countdown as the primary figure on both surfaces; clock time as a secondary line where the Arrival is far enough out that a countdown is meaningless.

**1.6 The map-pin exception applies to Vehicle markers, but not to the Arrivals list.**
WCAG 2.2 SC 2.5.8 Target Size (Minimum, AA) requires 24×24 CSS px, and the Understanding document names this exact case: "in digital maps, the position of pins is analogous to the position of places shown on the map … It is essential to show the pins at the correct map location, therefore the Essential exception applies" ([Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)). Station and Vehicle markers are covered. Arrivals rows, search results, filter chips and the sheet's controls are not — those need 24×24 CSS px minimum, and 44×44 pt is Apple's default control size on iOS/iPadOS.

**1.7 Real-time information is worth roughly a third of the perceived wait.**
Fan, Guthrie & Levinson found a 10-minute wait at an unamenitied stop is perceived as 21 minutes, and that benches, shelters and realtime departure information together bring that to about 13 ([Perception of Waiting Time at Transit Stops and Stations, 2015](https://nacto.org/wp-content/uploads/1_Fan-et-al-Perception-of-Waiting-Time-at-Transit-Stops-and-Stations_2015.pdf)). London's Countdown evaluation recorded perceived waiting dropping from 11.9 to 8.6 minutes ([TCRP Synthesis 48, p. 19](https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_syn_48.pdf)); Dziekan & Kottenhoff report ~20% reductions ([Transportation Research Part A 41(6):489–501, 2007](https://www.sciencedirect.com/science/article/abs/pii/S0965856406001431)). This is the argument for the countdown being the largest thing on the phone screen at a Station.

---

## 2. What established products put on screen

### Real-time vs scheduled: the industry-standard encoding

| Product | Live indication | Scheduled / degraded |
|---|---|---|
| Transit app | Bold time + two pulsating "waves"; Vehicle icon drawn on the map | Time greyed out. Skipped stops struck through and marked "Skips this stop"; cancelled struck through and marked "Cancelled"; "Likely cancelled" when realtime is missing but analysis suggests cancellation ([help.transitapp.com](https://help.transitapp.com/article/445-how-to-track-departures-on-your-transit-line)) |
| Google Maps | Unspecified "UI elements to indicate to the user that arrival and departure times are being updated in realtime" | Those elements disappear; static schedule shown; vehicle marker and predictions removed ([Transit Partners](https://support.google.com/transitpartners/answer/10104663?hl=en)) |
| National Rail (Darwin/LDBWS) | `etd`/`eta` estimated time, shown next to the scheduled `std`/`sta` | `atd`/`ata` once actual; `*` suffix for "uncertain"; literal `On time`, `Delayed`, `Cancelled`, `No report` ([OpenLDBWS](https://lite.realtime.nationalrail.co.uk/openldbws/)) |
| Citymapper | Live departures; buses animated on the map | "Automatically switch to showing you scheduled departures" when live data or the connection is unavailable ([Citymapper FAQ](https://citymapper.com/news/141/frequently-asked-questions)) |
| Apple Maps | "live departure times, arrival times, the current location of a bus or train en route" ([Apple Support, Get transit directions](https://support.apple.com/guide/iphone/get-transit-directions-ipha44f57caa/ios)) | Not documented in the support guide |
| MTA Live Subway Map | Trains animated along the Line; "users will see trains moving that help signal to users that the map is live" ([MTA press release](https://www.mta.info/press-release/mta-launches-groundbreaking-subway-map-creating-next-generation-map-following-iconic-hertz-and-vignelli-designs)) | Not documented |

Note the second column: the industry's degraded state is *categorical and named* ("Cancelled", "No report", "Likely cancelled", greyed), not a continuous fade. Transit app also caps the horizon — realtime shown only for departures within the next 90 minutes in the main view, and predictions beyond 4.5 hours are withheld as unreliable ([Trip Updates](https://resources.transitapp.com/article/462-trip-updates)).

### Prediction horizons and refresh, for comparison with Network Sync

- **TfL Countdown**: arrivals for the next **30 minutes**, source refreshed every **30 seconds**; the documentation explicitly says requesting more often than that is unnecessary ([TfL API doc §2.1](https://content.tfl.gov.uk/tfl-live-bus-river-bus-arrivals-api-documentation.pdf)).
- **Google**: TripUpdates feed discarded after **1 hour** without a header timestamp update; VehiclePositions messages stale at **15 minutes**; a warning is raised if the feed is not updated within 15 minutes ([Transit Partners](https://support.google.com/transitpartners/answer/10104663?hl=en)).
- **Transit app**: TripUpdates dropped and schedule restored if the protobuf header is older than **10 minutes**.

This app's Arrivals age out after ~18 minutes with a 2-minute Network Sync, which sits inside the envelope those products use — but none of them keeps drawing a Vehicle after its data has expired, which is what Dead Reckoning does.

### Physical departure-board conventions

- **UK CIS**: scheduled time is the service's identity and is always shown; the live layer is an *expected* time or a status word. Darwin's schema enforces this by giving scheduled, estimated and actual separate fields. RDG's code of practice makes accuracy of CIS a station-facility-owner priority and permits showing only the trains that are running during heavy disruption.
- **Rotating/scrolling fields**: DfT requires each item of information (destination, platform) to be displayed for a **minimum of 2 seconds**; horizontal scrolling must not exceed **6 characters per second**; and "advertising messages and displays should not appear on the same screen as important travel information" ([Inclusive Mobility §12.3](https://assets.publishing.service.gov.uk/media/61d32bb7d3bf7f1f72b5ffd2/inclusive-mobility-a-guide-to-best-practice-on-access-to-pedestrian-and-transport-infrastructure.pdf)). Directly applicable if the ambient view ever cycles Lines or Stations.
- **Swiss (SBB)**: the SBB design system's Clock component is for "wherever the exact time needs to be communicated", typically "real-time information on public transport", minimum **75×75 px**, one per view, with at least 20% of its diameter as margin ([digital.sbb.ch — Clock](https://digital.sbb.ch/en/design-system/lyne/components/clock/)). SBB's public departure boards are published as station-by-station PDFs ([SBB departure posters](https://www.sbb.ch/en/travel-information/rail-traffic-information/departure-posters.html)); I did not find an SBB or ÖBB document stating a countdown-vs-clock rule.

---

## 3. Showing uncertainty and degraded confidence

**Is there established practice?** Partially. There is a data-model convention and a withdrawal convention; there is almost no visual gradient convention.

1. **Data model.** GTFS-realtime `StopTimeEvent.uncertainty` exists: "If uncertainty is omitted, it is interpreted as unknown. To specify a completely certain prediction, set its uncertainty to 0." `StopTimeUpdate.schedule_relationship` carries `SCHEDULED | SKIPPED | NO_DATA | UNSCHEDULED`, and `NO_DATA` is the explicit "fall back to the static schedule here" signal ([GTFS-realtime reference](https://gtfs.org/documentation/realtime/reference/)). The field is optional, and Transit app's own integration documentation does not mention consuming it.
2. **Withdrawal.** Google, Transit and London Buses all define a point at which the live claim is retracted (§1.1). This is the strongest and most consistent pattern in the material.
3. **Visual gradient.** The only mainstream instance found is Darwin's `*` "uncertain" suffix — a discrete flag, not a gradient. No agency or vendor document found describes fading, blurring, or a confidence radius on a vehicle marker.
4. **Suppression as policy.** RDG requires operators to document a suppression policy and a "disruption mode" for when message integrity becomes poor.

**Implications for this app.** The Simulated Train convention (hollow + dashed) matches the categorical style the industry uses and should be the model for the rest: prefer *shape and stroke* changes over alpha. Dead Reckoning, which `CONTEXT.md` correctly separates as a different claim rather than a fainter one, deserves a categorical mark of its own — the `*` precedent is directly transferable. Reserve the continuous Position Confidence ramp for something a reader is never asked to decode, e.g. the size of an uncertainty halo, and keep the marker's own contrast fixed (§1.2).

---

## 4. Countdown vs clock time

**Practice.** Countdown for turn-up-and-go; clock time for timetabled services. TfL Countdown is a pure countdown, capped at 30 minutes. Darwin publishes clock times only and never a countdown. TCRP Synthesis 48 records that the most prevalent information on at-stop dynamic message signs is "current time and date, route number and final destination of the vehicle, waiting time (either in countdown format or time range)".

**Research.** I found no study that directly compares a countdown against a clock time for the same real-time display. What exists:

- Countdown displays reduce *perceived* wait time — ~20% (Dziekan & Kottenhoff 2007); 11.9 → 8.6 minutes in London (TCRP 48); a 10-minute wait perceived as 21 minutes with no amenities, ~13 with realtime signs plus bench and shelter (Fan et al. 2015).
- On **format**, TCRP Report 45 §4.5 summarises experimental work on printed timetables: "Full hour and minute presentation of departure times produced better performance" (beating phrasings like "6:06 every 12 minutes until 7:06"), and "Twelve-hour clock times (2:15 a.m., 3:05 p.m.) were more usable than 24-hour times (0215, 1505)". Caveat clearly: this is US-context, printed-timetable research from 1999. Spain uses 24-hour time conventionally; do not port the 12-hour finding.
- Accuracy context for a countdown's credibility: London's Countdown evaluation measured accuracy "within plus or minus one minute 50% of the time; within plus or minus two minutes 75% of the time and within plus or minus five minutes for 96% of the time" (TCRP 48, p. 19). A displayed countdown was considered fit for public display at that accuracy.

**"Due" / "approaching".** I could not find a primary source stating a threshold. TfL's own Live Bus Arrivals API documentation defines `timeToStation` in seconds but does not define a "Due" rendering rule. Developers on TfL's own tech forum report using **< 30 s → "Due"**, 30–59 s → "1 min" ([TfL Tech Forum thread](https://techforum.tfl.gov.uk/t/what-is-the-logic-to-show-due-or-1-min-for-arrivals/2042)) — **this is a community forum post, not TfL guidance; treat as secondary.**

There is an internal argument for a "due"/"approaching" band regardless of external precedent: the GTFS Feed states every time to a whole minute, so each Segment Interval already carries ±30 s (`CONTEXT.md`, Position Uncertainty). Rendering "0 min" or a seconds countdown claims a precision the Timetable Walk does not have.

---

## 5. Colour and contrast

### The normative numbers

| Requirement | Ratio | Applies to |
|---|---|---|
| WCAG 2.2 SC 1.4.3 Contrast (Minimum), AA | **4.5:1** | Text and images of text |
| — large-scale text | **3:1** | "at least 18 point or 14 point bold" (≈24px and ≈18.5px per the Understanding doc's 1pt = 1.333px conversion) |
| WCAG 2.2 SC 1.4.11 Non-text Contrast, AA | **3:1** | UI components and their states; graphical objects required to understand the content |
| Apple HIG, Dark Mode | **4.5:1** minimum, **7:1** target for custom colours, "especially in small text" | Both appearances |

Sources: [Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [Apple HIG — Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode). Note 1.4.11 is not rounded: 2.999:1 fails.

Apple's own accessibility page reproduces the WCAG AA table (≤17 pt any weight → 4.5:1; 18 pt → 3:1; bold at any size → 3:1) and names both WCAG and APCA as "two popular standards of measure", advising a higher-contrast scheme when Increase Contrast is on ([Apple HIG — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)). **WCAG 2.x remains the only normative one**: WCAG 3.0 is still a W3C Working Draft — "It is inappropriate to cite this document as other than a work in progress" — and does not name APCA ([WCAG 3.0 Working Draft](https://www.w3.org/TR/wcag-3.0/)). Do not resolve a line-colour contrast failure by switching to APCA and declaring it passed.

### Official line colours that fail contrast: the accepted resolution

There is no standards document that says "brand line colours are exempt". What the sources actually give you is three separate moves:

1. **Move the contrast obligation off the brand colour and onto a label.** 1.4.3 exempts "text that is part of a logo or brand name" from any contrast requirement, but that exemption does not extend to a coloured stroke used to distinguish Lines. What does work is putting the Line identity into a badge — the badge fill can be the brand colour, and the *character on it* must clear 4.5:1 against that fill. MTA's practice is exactly this: coloured route bullets with a letter/number, and for the redesigned map "a black subway bullet with a white character to provide maximum contrast" where legibility demanded it (MTA press coverage of the 2025 map redesign; the MTA press release page returned 403 to automated fetch, so **this specific claim is from search-result summaries of MTA material and should be verified against the release directly before being relied on**).
2. **Give the stroke a casing so the 3:1 boundary requirement is met against both grounds.** 1.4.11 asks for 3:1 "against adjacent color(s)". A Line stroke that fails against a light basemap and a dark one can be given a contrasting outline/halo, which changes the adjacent colour without changing the brand colour.
3. **Add non-colour redundancy.** TCRP 45 §3.5.1 (§1.3 above) is the transit-specific rule; WCAG SC 1.4.1 Use of Color is the general one — "Color is not used as the only visual means of conveying information, indicating an action, prompting a response, or distinguishing a visual element" ([Understanding 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)). Apple: "Convey information with more than color alone … Offer visual indicators, like distinct shapes or icons, in addition to color." TCRP 45 additionally recommends **line patterns** in conjunction with colour, and arranging colours so adjacent routes differ.

### Colour rules specific to transit displays

- DfT: "Account must also be taken of colour deficiencies — a red/green combination should be avoided, for example", and "text and colours should adjust depending on the environment's ambient lighting" (Inclusive Mobility §12.3).
- TCRP 45 §3.4.2.2 recommends saturated colours for route coding (red, green, yellow, blue, orange, brown, purple, light blue, black), avoiding pastels, and says "If color is used to distinguish route lines on a map, it is best to minimize the use of color elsewhere on the map — 'decorative' color will compete with and distract from the 'informative' color."

### A genuine conflict in the sources: polarity

- **TCRP Report 45 §3.3**: "Never use 'reverse polarity' (light lines and letters on a dark background) for either printed materials or for route and timetable information. Such presentation results in poorer and slower reading for many people, especially under low lighting conditions." Contrast for signs and publications "should be at least 70 percent (i.e., always dark letters against a lighter background)."
- **DfT Inclusive Mobility §12.1**, for touchscreens and electronic displays: "white or yellow type or pictograms on a black or dark background is ideal." §13.3, for printed/etched signs: "Apart from signs that are internally lit, dark text on a light background is preferable."
- **Wear OS** requires the opposite for always-on: keep ~85% of the screen black (§7).

The reconciliation the two DfT clauses imply: **dark-on-light for reflective/printed surfaces, light-on-dark for emissive ones.** Both target contexts here are emissive, so light-on-dark is defensible — but TCRP 45 is a dissenting primary source and its objection (low-light legibility for readers with poor vision) is a real one, so the light theme must remain first-class and genuinely tested rather than an afterthought.

---

## 6. Type size and legibility at distance (ambient tablet)

### The three primary anchors

| Source | Rule | At 2 m | At 3 m |
|---|---|---|---|
| DfT *Inclusive Mobility* §12.3 (information displays) | character height = distance ÷ 137.5 | 14.5 mm (stated in the source) | 21.8 mm **[derived]** |
| DfT *Inclusive Mobility* §13.1 (signs) | letter height ≥ 1% of reading distance, **minimum 22 mm** | 22 mm (the floor binds) | 30 mm **[derived]** |
| TCRP 45 §3.2.2 (wall-mounted maps) | subtend 1/4 degree = 15 arcmin = 0.00436 rad | 8.7 mm **[derived]** | 13.1 mm **[derived]** |
| TCRP 45 §3.2.2 (20/20 threshold, not a target) | 1/12 degree = 5 arcmin = 0.00145 rad | 2.9 mm **[derived]** | 4.4 mm **[derived]** |
| Apple HIG (tvOS) | Body 29 pt @1x (72 ppi) = 10.2 mm em, viewed at "8 feet or more" | — | — |

**[derived]** The tvOS body em subtends 10.2 mm / 2438 mm ≈ **14.4 arcmin** at 8 ft (cap height ≈ 10 arcmin). DfT's 14.5 mm at 2 m is ≈ **25 arcmin**. TCRP's map spec is **15 arcmin**. So the credible band for the ambient view is roughly **14–25 arcmin**, with the low end being Apple's general-population TV scale and the high end DfT's accessible-signage scale.

**[derived] Converting to CSS px.** A 264 ppi tablet at 2× renders 132 CSS px per inch, so 1 CSS px ≈ 0.192 mm.

| Viewing distance | 14 arcmin (Apple TV-grade) | 25 arcmin (DfT-grade) |
|---|---|---|
| 1 m | ~21 CSS px | ~38 CSS px |
| 2 m | ~42 CSS px | ~75 CSS px |
| 3 m | ~64 CSS px | ~113 CSS px |

Caveats to state plainly: these are *character height*, and whether DfT means cap height or em box is not specified in the document; if it means cap height, multiply the CSS px figures by roughly 1.3–1.4 to get a `font-size`. And the CSS px figures assume 132 CSS px/inch — recompute for the actual panel.

### Supporting guidance

- **Apple minimum text sizes** (default / minimum): iOS & iPadOS **17 pt / 11 pt**; tvOS **29 pt / 23 pt**; macOS 13/10; visionOS 17/12; watchOS 16/12 ([Apple HIG — Typography](https://developer.apple.com/design/human-interface-guidelines/typography)).
- **Weight**: "In general, avoid light font weights … prefer Regular, Medium, Semibold, or Bold … avoid Ultralight, Thin, and Light" (Apple HIG Typography). If a custom font with a thin weight is used, "aim for larger than the recommended sizes".
- **Typeface**: sans serif, mixed case. DfT §13.2: "a sans serif font will be the most accessible … mixed case lettering provides the most accessible form of text … it is often possible to recognise a word from its 'shape'". TCRP 45 §3.1 agrees for signs and short labels, and notes serif is easier for long blocks of body text.
- **tvOS safe area** — relevant as a general "keep content off the edges" rule for a far-viewed display: "Inset primary content 60 points from the top and bottom of the screen, and 80 points from the sides. It can be difficult for people to see content that close to the edges" ([Apple HIG — Layout](https://developer.apple.com/design/human-interface-guidelines/layout)).
- **Viewing angle**: DfT §13.4 gives optimum viewing angles for wall-mounted signs as ±30° vertical from eye level and up to 20° either side of perpendicular. A propped tablet read from a sofa is often outside that; tilt matters as much as type size.
- **Illumination**: DfT §13.3 specifies signs be "well and evenly lit … between 100 and 300 lux", and matt not reflective. The analogue for a tablet is: match panel brightness to the room, and avoid glossy full-bleed white panels.
- **Legibility index, for cross-checking**: the US Access Board's VMS research reports legibility indices "on the order of 35 ft/in" for average older and younger observers, dropping to 22 ft/in (85th percentile younger) and 17 ft/in (85th percentile older), and approximately 3 ft/in for legally blind observers ([US Access Board — VMS Legibility](https://www.access-board.gov/research/communication/variable-message-signing/vms-legibility/)). 35 ft/in **[derived]** ≈ 8.2 arcmin, i.e. *less demanding* than any of the transit-signage numbers above — it is a highway-driver metric and should not be used to justify smaller type here.

---

## 7. Touch target sizing

| Source | Number | Notes |
|---|---|---|
| WCAG 2.2 SC **2.5.8** Target Size (Minimum), **AA** | **24×24 CSS px** | Exceptions: Spacing (a 24 px diameter circle centred on each undersized target's bounding box must not intersect another target or another such circle), Equivalent, Inline, User Agent Control, **Essential** — which the Understanding doc applies explicitly to map pins |
| WCAG 2.2 SC **2.5.5** Target Size (Enhanced), **AAA** | **44×44 CSS px** | Exceptions: Equivalent, Inline, User Agent Control, Essential |
| Apple HIG (iOS/iPadOS) | **44×44 pt** default, **28×28 pt** minimum | tvOS 66×66 / 56×56; visionOS 60×60 / 28×28; watchOS 44×44 / 28×28; macOS 28×28 / 20×20 |
| Apple HIG spacing | **~12 pt** padding around bezelled elements; **~24 pt** around unbezelled elements | "Consider spacing between controls as important as size" |
| Android / Material accessibility | **48 dp** width and height | "approximately 9mm physically", within a recommended 7–10 mm range |

Sources: [Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Understanding 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html), [Apple HIG — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Android accessibility help](https://support.google.com/accessibility/android/answer/7101858).

**Where they differ**: 24 (WCAG AA) < 44 (Apple default, WCAG AAA) < 48 (Material). Apple's *minimum* of 28×28 pt is below Material's 48 dp and above WCAG's 24 px. The safe reading for a cross-platform web app on the phone surface: **44 CSS px for anything routinely tapped one-handed on the move**, 24 CSS px as the floor for dense secondary controls, and the Spacing exception used deliberately rather than accidentally.

**Do not use the map-pin exception as cover for the sheet.** It covers Station and Vehicle markers whose *position* is the information. It does not cover the Arrivals list rows, the Line filter, or the search field.

---

## 8. Dark mode, always-on and burn-in

- **Apple, OLED**: "Image persistence is temporary and disappears after a few minutes of normal use." Burn-in "can occur in more extreme cases such as when the same high-contrast image is continuously displayed at high brightness for prolonged periods of time." Apple's three recommendations: use auto-brightness; "Avoid displaying static images at maximum brightness for long periods of time"; set a short Auto-Lock ([Apple Support HT202025 / 109039](https://support.apple.com/en-us/109039)).
- **Wear OS ambient** (the most concrete always-on numbers available from a platform vendor): "only 15% of pixels are illuminated in ambient mode"; "Well designed ambient displays contain only essential information, and they minimize the number of pixels that are illuminated" ([Ambient mode requirements](https://developer.android.com/training/wearables/wff/ambient)). When `isBurnInProtectionRequired`: "periodically shift UI elements slightly" and "avoid solid white areas"; keep at least 85% of the screen black; ambient updates occur approximately once per minute ([Always-on apps and system ambient mode](https://developer.android.com/training/wearables/always-on)).
- **Apple, Dark Mode policy**: "Avoid offering an app-specific appearance setting … they may think your app is broken because it doesn't respond to their systemwide appearance choice." But: "In rare cases, consider using only a dark appearance in the interface … for an app that supports immersive media viewing." An ambient wall-display mode is the closest analogue to that exception; a mode toggle is more defensible than a theme toggle. Also: "Soften the color of white backgrounds … consider slightly darkening the image to prevent the background from glowing in the surrounding Dark Mode context." ([Apple HIG — Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode))

**Applied here.** The burn-in risk in this app is not the moving Vehicles — it is the *static* chrome: a header bar, a Line legend, fixed Station labels, a persistent Arrivals panel, and any large light-coloured surface. Concretely: dark ground with no large solid-white panels; drift the static chrome by a pixel or two on a slow cycle; reduce brightness in the ambient mode; and consider a slow pan or periodic re-centre so nothing sits on the same pixels for hours. None of these is stated by a vendor for tablets specifically — the 15% / 85% figures are watch-face requirements — so treat them as directional, not as a spec.

---

## 9. Map-plus-list layout across tablet and phone

### Breakpoints (Android/Material, the only vendor that publishes exact numbers)

Width: **compact < 600 dp**, **medium 600–839 dp**, **expanded 840–1199 dp**, **large 1200–1599 dp**, **extra-large ≥ 1600 dp**. Height: **compact < 480 dp**, **medium 480–899 dp**, **expanded ≥ 900 dp**. Guidance: "Most apps can build an adaptive UI by considering only the width window size class", but check height for landscape phones where width is medium and height compact, "making two-pane layouts impractical" ([Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/window-size-classes)).

### Canonical patterns

- **List-detail**: expanded width shows both panes; medium and compact show one or the other ([Canonical layouts](https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts)).
- **Supporting pane**: expanded width → side by side at a recommended **70% main / 30% supporting**; medium → **50/50** if the content adapts; compact → the supporting content goes below the main content or into a **bottom sheet**, reachable via a control. This is the better fit for a map-plus-Arrivals layout, since the Arrivals list is only meaningful in relation to the map's selected Station.
- **Sheet detents (iOS)**: "The system defines two detents: large is the height of a fully expanded sheet and medium is about half of the fully expanded height." Sheets automatically support large; adding medium lets it rest at both. "Consider supporting the medium detent to allow progressive disclosure of the sheet's content" ([Apple HIG — Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)). A grabber indicates resizability.

### When the map should yield

Apple's rule is conservative: "As someone resizes a window, defer switching to a compact view for as long as possible. Design for a full-screen view first, and only switch to a compact view when a version of the full layout no longer fits … For more complex layouts such as split views, prefer hiding tertiary columns such as inspectors as the view narrows." Also "Make essential information easy to find by giving it sufficient space … don't obscure it by crowding it with nonessential details", and "Place items to convey their relative importance. People often start by viewing items in reading order … so it generally works well to place the most important items near the top and leading side" ([Apple HIG — Layout](https://developer.apple.com/design/human-interface-guidelines/layout)).

**Applied here.** Tablet (expanded width, no interaction expected): map plus a persistent Arrivals panel at roughly 70/30, everything sized per §6, no sheet, no chrome that only pays off when tapped. Phone (compact width): map full-bleed with the Arrivals list in a bottom sheet resting at the medium detent, so the countdown for the selected Station is legible without any interaction and the map yields only when the reader pulls the sheet up. The map should not disappear on the phone: it is what tells the reader *which* Vehicle the countdown belongs to.

---

## 10. Gaps and unanswered questions

Things asked about where I could not find a primary source, stated rather than papered over.

1. **No primary source compares countdown against clock time experimentally** for a real-time display. The format research I found (TCRP 45 §4.5) is about printed timetables, from 1999, and US-context. The countdown-vs-clock split I describe in §1.5 is inferred from what agencies ship, not from a document stating the rule.
2. **No primary source for a "due"/"approaching" threshold.** TfL's own API documentation defines `timeToStation` in seconds and says nothing about rendering. The 30-second figure circulating is from TfL's developer forum, i.e. community, not agency guidance.
3. **No agency or vendor document describes a graded visual confidence encoding** for a predicted vehicle position — no fading, no error ellipse, no confidence radius. Darwin's `*` is the closest thing found and it is binary. If this app's Position Confidence ramp is a novel encoding, it is novel, and should be user-tested rather than assumed legible.
4. **TfL design standards are less useful than expected.** The published Colour Standard and Line Diagram Standard (Issue 4) are brand and drafting specifications — Pantone/NCS values, Johnston typography, line thicknesses, interchange circle geometry. Neither contains accessibility contrast requirements or colour-blindness guidance. TfL's accessibility material lives on `madeby.tfl.gov.uk`, which is a first-party blog rather than a standard.
5. **The MTA route-bullet contrast claim in §5 is unverified.** `mta.info` returned HTTP 403 to automated fetch; the "black bullet with white character" detail comes from search-result summaries of MTA material. Verify against the press release before citing it.
6. **No SBB or ÖBB primary document found** stating layout or countdown conventions for departure boards. The SBB design system documents a Clock component but not a departure table's time format. Their boards are published as per-station PDFs, which are artefacts rather than guidance.
7. **ISO 9241-303** (named by DfT as a key standard for electronic displays) and **ISO 80416-4**, **BS 8300** and **DIN 32975** are all paywalled; I could not read them, so no number from them is quoted here. The widely repeated "DIN 32975 requires contrast ≥ 0.4" figure appears only in secondary German accessibility sites (nullbarriere.de) in what I could reach, and is **not** cited above.
8. **The FTA Real-time Transit Information Assessment** (rosap.ntl.bts.gov/view/dot/3302) blocked automated download; not consulted.
9. **Apple publishes no burn-in guidance for iPadOS apps** — only the general OLED support article and Wear OS's watch-specific 15%/85% figures. The always-on tablet recommendations in §8 are extrapolated and labelled as such.
10. **Transit app and Citymapper documentation is vendor help-centre and blog material.** It is first-party and therefore usable, but it is marketing-adjacent and describes behaviour rather than committing to it; none of it is a design standard.
11. **No source found on how a transit map should behave when it is never touched for hours** — idle states, attract loops, whether to keep animating. The Inclusive Mobility 2-second-per-item and 6-characters-per-second rules are the nearest applicable constraints.

---

## Sources

### Standards and accessibility guidance
- W3C, [Understanding SC 1.4.1 Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)
- W3C, [Understanding SC 1.4.3 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
- W3C, [Understanding SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
- W3C, [Understanding SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html)
- W3C, [Understanding SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- W3C, [WCAG 3.0 Working Draft](https://www.w3.org/TR/wcag-3.0/)

### Platform design systems
- Apple, [Human Interface Guidelines — Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- Apple, [HIG — Typography](https://developer.apple.com/design/human-interface-guidelines/typography)
- Apple, [HIG — Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- Apple, [HIG — Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)
- Apple, [HIG — Sheets](https://developer.apple.com/design/human-interface-guidelines/sheets)
- Apple, [HIG — Designing for tvOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-tvos)
- Apple, [About the Super Retina and Super Retina XDR display on your iPhone](https://support.apple.com/en-us/109039)
- Android, [Window size classes](https://developer.android.com/develop/ui/compose/layouts/adaptive/window-size-classes)
- Android, [Canonical layouts](https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts)
- Android, [Save power using ambient mode requirements](https://developer.android.com/training/wearables/wff/ambient)
- Android, [Always-on apps and system ambient mode](https://developer.android.com/training/wearables/always-on)
- Google, [Android accessibility help — touch target size](https://support.google.com/accessibility/android/answer/7101858)

### Agency standards and government guidance
- UK Department for Transport, [Inclusive Mobility: A Guide to Best Practice on Access to Pedestrian and Transport Infrastructure (2021)](https://assets.publishing.service.gov.uk/media/61d32bb7d3bf7f1f72b5ffd2/inclusive-mobility-a-guide-to-best-practice-on-access-to-pedestrian-and-transport-infrastructure.pdf) — §12.1, §12.3, §13.1–13.4
- Rail Delivery Group / ATOC, [Approved Code of Practice — Provision of Customer Information](https://www.chilternrailways.co.uk/sites/default/files/files/timetables/Approved_code_of_practice_%20provision_of_customer_information_0.pdf) (hosted by Chiltern Railways)
- Transport for London, [Live Bus & River Bus Arrivals API Interface Documentation v2.1](https://content.tfl.gov.uk/tfl-live-bus-river-bus-arrivals-api-documentation.pdf)
- Transport for London, [Colour Standard](https://content.tfl.gov.uk/tfl-colour-standard.pdf) and [Line Diagram Standard Issue 4](https://content.tfl.gov.uk/tfl-line-diagram-standard.pdf) — brand/drafting only, no accessibility content
- National Rail Enquiries, [OpenLDBWS (Live Departure Boards Web Service) documentation](https://lite.realtime.nationalrail.co.uk/openldbws/)
- US Access Board, [Variable Message Signing — VMS Legibility Standards and Research](https://www.access-board.gov/research/communication/variable-message-signing/vms-legibility/)
- MTA, [MTA Launches Groundbreaking Live Subway Map](https://www.mta.info/press-release/mta-launches-groundbreaking-subway-map-creating-next-generation-map-following-iconic-hertz-and-vignelli-designs)
- SBB, [Design System — Clock component](https://digital.sbb.ch/en/design-system/lyne/components/clock/); [Departure boards & network maps](https://www.sbb.ch/en/travel-information/rail-traffic-information/departure-posters.html)

### Research
- TRB, [TCRP Report 45: Passenger Information Services: A Guidebook for Transit Systems (1999)](https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_rpt_45.pdf) — §3.1–3.5, §4.5
- TRB, [TCRP Synthesis 48: Real-Time Bus Arrival Information Systems (2003)](https://onlinepubs.trb.org/onlinepubs/tcrp/tcrp_syn_48.pdf)
- Fan, Guthrie & Levinson, [Perception of Waiting Time at Transit Stops and Stations (2015)](https://nacto.org/wp-content/uploads/1_Fan-et-al-Perception-of-Waiting-Time-at-Transit-Stops-and-Stations_2015.pdf)
- Dziekan & Kottenhoff, [Dynamic at-stop real-time information displays for public transport: effects on customers, Transportation Research Part A 41(6):489–501 (2007)](https://www.sciencedirect.com/science/article/abs/pii/S0965856406001431) — abstract only; full text paywalled

### Vendor documentation (first-party, help-centre/blog grade)
- MobilityData, [GTFS-realtime reference](https://gtfs.org/documentation/realtime/reference/)
- Google, [Transit Partners — How data gaps affect realtime feeds](https://support.google.com/transitpartners/answer/10104663?hl=en)
- Transit, [How to track departures on your transit line](https://help.transitapp.com/article/445-how-to-track-departures-on-your-transit-line)
- Transit Partners, [Trip Updates](https://resources.transitapp.com/article/462-trip-updates)
- Citymapper, [Frequently Asked Questions](https://citymapper.com/news/141/frequently-asked-questions)
- Apple, [Get transit directions in Maps on iPhone](https://support.apple.com/guide/iphone/get-transit-directions-ipha44f57caa/ios)

### Secondary — explicitly flagged, not relied on
- TfL Tech Forum, ["What is the logic to show 'Due' or '1 min' for arrivals"](https://techforum.tfl.gov.uk/t/what-is-the-logic-to-show-due-or-1-min-for-arrivals/2042) — community developer discussion, not TfL guidance
