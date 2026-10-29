# 13. The centre pin updates locally while dragging and fetches buses only once settled, within a budget

Date: 2026-10-28

## Status

Accepted. Implements #133 (centre pin). Builds on [ADR-0011](0011-on-demand-realtime-bus-fetching-and-prototype-preservation.md) (on-demand bus arrivals, never poll all stops) and [ADR-0012](0012-battery-aware-live-location-tracking.md) (no extra GPS cost).

## Context

With the pin glued to the map centre, every pan changes the walk set. Refetching EMT arrivals around every intermediate position would hammer an unofficial API (1,155 stops) and the phone; updating only on gesture end made the list feel dead during a drag.

## Decision

`src/utils/centrePinBuffer.js` holds the policy; its constants are the source of truth.

- **Mid-drag, local only.** While a hand gesture moves the map, the centre is republished on a leading+trailing throttle (`MID_DRAG_THROTTLE_MS` 350 ms), skipping moves under 15 m. The nearby list, map nodes and metro rows come from local data and Arrival Memory. This makes no request.
- **Settle gate.** A gesture start marks the pin `moving`; the debounce (250 ms after the last move) clears it. The bus section fetches only while not `moving`.
- **Fetch anchor.** The first fetch sets an anchor (pin and time). Later positions refetch only stops that were never requested from the anchor, until the pin is more than `REFETCH_MOVE_M` (100 m) from it or the anchor is older than `ANCHOR_MAX_AGE_MS` (60 s). Cached stops cost nothing; stops already in flight are joined for free.
- **Prefetch buffer.** Stops within the bus walk radius plus `PREFETCH_BUFFER_M` (60 m), at most `PREFETCH_MAX_EXTRA` (4) beyond the visible batch, are fetched together, so a small pan is served from the 20 s cache.
- **Hard budget.** At most `BUDGET_MAX` (24) network requests per `BUDGET_WINDOW_MS` (6 s). Nearest stops win; skipped stops are not recorded on the anchor and are retried after `BUDGET_RETRY_MS` (1.5 s). Stale responses are dropped by the existing latest-wins guard.
- **No layout change.** Stops without data keep the existing placeholder rows; rows reused from the cache fill immediately. The policy is active only while the centre pin is (`centreGesture.active`); other hubs fetch as before.

## Consequences

- A long pan costs one burst after it ends (up to 24 requests), not one per position.
- A burst right after another can be partly deferred by up to about 6 s; rows show placeholders meanwhile.
- Verified by unit tests and a scripted simulation with a fake map. A real-browser run of the drags was not possible when this was written (browser extension not connected), so heat and frame rate are unmeasured.

## Addendum: the pin follows the map from a map tap and from the launch fix, and has one look

- Centre mode now starts from a map tap (Map Ping) as well as from a locate press and the launch auto-locate fix. A tap needs no GPS fix and shows no blue dot. The tap's own camera focus already puts the pin at the visible-map centre, so the first drag does not make the screen-fixed overlay jump.
- Closing the sheet (X, back, closing the hub, opening the menu) removes the pin and ends centre mode; dragging with no sheet open spawns no pin until the next tap, or locate press.
- The pin is a green ball on a green stick (`src/utils/pinIcon.js`), the same for the overlay and the geographic marker. The blue GPS dot is 19 px (was 14 px), static halo, no animation.

## Addendum: bus cards fill per stop, nearest first (#144, #145)

A recording showed the bus column on placeholders for seconds after a pin drop while tapping one stop was instant. The batch applied its results only once every stop had answered, so one slow stop held every card, and 8 to 12 simultaneous requests queued behind the browser's per-host connection limit.

- **Per-stop apply.** Each stop fills its own card the moment it answers. The latest-wins guard still drops answers for a position the pin has left.
- **Nearest first, capped concurrency.** Requests start in nearest-first order with at most `FEEDER_FETCH_CONCURRENCY` (4) in flight. The prefetch buffer comes last in that order, so it only gets what the budget leaves after the visible stops.
- **Waiting is visible.** A stop in the fetch batch with no answer yet pulses its placeholder rows (opacity only, no layout change, off under reduced motion). A stop that answered with nothing keeps the existing no-data marker.
- The budget (`BUDGET_MAX` per `BUDGET_WINDOW_MS`) and anchor rules are unchanged. Re-check the numbers on a device against the same drag pattern before touching them.

### Follow-up: the budget was spent on stops nobody could see (#144)

A device re-check still showed 5 s+ waits for the top three stops, although EMT answers in 0.1 to 0.3 s even with 8 requests at once. Cause: each drop asked for 8 stops plus up to 4 prefetched, which is the whole `BUDGET_MAX`, so any second drag within `BUDGET_WINDOW_MS` was deferred until the first drop's requests aged out (7.5 s or more). Tapping a stop costs one request and is outside this budget, which is why it was instant.

- `FEEDER_FETCH_BATCH` is 4 (the cards on screen plus one) and `PREFETCH_MAX_EXTRA` is 0. A drop costs at most 4 requests, so three drags fit in one window. Cards below the first screen still fetch as they scroll into view.
- The budget numbers are unchanged; only what is asked of it changed. A jitter of a few metres can swap the last stop of the batch, costing at most one request.

Budget retuned by the owner after the follow-up above: `BUDGET_MAX` 24 per `BUDGET_WINDOW_MS` 6 s (was 12 per 10 s, a ceiling of 2.4 requests/s, now 4/s) and `BUDGET_RETRY_MS` 1.5 s (was 2.5 s). With 4 requests per drop, six drops fit in one window and a deferred stop waits at most about 6 s, usually 1.5 s. These are chosen values, not measured on a device.
