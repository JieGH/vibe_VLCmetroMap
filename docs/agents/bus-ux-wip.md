# Line 19 bus UX: work in progress

Done and committed (unit tests green, 1526 passing):
- Next-bus emphasis: the bus a board row counts down gets a green breathing ring and an "N stops away" chip (rows claim it via busFleet.setNextBus). Screenshot verified (dark, zoom 16.5).
- Dim stale buses: fix older than 60 s drawn at 0.55 (CSS filter, because MapLibre rewrites style.opacity), halo hidden. Unit tested; the stale screenshot was captured but not looked at.
- Empty-state note "Sin buses en directo" in the reserved line 19 slot, only after a good empty response. Screenshot verified (dark, es).
- Marker at 50% size (20px disc, number 12px bold, 9px for 3+ characters). Dark z16.5 viewed: number legible. Light, z15 and z17 captured but not looked at.

Not done: build, apk, light theme and zoom 15/17 visual review, stale screenshot review, compact (ConnectingBusSection) note width check, ca/en screenshots.
