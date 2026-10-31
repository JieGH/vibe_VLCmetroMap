# Android active Journey guidance

The tracked Capacitor Android app supplies the version-one `JourneyGuidance` bridge. This is native OS integration for the shared website-led interface; it does not replace transit cards or add a separate Android navigation UI. Physical-device notification, vibration, and locked-screen delivery remain unverified until the checks below are run.

## Contract and lifecycle

- `requestPermissions()` requests coarse/fine location and, on Android 13+, notification permission in the context of starting a Journey. It reports `denied` when the required capability is unavailable; it does not open Settings or start tracking on its own.
- `startSession({session})` starts an explicitly requested location foreground service while the app is visible. The result becomes `active` only after foreground promotion, notification-channel checks, and location subscription succeed. OS rejection is returned as `denied` or `unavailable`.
- `updateSession({session})` updates the existing session only. It preserves manual `scheduleOffset` corrections, rejects older external updates, and does not start an inactive service implicitly.
- `getSession()` returns the full current version-one session, including its normalized Journey, current leg/call, boarding confirmation, progress source, offset, timestamps, sound preference, labels, and announced alert IDs.
- `stopSession({sessionId})` stops only the matching active session. The ongoing OS notification also offers End journey. Stopping removes location updates, timers, the wake lock, and this session's notifications. No service starts on boot, and an OS-terminated service is not automatically restarted; the shared UI can offer an explicit resume.

The service uses a location foreground-service notification and a partial wake lock only during the active Journey. The lock allows native estimated-progress timers to run when the screen is off and GPS is unavailable underground. It has a six-hour safety bound, and the service checks the same duration limit. Ordinary map viewing retains foreground-only tracking. These native permissions are declared: foreground service, foreground service location, notifications, vibration, and wake lock; background-location permission is not added.

## Progress and alert decisions

Calls are indexed as boarding place, intermediate calls, then alighting place. Native time progression uses wall clock minus the passenger's schedule offset, remains estimated, and never sets `boardingConfirmed`. Fresh fixes with accuracy at most 100 metres can correct the current call only when a nearby call is unambiguous; stale, invalid, rough, or ambiguous fixes leave the estimate intact.

The native service evaluates alighting thresholds without relying on WebView callbacks. One Station or EMT Bus Stop before alighting, it posts a notification with vibration; sound uses a separate opt-in notification channel. Uncertain progress or unconfirmed boarding produces an estimated alert. OS notification settings and Do Not Disturb remain authoritative.

JS-announced alert IDs are kept separate from native OS-delivery IDs: showing a foreground banner must not suppress the corresponding OS notification. The service deduplicates its own notifications and returns the union of announcements to the shared controller. Small local delivery metadata survives a same-session restart and is removed on explicit stop or replaced by a new session. It contains opaque session/event IDs, not coordinates, and is excluded from Android backup/device transfer. This metadata records notification submission, not proof the passenger saw or heard it.

There is no native network fetching or city-wide EMT polling. The service receives its chosen Journey from the shared app.

## Validation

Host-side native runtime regressions cover clock-driven estimated progress, single alerts, delayed/manual corrections, stale updates, matching-session cancellation, GPS accuracy/freshness/ambiguity, known delivered events, and boarding reset on transfer. They do not establish real OS notification delivery.

Device acceptance must verify:

1. Start a Journey while the app is visible; accept the contextual OS requests and confirm the persistent notification.
2. Lock the screen and verify that native progress continues and the one-call-before-alighting notification/vibration arrives. Repeat with optional sound and with underground/no-fix conditions; verify estimated wording.
3. Correct a delayed Journey in the shared UI, lock again, and verify the correction is retained. Verify a foreground-triggered alert produces one OS notification, rather than none or duplicates.
4. Resume the shared app and verify current native progress and alert IDs reconcile correctly. Confirm a transfer does not imply boarding the next Vehicle.
5. End or cancel from the shared UI and from the notification; verify no further callbacks, ongoing notice, vibration, or wake lock remains. Verify the shared UI reconciles an OS-side stop.
6. Deny/revoke location or notification permission, disable the applicable notification channel, disable device location, and terminate the service from Android's controls. The app must report the resulting limitation and retain manual planning/guidance fallbacks.
7. Check battery impact and the six-hour safety bound on a real device. An APK build or mocked callback is not evidence for these checks.

The existing full Android lint baseline includes two `NewApi` errors for display-cutout attributes in pre-existing theme resources. They are unrelated to Journey guidance; new guidance permission and translation findings were corrected.

## Primary references

- [Android location foreground-service prerequisites](https://developer.android.com/develop/background-work/services/fgs/service-types#location): a location service requires declared service permissions and previously granted location access; launch it while the app is visible.
- [Android foreground-service launch](https://developer.android.com/develop/background-work/services/fgs/launch): the service must promote itself promptly and maintain its required notification.
- [Android notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission): Android 13+ notification access is requested at runtime; a foreground-service launch alone does not grant notification delivery.
- [Android wake-lock guidance](https://developer.android.com/develop/background-work/background-tasks/awake/wakelock): keep wake locks scoped and release them promptly because they affect battery use.
- [Capacitor Android plugin guide](https://capacitorjs.com/docs/plugins/android): bridge methods and permission callbacks use the native plugin API.
