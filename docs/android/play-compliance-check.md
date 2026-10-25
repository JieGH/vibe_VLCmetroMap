# Google Play compliance check

Date: 2026-10-25. Covers the Capacitor wrapper (`android/`, `com.jielei.Xarxa`, "CAP") and the native Kotlin app (`android-native/`, `com.jielei.xarxa.nativeapp`, "NAT"). Every rule below was read from the official page on this date (fetched through a summarising tool, so quoted wording is paraphrase; re-read the linked page for anything you stake a decision on). PASS = verified in the repo or the build. OWNER = needs a Play Console or legal action only the owner can take. WATCH = verified rule, but judgement or a future date applies.

## Checklist

| # | Requirement | CAP | NAT | Evidence | Source |
|---|---|---|---|---|---|
| 1 | Target API: new apps and updates must target API 36 (Android 16) by 31 Aug 2026; extension to 1 Nov 2026 | PASS (36) | PASS (36) | `android/variables.gradle`, `android-native/app/build.gradle.kts`; merged manifests show targetSdk 36 | https://support.google.com/googleplay/android-developer/answer/11926878 |
| 2 | 16 KB page size for apps targeting 35+ with native code; updates blocked from 1 Feb 2027 per developer.android.com (forum reports cite 1 Nov 2025 / 1 May 2026; the Play Console policy status page decides) | PASS (no own native libs; AGP 8.13.0, `useLegacyPackaging=false`) | PASS | Bench APK: `zipalign -c -P 16 -v 4` "Verification successful"; ELF LOAD p_align = 16384 for `libmaplibre.so` and `libandroidx.graphics.path.so` on arm64-v8a and x86_64 (parsed with Python); AGP 8.13.0 | https://developer.android.com/guide/practices/page-sizes |
| 3 | Upload an Android App Bundle (required for new apps since Aug 2021) | PASS (`bundleRelease` builds a 40 MB aab) | PASS (59 MB aab) | Built 2026-10-25 | https://developer.android.com/guide/app-bundle |
| 4 | Play App Signing (new apps enrolled by default; you sign with an upload key) | OWNER | OWNER | CAP signs from untracked `android/keystore.properties`; NAT now signs from `android-native/keystore.properties` (new). Both aabs built here are unsigned because no keystore exists yet | https://support.google.com/googleplay/android-developer/answer/9842756 |
| 5 | Release shrinking and rules | PASS (minify + shrinkResources) | PASS (now enabled; keep rules for MapLibre, serialization) | NAT release R8 build succeeded with mapping.txt. NOTE: not smoke-tested on a device (the emulator was in use); run the checklist step 6 on a release or bench build before upload | internal |
| 6 | Privacy policy URL, required to complete Data safety even if nothing is collected; link in listing and reachable in app | OWNER (host `privacy-policy.md`, enter URL) | OWNER | Policy text exists and was corrected | https://support.google.com/googleplay/android-developer/answer/10787469 |
| 7 | Data safety form: "collect" = data transmitted off device; on-device-only processing is exempt | PASS (location stays on device; answers "No") | PASS | Location only used locally in code; only network call is to `https://www.fgv.es/...` with a station id. WATCH: IP address seen by FGV is inherent to HTTPS; document it, answer No | https://support.google.com/googleplay/android-developer/answer/10787469 |
| 8 | Encryption in transit | PASS | PASS | `usesCleartextTraffic=false` + network security config in both. FGV endpoint is HTTPS, so no cleartext exception exists or is needed | same |
| 9 | Data deletion question | PASS (no data collected, N/A) | PASS | Form still must be completed | same |
| 10 | Location permission: foreground only; Permissions Declaration Form only for background location; ask least scope | PASS | PASS | No `ACCESS_BACKGROUND_LOCATION`, no foreground service. Fine plus coarse requested; justified in permissions-rationale.md. WATCH: policy page mentions the Android location button becoming the recommended minimum for precise location from 27 Jan 2027 | https://support.google.com/googleplay/android-developer/answer/9799150 and https://support.google.com/googleplay/android-developer/answer/9888170 |
| 11 | Hardware features not forced | PASS (location, gps, network all `required=false`; added now) | PASS (added now) | Manifests | https://developer.android.com/guide/topics/manifest/uses-feature-element |
| 12 | No unneeded permissions | PASS (INTERNET, location only) | PASS (adds ACCESS_NETWORK_STATE; ACCESS_WIFI_STATE comes from MapLibre, both normal) | Merged manifests | internal |
| 13 | Advertising ID / AD_ID declaration: apps targeting 33+ declare AD_ID if they use the ad ID | PASS (not used, no AD_ID in manifest) | PASS | Merged manifests have no AD_ID; answer "No" in Console | https://support.google.com/googleplay/android-developer/answer/6048248 |
| 14 | Ads declaration | PASS (No ads) | PASS | No ad SDK | https://support.google.com/googleplay/android-developer/answer/9859455 |
| 15 | Target audience: not for children; do not select under-13 groups (selecting them triggers Families Policy) | OWNER | OWNER | Choose 13+ or 18+ | https://support.google.com/googleplay/android-developer/answer/9285070 |
| 16 | Content rating questionnaire | OWNER | OWNER | Expect Everyone; could not verify questionnaire details from a fetched page | https://support.google.com/googleplay/android-developer/answer/9859655 (not re-fetched) |
| 17 | Minimum functionality / webview wrapper: Google removes "webview spam", apps that only wrap an existing website | WATCH (CAP loads bundled assets, not a remote site, and uses native location, an offline basemap, back handling; defensible but the weakest of the two) | PASS (fully native) | Policy wording on website wrappers could not be fetched verbatim; evidence is Google's 2020 blog and the Limited Functionality section | https://android-developers.googleblog.com/2020/10/developer-tips-and-guides-common-policy.html and https://support.google.com/googleplay/android-developer/answer/9898783 |
| 18 | Impersonation / IP: do not imply official status or use brand names or logos in title, icon, developer name without rights | WATCH | WATCH | Title changed from "Metrovalencia live map" to "Valencia metro live map"; "unofficial / not affiliated" now first line of every description; in-app disclaimer exists (NAT `about_operator`, web `unofficial` string). Forum precedent (Pi-hole Droid) shows a disclaimer does not cure a confusing name or logo; keep FGV and Metrovalencia logos out of the icon and graphics. Line brand colours are FGV property per the About text; a muted use is a risk to monitor | https://support.google.com/googleplay/android-developer/answer/9888077 |
| 19 | App name and metadata: title at most 30 characters, no emoji, no ranking/price claims, accurate | PASS ("Xarxa: Valencia metro live map" = 30) | PASS | play-listing.md | https://support.google.com/googleplay/android-developer/answer/9898842 |
| 20 | Store assets: icon 512x512 32-bit PNG max 1024 KB; feature graphic 1024x500 JPEG or 24-bit PNG; screenshots 2 to 8 per device type, 320 to 3840 px, long side at most 2x short side | OWNER (create) | OWNER | Specs in play-listing.md corrected (the old text said icon "no alpha" and screenshots "16:9 or 9:16") | https://support.google.com/googleplay/android-developer/answer/9866151 |
| 21 | New personal account: closed test with 12+ testers opted in continuously for 14 days before applying for production | OWNER | OWNER | Created after 13 Nov 2023 applies. Google reviews the application, usually within 7 days | https://support.google.com/googleplay/android-developer/answer/14151465 |
| 22 | Pre-launch report (stability, performance, accessibility, screenshots) | OWNER (read after upload) | OWNER | Check touch targets (NAT buttons are at least 48 dp) and contrast | https://support.google.com/googleplay/android-developer/answer/9844487 |
| 23 | Backup rules | PASS (prefs only) | PASS (allowBackup=false plus extraction rules excluding all) | `res/xml/` | internal |
| 24 | Locale config | PASS | PASS (`locales_config.xml`: en, es) | NAT manifest | internal |

## Changes made in this pass

- `android-native`: `version.properties` (single version source), `keystore.properties.example` plus gitignore (`keystore.properties`, `*.jks`, `*.keystore`), release signing from `keystore.properties`, `isMinifyEnabled`/`isShrinkResources` true, keep rules, `network_security_config.xml`, `data_extraction_rules.xml`, `backup_rules.xml`, `usesCleartextTraffic=false`, `uses-feature` location/gps/network required=false. `bench` inherits release, so it now runs minified (more faithful for benchmarking); its signing is unchanged (debug key).
- `android`: added `uses-feature` location and location.network (required=false).
- Docs: all of `docs/android/*.md` corrected with source links. The old checklist said "API 35 for 2025" and "16 KB required from Nov 2025"; listing said icon needs no alpha and screenshots must be 16:9; the title carried the Metrovalencia trademark.
- The native About dialog already carries the not-affiliated disclaimer (`about_operator`, English and Spanish), so no Kotlin or string edit was needed.

## Owner-only steps

1. Create the upload keys (one per app) and `keystore.properties` in each project; back them up.
2. Host the privacy policy and enter its URL; fill Data safety (data-safety.md), Ads (No), target audience (13+ or 18+), content rating, App access (none), news/government (No).
3. Make the 512 icon, 1024x500 feature graphic and 2 to 8 screenshots, with no FGV logos.
4. Smoke-test a release/bench build of NAT on a device (R8 is new there), then upload to Internal testing, read the pre-launch report.
5. Run the 12-tester, 14-day closed test, then apply for production.
6. Legal: the FGV endpoint is the one FGV's own app uses and is undocumented; Play does not decide whether you may use it. Consider asking FGV for permission or using their published open data, and keep the unofficial wording. Decide whether to publish both apps or only the native one (they would otherwise compete under the same name).
7. Confirm the 16 KB date on the Play Console policy status page.

## Not verified

The content-rating, Play impersonation/IP policy pages and the exact webview-wrapper wording were not returned by the fetch tool; those rows rely on the cited summary pages and should be re-read before submission.

## Round 2 (2026-10-25, after the drawer/About rework)

Re-checked NAT against the repo; rules from round 1 were not re-fetched.

- **Fixed: crash on Android 8.0/8.1 (minSdk 26).** `TrainIcons.kt` called `Typeface.create(family, weight, italic)`, which exists from API 28; on API 26/27 it throws `NoSuchMethodError` when the first train icon draws. A pre-launch report device on 8.x would show it. Now guarded by `Build.VERSION.SDK_INT >= 28` with `DEFAULT_BOLD` below.
- **Fixed: `lintDebug` failed** on `windowLayoutInDisplayCutoutMode` (`values/` and `values-night/themes.xml`); the attribute is ignored on older systems, so `tools:targetApi="o_mr1"` is the right fix. Lint and unit tests now pass.
- Merged release manifest: INTERNET, ACCESS_NETWORK_STATE, FINE/COARSE_LOCATION, ACCESS_WIFI_STATE (MapLibre), a signature-level `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. No AD_ID, no background location. Unchanged from round 1.
- New About "Source code" button opens the canonical repo (`JieGH/vibe_VLCmetroMap`) in the browser; it sends nothing, so Data safety answers are unchanged.
- **Done:** About now has a "Read the full privacy policy" button (`PRIVACY_URL` points at the GitHub copy of `privacy-policy.md` on `main`; it resolves once `dev` is merged and pushed; swap in your own hosted URL if you prefer).
- **Done:** `privacy-policy.md` library wording now matches what About shows.
- The sideload APK on the v1.3.1 release (`Xarxa-Native-v0.1.0.apk`) predates both fixes; rebuild it with `tools/release-apk.sh` before sharing it with older phones. It uses a separate key, so it cannot be mixed with the Play build.
