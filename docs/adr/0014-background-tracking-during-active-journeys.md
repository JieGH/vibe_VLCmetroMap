# 14. Background tracking is scoped to explicitly started Journeys

Date: 2026-10-31

## Status

Accepted design; not yet implemented. Amends ADR-0012 only for explicitly started Journeys.

## Decision

Passengers need Journey Progress and get-off alerts while their native app is hidden or their phone is locked. Enable background location only during an explicitly started Journey and stop it when that Journey ends or is cancelled; ordinary map viewing retains ADR-0012's foreground-only behavior. This trades additional native platform integration and battery use during navigation for guidance that does not require keeping the screen open.

Background execution, permission handling, and notification delivery require platform validation; acceptance of this design does not establish that the current app supports them. The website remains the reference for the shared interface, while native integration supplies OS capabilities. Web suspension must not be presented as continuous background tracking.

ADR-0011's on-demand EMT fetching and request budget remain in force. Background location does not authorize network-wide bus arrival polling.
