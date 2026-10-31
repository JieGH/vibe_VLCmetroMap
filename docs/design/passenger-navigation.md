# Passenger navigation

Design agreed through the interview, 2026-10-31. This records approved behavior, not implemented functionality.

## Agreed scope

- Extend the existing search to street addresses, named landmarks, Stations, and EMT Bus Stops across metropolitan Valencia, with suggestions while typing and typo tolerance. Show place names and addresses to distinguish similar results.
- Plan complete Journeys with walking, metro, tram, EMT buses, and transfers. Default the Starting Point to User Location and allow it to be edited.
- Selecting a place shows its map pin and a Directions action. Directions opens route choices; navigation begins only through an explicit Start journey action. Preserve the existing transit cards and calibrated map interface.
- Show up to three alternatives, with total time, walking distance, transfers, and clearly distinguished live and scheduled departures. Rank fastest arrival first, default to a maximum of 15 minutes per walking portion, and offer less-walking and fewer-transfer alternatives.
- Provide live Arrivals, Journey Progress, and get-off alerts. After a missed connection or overshooting an alighting point, show that the Journey needs updating and offer Find another route. The passenger confirms any replacement Journey; automatic replacement is outside the initial scope.
- Get-off alerts use a notification and vibration one Station or EMT Bus Stop before alighting, with optional sound. Alerts based on uncertain underground progress must say they are estimated.
- Free service accounts for address search and a backend for Journey planning are acceptable. Research free options first, validate coverage and quotas, and surface hosting costs before making any paid commitment. No particular provider, purchase, or licence change has been approved.
- During an explicitly started native Journey, support tracking and alerts with the phone locked. See ADR-0014; background tracking remains unimplemented.
- When underground location is unavailable, label progress as estimated. Provide an I'm on board confirmation and a way to correct the current Station. Vehicle movement alone is not confirmed passenger location.
- For ambiguous landmarks, show matching names, addresses, and distances and require selection before planning a Journey.
- If location permission is denied, allow a manually entered Starting Point. Offline, retain the selected Journey and saved instructions, mark stale Arrivals clearly, and explain when search or route updates require connectivity.
- When reopening the app with an unfinished Journey, offer Resume journey and refresh location and Arrivals before continuing guidance. If a refresh cannot complete, retain the offline distinction rather than implying fresh data.
- If no Journey meets the walking limit, explain this and offer longer-walk alternatives explicitly. Label accessibility as unknown when evidence is missing; do not promise step-free access without verified data.

## Existing implementation

The branch `feature/navigation-implementation` was inspected at `d7e05f5`, then also the tip of `main`. Existing search covers local transit data and existing location tracking is foreground-only. Address and landmark search, passenger route planning, Journey Progress, and background navigation still need implementation. Existing fuzzy matching is not general spelling correction.

## Implementation dependencies

- Select and validate providers within the agreed free-account and backend constraints. Check Valencia address/landmark quality, typo tolerance, quotas, attribution, and licence compatibility.
- Refresh and validate complete rail and EMT service calendars, pedestrian connections, and transfer routing.
- Validate live Arrival matching without treating uncertain matches as confirmed passenger or Vehicle identity.
- Implement and validate native tracking and notification lifecycles; website suspension cannot provide continuous locked-phone tracking.
- Bring any necessary spending or material change to the agreed behavior back to the user before committing to it.

The user approved each recommendation through Q16, including free service accounts and a routing backend. The design interview is complete; the dependencies above are engineering validation work, not implemented features. Record resolved vocabulary in CONTEXT.md and architectural trade-offs in ADRs.
