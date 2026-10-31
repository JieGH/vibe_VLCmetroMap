# iOS Journey guidance

Implements the native JourneyGuidance V1 bridge for #162. Native compilation is verified; physical locked-phone delivery and haptics remain acceptance work. The website continues to supply the shared Journey interface.

## Execution and permissions

The custom Capacitor bridge controller registers JourneyGuidance. It is used by both the SceneDelegate and storyboard entry points. The plugin requests When In Use location and notification permission only when explicitly called from the Journey flow. It does not request Always location authorization or start tracking at launch.

An explicitly started Journey enables a continuous Core Location session with `allowsBackgroundLocationUpdates`, the system location indicator, and the `location` background mode. Location events and native timer callbacks compute estimated timetable progress independently of WebView JavaScript. Location matches identify the device's current call without inferring passenger boarding. A timetable transition never confirms boarding and never completes a Journey automatically.

Apple's installed Xcode SDK documents that When In Use authorization can continue through a foreground-started continuous background session while its location indicator remains visible, until updates stop or the user kills the app. See [background location updates](https://developer.apple.com/documentation/corelocation/handling-location-updates-in-the-background), [allowsBackgroundLocationUpdates](https://developer.apple.com/documentation/corelocation/cllocationmanager/allowsbackgroundlocationupdates), and [location authorization](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services). The relevant declarations were also checked in the installed CoreLocation SDK header; web documentation rendering was unavailable to the browser tools.

## Alerts and native session state

The plugin schedules an OS local notification at the penultimate call of each transit portion, shifted by the session's `scheduleOffset`. This supplies an explicitly estimated alert even when underground fixes and WebView callbacks are absent. A near-call location/manual correction updates pending future alerts using the same notification identifier. The native scheduled alert stays estimated unless boarding was explicitly confirmed and current call evidence supports the instruction. Notification sound follows the passenger's sound option; foreground notifications also request a vibration. Actual locked-phone haptics, notification delivery, Focus behavior, and user alert settings require device validation.

JS-announced alert IDs and native OS-trigger IDs are separate: displaying a web banner does not suppress the first native notification. Returned session IDs combine both sets for JS banner deduplication. Native alert IDs and scheduled deadlines are retained on-device for the same session's restart; this small ledger does not store location fixes or the full Journey. Pending and delivered Journey notifications are scoped by prefix and are removed when the session ends or is cancelled. Other app notifications are not cleared.

The methods are `startSession({session})`, `updateSession({session})`, `stopSession({sessionId})`, `getSession()`, and `requestPermissions()`. `getSession` returns the current V1 payload for reconciliation. Its `supported`/`status` response describes native availability; it is not proof that a physical notification was received. Denied or unavailable OS services must remain visible in the shared UI.

No network requests or EMT polling are introduced by this plugin. Stopping a Journey stops its Core Location manager and native timer. Ordinary map tracking retains its separate foreground-only behavior.

## Build and physical acceptance

The app compiles without signing with:

```sh
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /private/tmp/xarxa-navigation-ios CODE_SIGNING_ALLOWED=NO build
```

The user's normal device workflow remains Xcode Run. Before closing #162, validate on a physical iPhone:

- No new permission prompt or native Journey watch during ordinary map viewing.
- An explicitly started Journey requests needed permissions in context and displays an honest denied state when refused.
- With the phone locked, the native session continues and the get-off notification arrives one call before alighting; test sound both disabled and enabled and observe actual haptics.
- Underground/suspended-WebView timing is labeled estimated, and no scheduled movement confirms boarding.
- Manual correction shifts pending alerts; the same event does not notify repeatedly through foreground/background transitions or a same-session restart.
- Native progress reconciles on return without overwriting a newer passenger correction.
- Completion/cancellation removes pending alerts and ends the background location indicator. Test cancellation while a permission request or notification scheduling operation is pending.
- Discarding a saved Journey invokes `stopSession` with its saved identity even if no JS controller is active, so OS-scheduled estimates from an earlier process are cancelled.

GPS continuation after a user force-quit is not promised. Passing a build or a mocked JS lifecycle test does not verify any physical-device criterion above.
