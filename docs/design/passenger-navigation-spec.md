# Address and landmark search with live passenger navigation

Status: interview decisions and testing approach approved; implementation pending.

## Problem Statement

Passengers can search transit Lines, Stations, and EMT Bus Stops, but cannot enter an address or a landmark such as a university library and receive a complete Journey there. Understanding which services to board, where to transfer, and when to get off currently requires the passenger to assemble information themselves. A moving map and Vehicle Arrivals do not establish the passenger's Journey Progress, especially underground or with a locked phone.

## Solution

Extend the existing search with typo-tolerant address and landmark autocomplete across metropolitan Valencia. Let the passenger select a specific Destination, preview it on the map, request Directions, choose a complete walking/transit Journey, and explicitly start guidance. Show live Arrivals where available, progress through Stations and EMT Bus Stops, transfers, and get-off alerts. Preserve the current transit cards and map UX.

Native guidance must support a locked phone during an explicitly started Journey. The website remains the reference for the shared interface; OS integrations supply native capabilities. Distinguish scheduled, live, stale, and estimated information, and retain useful Journey instructions when connectivity or User Location is unavailable.

## User Stories

1. As a passenger, I want to enter a street address, so that I can travel to a place beyond a transit Station.
2. As a passenger, I want to search a named landmark such as a university library, so that I do not need its exact street address.
3. As a passenger, I want suggestions while typing, so that I can find a Destination without entering its full name.
4. As a passenger, I want typo-tolerant and accent-insensitive search, so that minor spelling differences do not prevent discovery.
5. As a passenger, I want Stations, EMT Bus Stops, and transit Lines to remain searchable, so that the existing search remains useful.
6. As a passenger, I want address and landmark results across metropolitan Valencia, so that surrounding transit-served towns are included.
7. As a passenger, I want ambiguous results to show names, addresses, and distances when User Location is available, so that I can choose the intended place.
8. As a passenger, I want to select a Destination explicitly, so that the app does not silently choose the wrong library or campus.
9. As a passenger, I want a selected place shown as a map pin with a Directions action, so that I can verify it before planning.
10. As a passenger, I want User Location to be the default Starting Point, so that planning a Journey requires fewer steps.
11. As a passenger, I want to edit the Starting Point, so that I can plan from another place or without location permission.
12. As a passenger, I want a complete Journey covering walking, metro, tram, EMT buses, and transfers, so that I can reach the Destination door to door.
13. As a passenger, I want up to three useful alternatives, so that I can compare Journeys without an overwhelming list.
14. As a passenger, I want fastest arrival ranked first, so that the default recommendation prioritizes reaching my Destination soonest.
15. As a passenger, I want less-walking and fewer-transfer alternatives where available, so that I can choose a Journey suited to me.
16. As a passenger, I want total time, walking distance, and transfers shown for each alternative, so that I can compare its demands.
17. As a passenger, I want a default limit of 15 minutes per walking portion, so that ordinary suggestions avoid unexpectedly long walks.
18. As a passenger, I want an explanation and explicit longer-walk options when no Journey meets that limit, so that the app does not silently relax it.
19. As a passenger, I want live and scheduled departure information distinguished, so that I understand what supports a recommendation.
20. As a passenger, I want guidance to start only when I choose Start journey, so that searching or previewing does not begin active tracking.
21. As a passenger, I want current Journey Progress and upcoming Stations or EMT Bus Stops, so that I know where I am in my trip.
22. As a passenger, I want walking and transfer instructions, so that I understand how to move between transit portions and my Destination.
23. As a passenger, I want a notification and vibration one Station or EMT Bus Stop before alighting, so that I can prepare to get off.
24. As a passenger, I want optional alert sound, so that I can choose whether guidance is audible.
25. As a native-app passenger, I want active guidance and alerts with my phone locked, so that I do not need to keep the screen on.
26. As a passenger, I want estimated underground progress labeled clearly, so that uncertainty is not presented as confirmed location.
27. As a passenger, I want an I'm on board confirmation and a way to correct the current Station or EMT Bus Stop, so that I can keep guidance aligned with reality.
28. As a passenger, I want get-off alerts based on uncertain progress labeled as estimated, so that I can judge their reliability.
29. As a passenger, I want Find another route after a missed connection or overshot alighting point, so that I can recover my Journey.
30. As a passenger, I want to confirm a replacement Journey, so that the app does not silently change my travel plan.
31. As an offline passenger, I want my selected Journey and saved instructions retained, so that a connection loss does not erase guidance.
32. As a passenger, I want stale Arrivals and connectivity-dependent actions identified, so that old data does not appear current.
33. As a returning passenger, I want a Resume journey offer for an unfinished Journey, so that I can choose whether to continue it.
34. As a passenger resuming guidance, I want location and Arrivals refreshed when possible, so that continuation uses current information.
35. As a passenger, I want accessibility marked unknown when evidence is missing, so that I am not promised unverified step-free access.
36. As a passenger, I want Journey tracking to stop on completion or cancellation, so that location collection is limited to active navigation.
37. As an existing user, I want transit cards, map selection, and familiar navigation behavior preserved, so that the feature fits the calibrated interface.

## Implementation Decisions

### Search and Destination selection

- Extend existing transit search and selection behavior with address and landmark result types. Keep the existing transit callbacks and selection semantics compatible.
- Use one coherent search experience. Choosing a transit Line retains its existing inspection behavior; it does not become a geographic Destination automatically.
- Address and landmark suggestions must support partial queries, typo tolerance, and accent differences. Validate actual Valencia addresses, library names, and misspellings before committing to a provider.
- Ambiguous matches require passenger selection. Show distance only when a usable User Location is available; absence of location must not block manual planning.
- Destination selection shows a map pin and Directions. Directions opens alternatives; only Start journey begins active guidance.

### Journey planning

- Introduce a Journey-planning boundary accepting a Starting Point and Destination and returning complete alternatives with walking/transit portions, transfers, total duration, walking distance, and departure provenance.
- Default to User Location while supporting an explicitly selected Starting Point.
- Return up to three distinct useful alternatives, fastest arrival first, with less-walking and fewer-transfer choices where valid. Do not fabricate extra alternatives when fewer are available.
- Apply a default maximum of 15 minutes to each walking portion. Explain when no qualifying Journey exists and require explicit passenger selection of a longer-walk alternative.
- Use complete, current rail and EMT service calendars, ordered calls, transfer connections, and a pedestrian street graph. Existing station points, segment intervals, and the expired single-Line timetable are insufficient.
- Validate pedestrian routing rather than substituting straight-line distance as a walking instruction. The existing transit Spawn Radius continues to govern nearby-transit discovery; it is not a replacement for Journey routing.
- Distinguish scheduled departures from live Arrivals and stale information. Validate matching between a scheduled transit portion and live predictions; the existing EMT feed does not establish GTFS trip or Vehicle identity.

### Journey Progress and recovery

- Provide an application-level Journey interface through which the UI starts, observes, corrects, resumes, replans, and ends a Journey. Keep provider-specific search/routing details behind service boundaries.
- Journey Progress includes the current portion, upcoming Stations or EMT Bus Stops, transfers, and alighting points.
- Offer I'm on board and correction controls. Do not infer confirmed passenger boarding or location solely from a moving Vehicle marker.
- Clearly label progress estimated when underground location is unavailable. Keep confirmed User Location distinct from Vehicle Position Uncertainty.
- A missed connection or overshot alighting point leads to a visible update-needed condition and Find another route. Replacement remains subject to passenger confirmation. Detection must respect uncertainty rather than claim certainty from unavailable signals.
- Persist the chosen Journey and instructions for offline access and an unfinished-Journey resume offer. Attempt to refresh User Location and Arrivals before resuming guidance; if unavailable, retain the explicit offline/stale distinction.

### Alerts and native lifecycle

- Notify and vibrate one Station or EMT Bus Stop before each transit portion's alighting point; sound is optional. Alerts based on uncertain progress identify that progress as estimated.
- Additional platform integration is required for locked-phone guidance; the existing geolocation plugin is insufficient by itself. Validate delivery, permissions, and lifecycle on physical iOS and Android devices.
- ADR-0014 amends ADR-0012 only during explicitly started Journeys. Start active Journey tracking through Start journey or an explicitly confirmed resume, and end it on completion or cancellation. Ordinary map viewing remains foreground-only and battery-adaptive.
- Request necessary OS capabilities in context. Permission denial must not prevent manual Journey planning or imply unavailable tracking/alerts are active.
- Preserve one shared website-led UI. OS code supplies location, notifications, and other necessary native lifecycle integration; the website must not promise continuous GPS guidance when hidden or locked.

### Services, Rate Budget, and UX constraints

- Free service accounts and a routing backend are approved in principle. Select providers only after coverage, typo-quality, quota, operational, attribution, and licence checks.
- Paid service/hosting commitments and any repository licence change require a separate user decision. Public demo availability must not be assumed adequate for production.
- Public Nominatim cannot supply autocomplete under its public-service policy. Transitous is not usable under the repository's current licence. Self-hosting or another compatible service requires engineering evaluation.
- Preserve ADR-0011: no network-wide EMT polling, 20-second in-memory cache, in-flight deduplication, and Train-First Asynchronous Loading in existing transit views. An active Journey does not authorize fetching the city's stops in the background.
- Preserve the calibrated map and transit cards. Do not introduce replacement layouts, tabs, or platform skins. Keep production and prototype working trees isolated.

## Testing Decisions

The user approved testing the complete search → route selection → Journey Progress flow through the app with controlled search, routing, and location responses, plus physical-device validation of locked-phone alerts.

- Prefer one highest-level application Journey seam. Supply deterministic external responses and time/location events at existing service boundaries; assert passenger-visible behavior rather than internal functions, private state, or snapshots mirroring implementation.
- Cover finding an address and a named landmark, partial and misspelled queries, ambiguity selection, map preview, editable Starting Point, route comparison, explicit start, progress, correction, recovery, and completion/cancellation.
- Cover the 15-minute walking limit, unavailable alternatives, explicit longer-walk selection, expired calendars, unavailable services, denied location/notification permissions, connection loss, stale Arrivals, and offline/resume behavior.
- Cover scheduled-versus-live presentation and uncertain live-trip matches. Test that estimated Vehicle movement cannot be treated as confirmed passenger boarding.
- With controlled progress and time, verify the one-call-before-alighting alert, optional sound, uncertainty labeling, and tracking cleanup. Device tests must verify actual notification/vibration delivery and locked-screen operation rather than equating mocked calls with OS delivery.
- Reuse prior art in existing search-result/selection tests, search accessibility tests, injected-provider live-tracking tests, clock-controlled arrival/cache tests, and app interaction tests. Retain keyboard selection and existing transit behavior.
- Validate representative mixed rail/EMT transfers and pedestrian connections against refreshed feed data and real Valencia examples. Check date-bound service and no-service conditions.
- Check existing bus fetch caching, deduplication, and on-demand behavior through observable requests, including no network-wide polling during guidance.
- Required handoff checks: full tests and lint; production build with iOS and Capacitor Sync; signed APK build; install with data preserved if an Android device is connected. Physical iOS guidance is validated through Xcode Run on the user's device. Passing unit tests or building an APK does not establish that native guidance works on a device.

## Out of Scope

- Automatic replacement of a Journey without passenger confirmation.
- Background tracking during ordinary map viewing, or guaranteed continuous locked-phone tracking on the website.
- City-wide EMT arrival polling, guaranteed Vehicle identity from fleet coordinates, or confirmed underground location inferred only from timetable movement.
- Guaranteed step-free Journeys without verified accessibility evidence.
- Driving/cycling navigation, additional transit operators, and geographic expansion beyond the agreed metropolitan metro/tram/EMT scope.
- New platform-specific themes, replacement transit-card layouts, or changes to the prototype worktree.
- Unapproved service purchases, paid hosting commitments, or repository licence changes.
- Fully offline new-address search or new Journey calculation; offline scope is retention of the selected Journey and instructions.

## Further Notes

- This spec synthesizes approved interview recommendations Q1–Q16 and the subsequently approved test seam. It does not claim implementation is complete.
- On inspection, the navigation implementation branch initially matched main and contained transit search and foreground tracking rather than passenger navigation. Recheck current source before implementing.
- Provider selection, fresh feed validation, live-trip matching, pedestrian routing, and native lifecycle integration are explicit implementation dependencies. Resolve them within the approved constraints; surface any material product change or necessary spending before committing to it.
- Development should keep search, planning, guidance, and native validation reviewable independently, while acceptance is the complete Journey flow described above.
