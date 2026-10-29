# Play Console: Data safety form

Answers for the Data safety section, for both Android apps (Capacitor `com.jielei.Xarxa` and native `com.jielei.xarxa.nativeapp`; they behave the same). Rules verified 2026-10-25 against https://support.google.com/googleplay/android-developer/answer/10787469. They match the app's behaviour as built; re-check them whenever a dependency, permission or network call is added.

## Overview questions

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **No** |
| Is all of the user data collected by your app encrypted in transit? | Yes. Nothing user-related is sent, and the only network calls (FGV's public API) use HTTPS. |
| Do you provide a way for users to request that their data be deleted? | Not applicable: no user data is collected. Google says the form still has to be completed, and a privacy policy linked, even for apps that collect nothing (same source). |
| Account creation | None. |

## Why "No" for location

Play defines "collect" as "transmitting data from your app off a user's device" and exempts data "only processed locally on the user's device and not sent off device" (https://support.google.com/googleplay/android-developer/answer/10787469). Play's location types are approximate (area of 3 km2 or more) and precise (under 3 km2); the app may receive either, and neither is declared. Xarxa reads the device's approximate or precise location only to compute the nearest station on the phone, using station coordinates bundled in the app. The coordinates are never sent to a server, written to disk or logged, and are not shared with any third party. Data that is processed only on the device and never leaves it is not "collected", so no location data type is declared.

State this in the optional free-text areas of the Play Console if asked: "Location is processed on-device only to find the nearest metro station. It is not collected, stored or shared."

## What the app does send

- Requests to FGV's public arrivals API (and static assets served with the app) to fetch live departures. These are HTTPS requests that carry **no user identifier, no account, no advertising ID, no device ID and no location**. The request names a station, not a person. As with any HTTPS request, FGV's servers can see the phone's IP address; the app does not add anything to it. Judgement call for the owner: the policy page does not say whether a bare IP address seen by a third-party server counts as a collected "Device or other IDs" item. The common reading is that it does not, because the app never reads or stores it, but if Google queries it, answer that FGV is a service endpoint receiving only a station id. The Netlify web build (not the Android apps) goes through a relay; Android calls `https://www.fgv.es/...` directly.
- No analytics, crash reporting, advertising or attribution SDKs. No cookies are used for tracking.

## Data types, one by one

| Category | Collected | Shared |
|---|---|---|
| Location (approximate, precise) | No (processed on device only) | No |
| Personal info, financial info, health, messages, photos, audio, files | No | No |
| App activity, web browsing | No | No |
| App info and performance (crash logs, diagnostics) | No | No |
| Device or other IDs | No | No |

## Local storage

The app keeps preferences on the phone only: language, text size and whether the install banner or launch location prompt has already been shown. Cached arrival data is also kept locally. None of it leaves the device.

## Security practices section

- Data is encrypted in transit: yes (HTTPS only; both apps set `usesCleartextTraffic=false` and a network security config; Play advises TLS/HTTPS).
- Data deletion request: not applicable (no data is collected). Uninstalling removes everything the app stores.
- Committed to follow the Play Families Policy: no, the app is not directed at children. Target audience in Play Console: choose 18 and over, or 13 and over; do not select any group under 13 (https://support.google.com/googleplay/android-developer/answer/9285070).
- Ads declaration: "No ads". Advertising ID declaration: the app does not use it and neither manifest declares `com.google.android.gms.permission.AD_ID`; answer "No" (https://support.google.com/googleplay/android-developer/answer/6048248).
- Independent security review: no.
