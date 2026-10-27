# 12. Live location tracking is foreground-only and battery-adaptive

Date: 2026-10-26

## Status

Accepted. Implements #104. Builds on [ADR-0004](0004-geolocation-comes-from-the-capacitor-plugin.md) (Capacitor plugin on both targets) and respects [ADR-0011](0011-on-demand-realtime-bus-fetching-and-prototype-preservation.md) (no background arrival polling).

## Context

Locating gave a single snapshot. Walking with the app open left the blue dot, the nearby stops and the "Where you're at" hub frozen. A continuous high-accuracy GPS watch is the most expensive thing a map app can do to a battery, and the repeated recomputation (nearby stops, 3-minute-walk nodes, hub) plus re-renders cost more on top.

## Decision

`src/services/liveTracking.js` wraps `watchLocation` in a small state machine. Constants live there and are the source of truth.

- **Foreground only.** Paused on `visibilitychange` hidden and on Capacitor `appStateChange` inactive; on return a fresh, uncached fix is taken and the watch restarts. No background-location permission, mode or manifest change.
- **Cadence.** Moving: one fix per 4 s, `enableHighAccuracy: true` (a ~6 m step at walking pace). After 30 s without movement: one per 20 s, `enableHighAccuracy: false` (GPS chip off). Any movement returns to the fast mode.
- **Distance gate.** A fix within 10 m of the last reported one (widened to half the accuracy, capped at 25 m, for noisy fixes) is jitter and is dropped; fixes worse than `MAX_USABLE_ACCURACY_M` are rejected.
- **Idle stop.** After 10 minutes without movement the watch ends in a quiet, resumable `resting` state; the dot fades as it already does for stale fixes and pressing locate resumes.
- **Two tiers of update.** Per fix: only the user marker moves, via a small publish/subscribe channel straight to MapView, so the app does not re-render. After the viewer is 45 m from the last anchor: the nearest station, the 3-minute-walk nodes (225 m radius, with a 20 m hysteresis so nodes do not flicker at the edge) and the hub's data are recomputed through the normal `userLocation` state. The camera is not re-framed (`fetchedAt` is kept).
- **Camera.** While following, the camera eases to the dot only when it drifts more than 60 px from the middle, at the current zoom (#94). A manual pan or choosing a station/bus stop (#95) ends following; the locate button recentres and re-follows.
- **When it starts.** After any successful locate, including the launch-time auto-locate (a frozen dot is worse than a tracked one); the 10-minute idle stop bounds the cost. Pressing locate while tracking does not stop it: it recentres, re-follows and re-seeds. Stopping is hold-to-hide, closing the hub or dismissing GPS mode.
- **Hub refresh.** Past the 45 m anchor the "Where you're at" hub is rebuilt in place (same `buildGpsHub` as the first locate) only while the hub itself is showing; MapView skips its focus easing for such a refresh. A stop opened from the hub keeps its return context, and `resolveReturn` rebuilds the hub from the latest fix on return (#105).
- **Errors.** Denied or unavailable ends tracking with the existing location notice. A timeout is ignored. There is no retry loop.
- **Stop paths.** Anything that clears `userLocation` (hold-to-hide on the locate button, closing the hub, dismissing GPS mode, dropping a ping) stops tracking.
- **Rate budget.** Movement never fetches arrivals. Bus arrivals stay on demand (ADR-0011); metro arrivals stay in local memory.

## Consequences

- Stationary users cost almost nothing; walking users cost one coarse watch with a 4 s floor.
- A short-lived `resting` state means a phone left open on a table stops sampling after 10 minutes.
- The stationary and moving cadences are floors on how often we accept a fix; the OS may still deliver them less often.
