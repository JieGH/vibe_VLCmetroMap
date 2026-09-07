# 4. Geolocation comes from the Capacitor plugin, not the browser

Date: 2026-09-07

## Status

Accepted.

## Context

The locate button needs one thing: the device's own coordinates, so the map can
centre on the viewer and name their Nearest Station.

The obvious way to get that is `navigator.geolocation.getCurrentPosition`. It is
standard, it needs no dependency, and MapLibre already ships a `GeolocateControl`
that wraps it, draws the dot, and would have delivered most of this feature for
the cost of one `map.addControl` call.

Neither works in the native app. Capacitor serves the web build from
`capacitor://localhost`, and WebKit does not treat that origin as a secure
context, so it refuses the API outright:

> Access to geolocation was blocked over insecure connection to capacitor://localhost.

The failure is silent from the web side — the same code that works in Chrome
returns a permission error on device, with nothing in the diff to explain it.
This is the same class of gap as [#15](https://github.com/JieGH/vib_metroValencia/issues/15):
verified in the browser, broken in the WKWebView.

## Decision

Take the fix from `@capacitor/geolocation`, on **both** targets. The plugin's web
implementation delegates to `navigator.geolocation` in the browser and to
CoreLocation on device, so the app has one call site and one result shape rather
than a branch on `Capacitor.isNativePlatform()`.

`src/services/userLocation.js` is the only module that talks to it. It takes the
provider as an argument, defaulting to the plugin, which is what lets the tests
drive every failure path without a browser.

Both privacy strings — `NSLocationWhenInUseUsageDescription` and
`NSLocationAlwaysAndWhenInUseUsageDescription` — are required in `Info.plist`.
Without them iOS terminates the app at the moment location is requested rather
than returning an error.

## Consequences

MapLibre's `GeolocateControl` is unusable here and should not be reached for
later. It calls `navigator.geolocation` internally, so it fails on device for
exactly the reason above while working perfectly in every browser test. That is
the trap this ADR exists to close.

Adding the plugin means the native project changes: a new pod, `npx cap sync`,
and an Xcode rebuild before the button does anything on the phone. Web-only
changes to this feature stay web-only, but the first one landed here does not.

The plugin is also the reason `enableHighAccuracy`, `timeout` and `maximumAge`
are honoured identically on both targets — the same options object reaches
CoreLocation and the browser, so a fix tuned in Chrome behaves the same way on
device.
