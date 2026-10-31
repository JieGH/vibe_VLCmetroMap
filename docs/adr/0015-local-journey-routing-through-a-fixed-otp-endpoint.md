# 15. Scheduled Journeys use a locally operated OTP routing graph

Date: 2026-10-31

## Status

Accepted implementation direction for #156. Production hosting and current-feed operation require separate validation; a working local graph is not a hosted production service.

## Decision

Use pinned OpenTripPlanner 2.7.0, compatible with the installed Java 21, for transit scheduling and pedestrian street routing. Run it separately with a bounded heap and a loopback listener; the application exposes only a validated fixed Journey endpoint, whose upstream is configured by the operator. This extends ADR-0006's prevision-only upstream boundary specifically for Journey planning, without accepting passenger-supplied upstream URLs or changing the existing FGV proxy.

OTP consumes official, refetchable GTFS and OSM PBF inputs, kept outside version control according to ADR-0003. The adapter rejects missing/out-of-range service calendars and unavailable graphs, returns ordered scheduled Journey portions and real pedestrian geometry, and keeps live Arrival matching separate. Both web and native clients use the same normalized contract; native builds configure a reachable HTTPS application backend rather than a phone-local loopback service.

The trade-off is operating a JVM process, rebuilding graphs when feeds change, and maintaining reachable backend infrastructure. This avoids implementing a transit router from scratch, using unverified public demo availability as production infrastructure, or changing the repository licence to qualify for a hosted service. No paid hosting commitment is made by this decision.

Background Journey tracking remains governed by ADR-0014. Journey planning does not authorize city-wide EMT polling or alter the existing Arrival Memory and train-first behavior.
