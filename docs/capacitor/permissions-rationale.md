# Permissions and their rationale

Declared in `android/app/src/main/AndroidManifest.xml` (Capacitor), which declares INTERNET, ACCESS_COARSE_LOCATION, ACCESS_FINE_LOCATION and `uses-feature` location, location.gps and location.network all `required=false`, so devices without GPS can still install. The native app also declares ACCESS_NETWORK_STATE, and its merged manifest adds ACCESS_WIFI_STATE from MapLibre (both normal permissions, no Play declaration needed). Anything not listed here must not be added without updating this file, [data-safety.md](data-safety.md) and the privacy policy.

| Permission | Why | Required to use the app? |
|---|---|---|
| `INTERNET` | Fetch live departures from FGV's public API. | Yes, for live data. |
| `ACCESS_COARSE_LOCATION` | Find the nearest station when the viewer uses the locate button (or already allowed it). | No. |
| `ACCESS_FINE_LOCATION` | Same, with enough precision to choose between stations a few hundred metres apart. | No. |

Play policy (https://support.google.com/googleplay/android-developer/answer/9799150): the Permissions Declaration Form is for background location; foreground-only location needs no form. The Location policy (https://support.google.com/googleplay/android-developer/answer/9888170) asks for the least scope necessary (coarse over fine, foreground over background), no use once no longer needed, and never for advertising or analytics. We request both coarse and fine so Android 12+ users can grant either; the app also works on an approximate fix only when it is accurate enough, otherwise it says the location is too rough. The policy page also mentions a forthcoming (27 January 2027) recommendation of the Android location button as minimum scope for precise location; not relevant to Play acceptance today, watch it.

Not requested: background location, notifications, contacts, storage, camera, microphone, advertising ID.

## How location is asked for

1. The app never raises the system prompt cold. On Android, before the first system prompt, `LocationRationale` (an M3-style dialog) explains that location is used only on the device to find the nearest station and is never sent anywhere. **Continue** raises the system prompt; **Not now** does not, and the locate button can be pressed later.
2. Launch-time auto-locate (ADR-0008, ADR-0010) runs if location was already granted, and asks once on a first launch. The one first-launch prompt that ADR-0008 allows on native is preceded by the same dialog on Android.
3. A refusal is final until the viewer changes it. When the system reports "denied", a snackbar with an **Open settings** action is shown; the action calls the `AppSettings.open()` plugin method from `src/services/openSettings.js`.

## Native piece the web code expects (Capacitor app only)

`AppSettings.open()` must exist as a Capacitor plugin registered on Android (name `AppSettings`) that starts `Settings.ACTION_APPLICATION_DETAILS_SETTINGS` with `package:com.jielei.Xarxa`. If it is missing, the snackbar still shows but the button does nothing. The native app uses Compose and opens settings directly.

## Play Console text for the permissions declaration

"Location is used only when the user taps the locate button, to find and show the nearest metro station. It is processed on the device and is not collected, stored or shared. The app works fully without it."
