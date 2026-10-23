# 6. Self-host on the LAN, behind a prevision-only proxy that hedges and caches

Date: 2026-10-23

## Status

Accepted. Supersedes the parts of [ADR-0005](0005-live-arrivals-come-straight-from-fgv.md) on dispatch spacing, timeout and retry for the web build, and the same-origin proxy for self-hosting. The rest of ADR-0005 stands.

## Context

The first full Network Sync took about 25.5 s on a cold load (28 s and 26 s in the interleaved baselines), and the map showed Simulated Trains for most of it. Three causes, measured:

- **Dispatch spacing.** The client sent one request per second, so 20 Stations cost about 20 s no matter how fast FGV answered (median 0.4 to 0.8 s).
- **Hangs.** 3 to 5% of requests sent straight to FGV never answer, and 7 to 8% did through the old per-request proxy. The client waited 4 s, then retried, so each hang cost 4 s.
- **Hosting.** `vite preview` sent unhashed assets with `no-cache`, gzip only, chunked, and no range support for the 36 MB basemap. Netlify's servers cannot reach FGV at all (ADR-0005), so the public website runs on the relay.

FGV's CORS policy rules out calling it from a browser, so any web build needs a same-origin proxy. The question was where to put it and how smart to make it.

## Decision

**Self-hosting on a LAN is a supported deployment.** `npm run build` then `npm run serve` (`server/`, port 8080 by default, Node only, no new dependency). The machine sits in Spain, where FGV answers. Netlify and the native app are unchanged.

**The local server is the only proxy, and it proxies the prevision route only.** It serves `dist/` with brotli, immutable hashed assets and range requests, and forwards `/api/metro/horarios-prevision-3/{id}` to FGV. It has no other upstream, so it cannot be turned into an open relay.

**Hedge at 1200 ms, give up at 3500 ms.** An upstream attempt FGV has not answered after 1200 ms gets one duplicate, and the first answer wins. A request still unanswered at 3500 ms ends in a 504. Median answers take 0.5 to 0.8 s, so 1200 ms sits past the body of the distribution and catches the hang tail without duplicating ordinary requests. The first hedge was at 1000 ms. At 1000 ms, hedges alone pushed upstream requests per load to 27 against a budget of 25, so it moved to 1200 ms. The deadline stays under the client's own 4 s attempt timeout, which still applies.

**A 10 s shared cache with coalescing, and an age contract.** Concurrent requests for one Station share one upstream call, and a 200 is reused for 10 s. The server answers with `X-Prevision-Age-Ms`, the time since FGV answered. The client anchors the Target Arrival Timestamp on `Date.now() - ageMs`. It sends an age, not an absolute fetch time, because the phone's clock and the server's clock disagree by an unknown amount, and an age needs no shared clock. Only 200s are cached.

**A bounded-concurrency queue replaces dispatch spacing.** The client holds at most 8 requests in flight on the web build and 4 on the native app, FIFO, and `syncNetwork` feeds it the Hubs first, then the other Major Stations. The server caps upstream requests at 8. Native stays at 4 because it talks to FGV directly, with no hedge or cache to absorb a hang. The 429 backoff stays.

**No batch endpoint.** A server route returning many Stations at once would cut round trips further, but it holds every answer until the slowest arrives. The per-Station route lets the map draw each Station's Vehicles as its answer lands, so progressive drawing wins over fewer requests.

## Consequences

Measured on the LAN against FGV, medians of interleaved cold loads:

| | Before | After |
|---|---|---|
| Full Network Sync | 25.5 s | about 5 s with the queue at 4 (#76: 4.5 to 6.4 s), then 4.1 s with 8 in flight and hedge at 1200 ms (#75, against 6.0 s for the 4/4 arm) |
| Hang rate | 7.5% through the old proxy (3 to 5% direct) | 0 through the proxy (hangs end as a hedged answer; one 504 in 80 requests in an earlier run, none in the final) |
| Upstream requests per cold load | 20 to 22 | 22 (final run; the 4/4, 1000 ms arm took 26) |
| Hedges per load | n/a | 2 (against 6 for the 4/4, 1000 ms arm) |
| First live Vehicle, cold | 737 ms on `vite preview` | 657 ms on `serve` (#74) |
| Main chunk over the wire | 367 kB gzip | 301 kB brotli |

The 3 s target for the first Network Sync was not met. At 8 in flight it is about 3 rounds of 1 s plus FGV's tail, and the spread across loads is wide (3.6 to 5.4 s). The experiment first rejected 8 in flight on the rule "at most 25 upstream requests", then adopted it: the rule was meant to stop concurrency adding FGV load, and it did not (27 requests against 27.5), because hedging caused the overshoot.

Two other tickets came out partly or not at all. **#78** (per-frame work) met its frame target (rAF callback p50 1.1 to 0.7 ms) but not boot commits: 23 to 14, against a goal of 6. Station answers arrive one by one, and each changes the live and confirmed counts, so a trailing throttle was the only way lower and it would show stale counts during boot. **#79** (boot CPU) is a null result. At 4x CPU, boot time is MapLibre's painter setup (about 1.6 s of 2.3 s) and the browser; our code is under 30 ms. Lazy-loading three components moved bytes into a chunk preloaded anyway and changed bootup by 2%, inside the noise, so it was reverted. **#77** (boot the network on map mount) gained 30 to 50 ms, within FGV noise, and was kept because the style load takes about 1.6 s on a phone.

The cache makes a second sync within 10 s nearly free, so measure cold loads more than 10 s apart.

Costs. The server is one more thing to run and keep reachable, with no authentication. A prediction may be up to 10 s older than the client's request, which the age contract keeps honest. The FGV URL now lives in `server/prevision.js` as well (see `docs/fgv-api.md`). The 8-train cap, the Netlify block and the undocumented endpoint from ADR-0005 are unchanged.

Final measurement: see PR #81.
