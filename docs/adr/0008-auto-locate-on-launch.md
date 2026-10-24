# 8. Locate on launch, for anyone who has already said yes

Date: 2026-10-24

## Status

Accepted. Builds on [ADR-0004](0004-geolocation-comes-from-the-capacitor-plugin.md): all geolocation still goes through `userLocation.js` and the Capacitor plugin.

## Context

The locate button answers "which platform do I walk to", but only after a tap. Someone who has already allowed location opens the app to the default view of the whole network and has to ask every time.

Asking for permission on their behalf is a different matter. Browsers treat a permission prompt on page load as spam, and a visitor who dismisses it is often blocked for good. Android offers the system prompt again after a single deny, so the OS cannot be asked whether it was already asked.

## Decision

- **Launch-time locate** runs once per cold launch, started at mount in parallel with the network sync. The fix is held until the map is ready, then applied through the same path as the button: frame the User Location and its Nearest Station, open the Station's departures.
- **Native resume:** when the app returns to the foreground after at least 5 minutes hidden (`visibilitychange`, so no new plugin), it locates again. The web never resumes: a tab is not "returned to".
- **Never in `?mode=dashboard`.**
- **The permission rule is a pure function**, `autoLocatePolicy({ isNative, permission, askedBefore })`:
  - granted, native or web: locate silently;
  - native, never asked: show the system prompt **once**, recording `xarxa.autoLocatePrompted` in `localStorage` before it is raised, and never auto-prompt again. Unreadable storage counts as asked;
  - native denied, or prompt with the flag set: skip;
  - **web, anything but granted: skip.** The web never prompts on load. The locate button remains the opt-in, and once the visitor allows it there, later visits locate by themselves.
- **Quiet.** A refusal, timeout, unavailable, imprecise or out-of-range result at launch shows nothing and moves nothing. Only a usable fix with a Nearest Station is applied; it shows the usual nearest-station notice.
- **Interaction wins.** If the viewer selects a Station, searches, or moves or zooms the map (MapLibre `movestart` carrying an `originalEvent`, which the app's own camera moves lack) before the fix lands, the fix is dropped: no camera move, no selection, no dot. A Station already open on resume is likewise not displaced, though the refinement of auto-locate's own selection may replace it.
- **The button outranks it.** Pressing the locate button discards any launch-time fix still in flight and runs the button's own behaviour.

The scheduling lives in `src/services/autoLocate.js`, outside React, so every rule above is testable in the existing node test environment without adding a DOM library.

## Consequences

- A native first launch raises the system prompt unprompted, once. Declining it is final until the viewer uses the button or Settings.
- The browser permission is read through the plugin's `checkPermissions`; a browser without the Permissions API reads as "unknown" and is skipped.
- A launch-time fix can arrive after the viewer has already begun looking at the map. They lose nothing: interaction wins, and the button is still there.
