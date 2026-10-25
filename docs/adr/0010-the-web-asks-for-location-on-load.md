# 10. The web asks for location on load, once

Date: 2026-10-25

## Status

Accepted. Supersedes the web rule in [ADR-0008](0008-auto-locate-on-launch.md) ("the web never prompts on load"). The rest of ADR-0008 stands.

## Context

ADR-0008 kept the web's launch-time locate for visitors who had already allowed location in the browser, and left everyone else to find the locate button. In use that made the site look inconsistent: it opened on the visitor on some devices and not on others, depending on a permission they had no way to know they were being judged by. The product is a live map for people standing at a stop; opening on them is the point.

## Decision

`autoLocatePolicy` treats the web like native:

- granted: locate silently on every load;
- denied: never ask;
- otherwise, first load asks **once** (the browser's own prompt, raised by the fix request), recording `xarxa.autoLocatePrompted` in `localStorage` before it is raised, then never again automatically. A visitor who allows it is `granted` from then on and located on every later load; one who dismisses it is left with the locate button.
- A browser that cannot report the permission (no Permissions API, older Safari) is asked once as well, because the fix request is what prompts there. Native still skips an unreadable permission.

Everything else in ADR-0008 is unchanged: quiet on failure, interaction wins, the button outranks it, only a usable fix with a Nearest Station moves the camera.

## Consequences

- A first-time web visitor sees the browser's location prompt right after the map loads. Browsers may suppress prompts that nobody answers (Chrome after a few dismissals), which is why the ask is once.
- A visitor outside the network (no Nearest Station within 2 km) is not moved: the map stays on the default view.
