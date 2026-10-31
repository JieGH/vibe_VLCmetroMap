# Permissions and their rationale

This describes the Capacitor app (`com.jielei.Xarxa`) with passenger navigation. The separate native-app worktree is unchanged. Location hardware remains optional so devices without GPS can still browse transit and plan from a manually selected Starting Point. Changes to these permissions must be reflected here, in the data-safety notes, and in the privacy policy.

| Permission | Why | Required to use the app? |
|---|---|---|
| `INTERNET` | Fetch FGV/EMT Arrivals and send requested place searches and Journey endpoints to the configured services. | For online data and planning. |
| `ACCESS_COARSE_LOCATION` | Nearby transit and location-assisted Journey Progress. | No; manual planning remains available. |
| `ACCESS_FINE_LOCATION` | More accurate matching to Stations and EMT Bus Stops during guidance. | No; uncertain fixes remain estimated. |
| `FOREGROUND_SERVICE` | Maintain an explicitly started Android Journey while its screen is off. | For locked-phone guidance. |
| `FOREGROUND_SERVICE_LOCATION` | Declare the foreground service's location purpose on supported Android versions. | For locked-phone guidance. |
| `POST_NOTIFICATIONS` | Request permission where the OS requires it for visible Journey notifications and get-off alerts. | For supported native alerts; denial is shown honestly. |
| `VIBRATE` | Get-off alert vibration, subject to OS settings. | No. |
| `WAKE_LOCK` | Keep native progress/alert decisions running during an active Android Journey, including underground. The lock has a six-hour safety cap and is released when guidance stops. | For the active native guidance service. |

The app does not request `ACCESS_BACKGROUND_LOCATION`, contacts, storage access, camera, microphone, or advertising ID. The location foreground service is started from an explicit user action while the app is visible; it is not general background map tracking. It displays an ongoing notification with an End journey action. Completion, cancellation, denial, and service failure release active guidance resources. Actual delivery, silent-mode vibration, and cleanup still need physical-device acceptance.

## How permission is requested

Ordinary location discovery retains its contextual rationale and existing device-location permission flow. The rationale explains that nearest-transit discovery is on-device, while requesting Directions sends the selected Starting Point and Destination to the routing service. Place search has its own visible query-sharing disclosure.

Start journey and an explicitly confirmed Resume journey request the native guidance capabilities in context. A denied capability does not prevent manual route planning, and the shared interface must not describe unavailable locked-phone guidance as active. Ordinary map viewing retains ADR-0012's foreground-only, battery-adaptive tracking.

## Native integration

The Android `JourneyGuidance` plugin registers with the existing Capacitor activity and communicates with the scoped native guidance service through the versioned Journey contract. Native progress and notification decisions continue independently of suspended WebView JavaScript. The iOS adapter supplies the corresponding Core Location and notification behavior without adding a platform-specific visual theme.

`AppSettings.open()` remains the existing Android plugin that opens this app's OS settings page. Permission changes made there are reconciled when the app becomes active.

## Store declarations

The previous map-only statement that location is never transmitted and notifications are not requested no longer describes a navigation-enabled release. Directions may transmit User Location as the Starting Point; an unfinished Journey and its instructions can be retained locally. Review the actual configured providers, transport security, retention, and enabled service behavior before submitting store declarations. See [data-safety.md](data-safety.md), [privacy-policy.md](privacy-policy.md), and the platform Journey validation notes.
