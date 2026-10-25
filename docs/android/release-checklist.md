# Android release checklist

Applies to both apps. Everything below is run from `android/` (Capacitor wrapper, `com.jielei.Xarxa`) unless noted; the native Kotlin app (`android-native/`, `com.jielei.xarxa.nativeapp`) follows the same steps with its own `keystore.properties`, `version.properties` and `./gradlew :app:bundleRelease` (output `app/build/outputs/bundle/release/app-release.aab`). Use a different upload key for each app. Rules were re-verified against official sources on 2026-10-25; see [play-compliance-check.md](play-compliance-check.md). Never commit a keystore or `keystore.properties` (both are gitignored).

## One-time setup

1. Create an upload key and keep two backups outside the repository:
   `keytool -genkeypair -v -keystore ../release-keystore.jks -alias xarxa -keyalg RSA -keysize 4096 -validity 10000`
2. `cp keystore.properties.example keystore.properties` and fill in `storeFile`, `storePassword`, `keyAlias`, `keyPassword` (paths are relative to `android/`).
3. Play App Signing: new apps are enrolled by default; the key above is the upload key and Google holds the app signing key (https://support.google.com/googleplay/android-developer/answer/9842756). Apps must be published as Android App Bundles, `.aab` (https://developer.android.com/guide/app-bundle).
4. Complete the store listing ([play-listing.md](play-listing.md)), the Data safety form ([data-safety.md](data-safety.md)), the privacy policy URL ([privacy-policy.md](privacy-policy.md)) and the content rating.

## Every release

1. Bump the version in `android/version.properties`: increase `versionCode` by at least 1 (Play rejects a repeat) and set `versionName`. It is the only place either lives.
2. Make sure the app is current: from the repository root run `npm test -- --run && npm run lint`, then `npm run build` (its postbuild also syncs iOS) and `npm run android:sync` (or `npx cap sync android`).
3. Build the bundle: `./gradlew bundleRelease`. Output: `app/build/outputs/bundle/release/app-release.aab`. With no `keystore.properties` the bundle is unsigned and Play will refuse it.
4. Confirm signing: `jarsigner -verify -verbose -certs app/build/outputs/bundle/release/app-release.aab | head`.
5. Check the build targets:
   - `targetSdk` is in `android/variables.gradle` (`targetSdkVersion`; native: `android-native/app/build.gradle.kts`). **Current rule (checked 2026-10-25): new apps and updates must target Android 16 (API 36) or higher by 31 August 2026, with an extension available to 1 November 2026.** Both apps target 36, so they comply. Expect the level to move up each year; re-read https://support.google.com/googleplay/android-developer/answer/11926878 before each release. (The earlier text here, "API 35 for 2025", was out of date.)
   - **16 KB page size:** apps that target API 35+ and ship native code must support 16 KB page sizes on 64-bit devices. developer.android.com states updates that do not will be blocked from **1 February 2027** (earlier dates of 1 Nov 2025 / 1 May 2026 appeared in forum reports and Play Console warnings; treat the Play Console policy status page as authoritative). Needs AGP 8.5.1+ (both apps use 8.13.0) and, for your own C++ code, NDK r28+. Source: https://developer.android.com/guide/practices/page-sizes. Check an APK with `zipalign -c -P 16 -v 4 app.apk` (look for "Verification successful") and the ELF LOAD alignment (`llvm-objdump -p lib.so | grep LOAD` must show `2**14` or more). Measured 2026-10-25 on the native bench APK: all four ABIs of `libmaplibre.so` and `libandroidx.graphics.path.so` have LOAD alignment 16384 and zipalign passes. The Capacitor app ships no native libraries of its own.
6. Smoke-test a release-like build on a device or emulator: `bundletool build-apks --bundle=app-release.aab --output=app.apks --ks=... && bundletool install-apks --apks=app.apks`. Check: map draws offline basemap, trains move, a station opens with departures, locate shows the rationale dialog then the system prompt, back button peels layers and exits, dark and light themes follow the system, no crash with R8 on (minify is on for release; if a feature breaks only in release, add a keep rule in `app/proguard-rules.pro`).
7. Upload the `.aab` to an Internal testing track first (Play Console, Testing, Internal testing). Add testers, roll out.
8. Read the **pre-launch report** (Play Console, Testing, Pre-launch report) after it finishes. It covers stability (crashes, ANRs, restricted non-SDK interfaces), performance, accessibility (labels, touch target size, contrast) and screenshots on test devices (https://support.google.com/googleplay/android-developer/answer/9844487). Fix or consciously accept each item.
9. Promote to Closed, then Production with a staged rollout (for example 20%, then 100%). Personal developer accounts created after 13 November 2023 must run a closed test with at least 12 testers opted in continuously for 14 days before applying for production access; Google's review usually takes up to 7 days (https://support.google.com/googleplay/android-developer/answer/14151465). The article states the rule for personal accounts only.
10. Tag the release and attach nothing secret: `git tag v<versionName>`. Keep the `.aab` and the mapping file (`app/build/outputs/mapping/release/mapping.txt`); Play also takes the mapping automatically from the bundle.

## Sideload APK

The GitHub release APK (`Xarxa-v*-android-debug.apk`) is a separate, debug-signed artefact that the in-app download banner points at. `./gradlew assembleDebug` builds it. A release APK for sideloading, if ever wanted: `./gradlew assembleRelease` (needs the keystore). Keep sideload and Play builds signed with different keys in mind: users cannot update one with the other without uninstalling.

## Native APK on GitHub releases (Obtainium)

Every release also carries the native app: `android-native/tools/release-apk.sh [tag]` builds `assembleRelease`, signs it with the sideload key in `~/.android/xarxa-sideload.jks` (password in `xarxa-sideload.pass`, created on first run, back both up, never change it) and uploads `Xarxa-v<versionName>-android.apk` and a copy named `Xarxa-android.apk` to the tag (default: latest release). The README and the website link to the copy through `releases/latest/download/Xarxa-android.apk`; the Obtainium APK filter is `.*android\.apk`. Bump `android-native/version.properties` first. This key differs from the Play upload key, so a sideloaded copy and a Play copy cannot update each other.

## Before each store submission

- Screenshots and listing text still match the UI.
- Data safety answers still match the code (no new SDKs, permissions or network calls).
- `docs/android/privacy-policy.md` is live at the URL entered in Play Console.
