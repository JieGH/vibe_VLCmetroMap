<table>
  <tr>
    <td valign="middle" width="55%">
      <h1><img src="public/favicon.svg" width="72" height="72" align="absmiddle" alt=""> Xarxa</h1>
      <p>
        <a href="https://xarxa.net"><img src="https://img.shields.io/badge/Open%20the%20map-xarxa.net-2563EB?style=for-the-badge&logo=googlemaps&logoColor=white" alt="Open the live map at xarxa.net"></a>
        &nbsp;
        <a href="https://github.com/JieGH/vibe_VLCmetroMap/releases/latest/download/Xarxa-capacitor.apk"><img src="https://img.shields.io/badge/Capacitor-Download%20the%20app-119EFF?style=for-the-badge&logo=capacitor&logoColor=white" alt="Download the Capacitor app"></a>
      </p>
      <p>
        <a href="https://github.com/JieGH/vibe_VLCmetroMap/releases/latest"><img src="https://img.shields.io/github/v/release/JieGH/vibe_VLCmetroMap?label=release" alt="Latest release"></a>
        <a href="https://github.com/JieGH/vibe_VLCmetroMap/commits/main"><img src="https://img.shields.io/github/check-runs/JieGH/vibe_VLCmetroMap/main?nameFilter=Workers%20Builds%3A%20vibe-vlcmetromap&label=Cloudflare%20build" alt="Cloudflare build status of the website"></a>
      </p>
      <p>
        <i>EN</i> · Where every Valencia metro train is, right now, and when the next one reaches you, with live city-bus arrivals beside it. Honest by design: trains are drawn from live predictions and fade when their position becomes a guess.<br>
        <i>ES</i> · Dónde está cada tren del metro de Valencia, ahora mismo, y cuándo llega el próximo hasta ti, con las llegadas del autobús urbano en directo a su lado. Honesto por diseño: los trenes se dibujan con predicciones en directo y se difuminan cuando su posición pasa a ser una suposición.<br>
        <i>VA</i> · On està cada tren del metro de València, ara mateix, i quan t'arriba el pròxim, amb les arribades de l'autobús urbà en directe al costat. Honest per disseny: els trens es dibuixen amb prediccions en directe i es difuminen quan la posició passa a ser una suposició.
      </p>
    </td>
    <td valign="middle" align="center" width="45%">
      <img src="docs/demo-phone.gif" width="300" alt="Screen recording of Xarxa on an iPhone: a pin dropped near Grau - La Marina shows live metro departures and nearby EMT bus stops, then the Xàtiva and Alameda stations open with their next trains, and finally the Grau - La Marina station">
    </td>
  </tr>
</table>

## What you can do

- **Watch trains move** live on the real track
- **Nearest station in one tap**, with walk time (location never leaves your phone)
- **Live countdowns** for any station
- **City buses too**: live EMT València arrivals at any stop, loaded when you tap it
- **Metro and bus side by side**: drop a pin or find yourself and see the nearby trains (within 450 m) and buses (within 300 m) in one view, a few soonest departures per stop; bus times fill in nearest stop first with a small wave of dots while they load, and the map opens close enough that one tap drops a pin
- **Follows you as you walk**: while the app is open your position keeps updating, kept gentle on the battery (nothing runs in the background)
- **Clearer bus stops**: stops for each direction are drawn apart, and thin out to one small dot per street when you zoom out, and show the EMT logo and line numbers as you zoom in
- **Search stations and bus stops** by name or stop number; before you type it suggests the buses that run between the main train stations and the city centre, and picking a result opens it just like tapping it on the map
- **Follow one line** to highlight it on the map
- **Light, dark or auto** (auto by default, following your device), bigger text (up to XXL) that scales the map markers too; on a wide desktop window the sidebar opens by default, wider, with Large text
- **Departures board** for a spare screen: [?mode=dashboard](https://xarxa.net/?mode=dashboard)
- **3 languages**: English, Español, Valencià
- **Poor connection OK**: the map is stored with the app

---

## Two ways to use it

| | |
|---|---|
| **On the web** | Go to **[xarxa.net](https://xarxa.net)**. Nothing to install: it works in any phone or computer browser, in English, Spanish and Valencian. |
| **The Capacitor app** | **[Download the app](https://github.com/JieGH/vibe_VLCmetroMap/releases/latest/download/Xarxa-capacitor.apk)** (a free APK file). The app is not on Google Play yet, so Android will ask you to allow the install. Steps below. |
| **On iPhone** | There is no iPhone app yet. Open [xarxa.net](https://xarxa.net) in Safari, tap Share, then **Add to Home Screen**: it then opens like an app. |

## Installing the Capacitor app

1. On your phone, open the **[download link](https://github.com/JieGH/vibe_VLCmetroMap/releases/latest/download/Xarxa-capacitor.apk)**.
2. When it has finished downloading, open the file.
3. If Android asks, allow installing from your browser. You only do this once.

It needs Android 7 or newer. It follows your phone's light or dark theme, and asks before using your location. Prefer automatic updates? [Obtainium](https://obtainium.imranr.dev) can install and update it straight from this page: add `https://github.com/JieGH/vibe_VLCmetroMap` and set the APK filter to `.*capacitor\.apk`.

What changed in each version: **[Releases](https://github.com/JieGH/vibe_VLCmetroMap/releases)**.

## How the trains are placed

Metrovalencia publishes when a train is due at a station, but not where it is. Xarxa works that out: it takes the live predictions and walks each train backwards along the real rail geometry, to the point those predictions imply. Against live data this is about 130 m off on average. The details are in [DEVELOPERS.md](DEVELOPERS.md).

## Questions

- **Is it official?** No. It is an independent project, not affiliated with or endorsed by [FGV](https://www.fgv.es), which owns the Metrovalencia name, brand and data, nor by EMT València, whose public bus arrival times it shows.
- **How does it get the bus times?** Only when you ask: tapping a stop, or opening a pin or your own location, fetches that stop's arrivals from EMT València's public service, briefly cached. Xarxa never polls all 1,155 stops in the background.
- **What about my privacy?** No accounts, no analytics, no tracking. Your location is only used on your device to find the nearby stations and stops, and to follow you while the app is open. See the [privacy policy](docs/capacitor/privacy-policy.md).
- **Something is wrong or missing?** [Open an issue](https://github.com/JieGH/vibe_VLCmetroMap/issues), or write to the author from the menu inside the app.
- **Where is the old address?** The previous site (`tangerine-panda-1aeea5.netlify.app`) now just points visitors to xarxa.net.

## For developers

Building, running, hosting, data sources, architecture and releasing: **[DEVELOPERS.md](DEVELOPERS.md)**.

## Credits and license

Made in Valencia by Jie Lei. Code: source-available, all rights reserved, see [LICENSE](LICENSE); reuse, redistribution or modification needs written permission. Thanks to FGV for the live data, to OpenStreetMap's contributors for the track geometry, and to Protomaps for the offline map. FGV's data, OpenStreetMap's and the Metrovalencia brand carry their own terms.
