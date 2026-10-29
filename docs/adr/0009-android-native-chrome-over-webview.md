# 9. Android keeps the Capacitor WebView, with Material 3 chrome gated to Android

Date: 2026-10-24

## Status

Accepted.

## Context

The Android app is the same React build as the website and the iOS app, in a Capacitor WebView. To feel native on Android and pass Play review it needs the system back button, the system theme, a location rationale, Material 3 styling, a release signing path and Play listing material. The question was whether to get there by rewriting the app in Kotlin with Jetpack Compose and a native map.

## Decision

Keep the Capacitor WebView. Add Android-specific behaviour in the web layer, gated by `Capacitor.getPlatform() === 'android'` (`src/utils/platform.js`), so the website and iOS are unchanged: Material 3 chrome in `android.css`, `md-` prefixed components, the back-button priority in `androidBack.js`, system theme following, and a location rationale dialog. Native code stays small (the activity, manifest, signing, R8, and a one-method settings plugin).

A Kotlin rewrite is rejected for now because:

- **The map is MapLibre GL JS.** The vector-tile styling, the sprite and glyph handling, the layer ordering and the train markers are written against the web engine. MapLibre Native has a different style and layer API, so every layer and interaction would be re-done and re-verified, and the offline basemap strategy would change with it.
- **The offline basemap needs the pmtiles range workaround.** `valencia.pmtiles` is read by HTTP range request through `boundedRangeSource.js` because Capacitor's Android asset server mishandles ranges (see development.md). That is solved, tested and contained in the WebView; a native rewrite would need its own tile source.
- **The timetable walker places the trains.** ADR-0001's schedule-walking engine, arrival memory and rate budget are plain JavaScript shared with the website and iOS. Porting means maintaining two implementations of the hardest logic in the project and keeping them in agreement.
- **About 5,000 lines of tested JavaScript** (the vitest suite is the safety net) would be rewritten with no tests, for an app with one maintainer.

## Consequences

- One codebase for three targets; a fix to the engine or map ships everywhere.
- The Android feel depends on CSS and the WebView; scrolling, text rendering and the keyboard are the WebView's, not Compose's. This is accepted and is why chrome details are done carefully in `android.css`.
- Any Android-only code must stay behind `isAndroid()`, and web/iOS behaviour is covered by the existing tests.
- Revisit if the WebView proves unable to meet a Play policy or a performance bar on target devices, or if the map moves to MapLibre Native for other reasons.

## Addendum (1.8.1): the Capacitor build is the only APK

The separate native Kotlin app (`android-native/`) was removed from `main` in 1.8.1; its source stays, frozen, on the branch `native/kotlin-app` (commit 308e47c). It had fallen behind the web app, and everything it did could be had by packaging the website with Capacitor, which this ADR had already chosen to keep. The APK on GitHub releases is now built from `android/` (`scripts/release-apk.sh`) and is named `Xarxa-capacitor.apk`. The Android behaviours above (back button, system theme, location rationale, Material 3 chrome) are unchanged and still gated by `isAndroid()`.

The Material 3 skin (`src/android.css`) is also switched off: the Capacitor app draws the same interface as the website and the iOS app, and defaults to the dark theme like them. The website is the reference; the other platforms follow it. The back button, the location rationale and the settings shortcut remain Android-only behaviour. `android.css` is kept in the repository, unused, for anyone who wants the skin back (re-import it from `main.jsx` and add the `android` class to the root).

