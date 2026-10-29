# Google Play listing

Apps: **Xarxa** (Capacitor, `com.jielei.Xarxa`) and **Xarxa** native (`com.jielei.xarxa.nativeapp`; use the same text, but publish only one of them under the name Xarxa, or differentiate the native title). Rules re-verified 2026-10-25, see [play-compliance-check.md](play-compliance-check.md). Category: Maps & Navigation. Free, no ads, no in-app purchases. Contact email and the privacy policy URL are set in Play Console (see [privacy-policy.md](privacy-policy.md)).

Play limits: title 30 characters, short description 80 (https://support.google.com/googleplay/android-developer/answer/9866151), full description 4000. Metadata policy (https://support.google.com/googleplay/android-developer/answer/9898842): no emoji or repeated special characters, no ranking or price claims, no brand logos without permission, no keyword stuffing, no anonymous testimonials; text and images must reflect the app accurately.

Impersonation and IP (https://support.google.com/googleplay/android-developer/answer/9888077): apps must not imply they are official or carry a brand's logo or name in the title or icon without rights. A disclaimer helps but does not cure a misleading title or logo, so the title no longer contains the "Metrovalencia" trademark, the first sentence of every description says the app is unofficial, and the icon and graphics must not use FGV or Metrovalencia logos. Naming the network in the description to say what the app covers is descriptive use.

## English (en-GB)

**Title (30):** Xarxa: Valencia metro live map

**Short description (80):**
Unofficial live map of the Valencia metro: trains, departures, nearest station.

**Full description:**

Xarxa is an unofficial, independent real-time map of the Metrovalencia metro and tram network. It is not affiliated with, endorsed by or operated by FGV or Metrovalencia.

- See trains moving along every line, positioned from the live timetable.
- Tap a station for its next departures, by platform and direction.
- Press the locate button to find the nearest station and how far it is. Your location stays on your phone.
- Search stations and lines, and filter the map to the lines you use.
- The map works from a basemap stored in the app, so it draws straight away.
- Light and dark themes that follow your phone, and adjustable text size.
- English and Spanish.
- No account, no ads, no analytics.

Departures come from FGV's public information service, so you need a data connection and a connection that FGV answers (it does in Spain). Xarxa is an independent project and is not affiliated with Ferrocarrils de la Generalitat Valenciana (FGV) or Metrovalencia.

## Español (es-ES)

**Título:** Xarxa: mapa metro Valencia

**Descripción breve (80):**
Mapa no oficial del metro de Valencia: trenes, salidas y estación más cercana.

**Descripción completa:**

Xarxa es un mapa en tiempo real, no oficial e independiente, de la red de metro y tranvía de Metrovalencia. No está afiliada, respaldada ni operada por FGV ni Metrovalencia.

- Mira los trenes circulando por todas las líneas, situados a partir del horario en vivo.
- Toca una estación para ver sus próximas salidas, por andén y sentido.
- Pulsa el botón de ubicación para encontrar la estación más cercana y a qué distancia está. Tu ubicación no sale de tu móvil.
- Busca estaciones y líneas, y filtra el mapa por las líneas que usas.
- El mapa funciona con un mapa base guardado en la app, así que se dibuja al instante.
- Tema claro y oscuro que sigue al del móvil, y tamaño de texto ajustable.
- Español e inglés.
- Sin cuenta, sin anuncios, sin analítica.

Las salidas vienen del servicio público de información de FGV, así que necesitas conexión de datos y una conexión a la que FGV responda (en España lo hace). Xarxa es un proyecto independiente y no está afiliado a Ferrocarrils de la Generalitat Valenciana (FGV) ni a Metrovalencia.

## Català (ca)

The app UI is English and Spanish only; a Catalan store listing is still useful for Valencia.

**Títol:** Xarxa: mapa metro València

**Descripció breu (80):**
Mapa no oficial del metro de València: trens, eixides i estació més pròxima.

**Descripció completa:**

Xarxa és un mapa en temps real, no oficial i independent, de la xarxa de metro i tramvia de Metrovalencia. No està afiliada, avalada ni operada per FGV ni Metrovalencia.

- Mira els trens circulant per totes les línies, situats a partir de l'horari en directe.
- Toca una estació per veure les pròximes eixides, per andana i sentit.
- Prem el botó d'ubicació per trobar l'estació més pròxima i a quina distància està. La teua ubicació no ix del mòbil.
- Busca estacions i línies, i filtra el mapa per les línies que fas servir.
- El mapa funciona amb un mapa base guardat en l'app, així que es dibuixa a l'instant.
- Tema clar i fosc que seguix el del mòbil, i mida de text ajustable.
- Castellà i anglés.
- Sense compte, sense anuncis, sense analítica.

Les eixides vénen del servei públic d'informació de FGV, així que necessites connexió de dades i una connexió a què FGV responga (a Espanya ho fa). Xarxa és un projecte independent i no està afiliat a Ferrocarrils de la Generalitat Valenciana (FGV) ni a Metrovalencia.

## Graphics

| Asset | Spec |
|---|---|
| App icon | 512 x 512, 32-bit PNG (alpha allowed), max 1024 KB; no ranking/price/category badges. Source: the iOS artwork `AppIcon-512@2x.png` (see development.md for the launcher icons already in `android/app/src/main/res/`). Do not add rounded corners or shadows; Play applies the mask. |
| Feature graphic | 1024 x 500, JPEG or 24-bit PNG (no alpha). Brand dark `#1D1D29` background, the Xarxa glyph and the name; keep text inside the central 70% because Play crops on some surfaces. |
| Phone screenshots | Minimum 2, maximum 8 per device type; JPEG or 24-bit PNG (no alpha); each side 320 to 3840 px; the longer side at most twice the shorter (1080 x 1920 and 1080 x 2400 both fit). For recommendation surfaces Google suggests 4 or more at 1080 px minimum. |
| 7-inch and 10-inch tablet screenshots | Optional, but needed to be featured on tablets. Same format rules; large-screen shots 1080 to 7680 px; 4 or more recommended for tablets and Chromebooks. All specs: https://support.google.com/googleplay/android-developer/answer/9866151 |

Suggested phone screenshot set (capture in both a dark and a light theme, use the Spanish UI for es-ES and English for en-GB):

1. Whole network with moving trains.
2. A station sheet with live departures (for example Xàtiva).
3. Locate button result: nearest station with distance.
4. Search with a line filter active.
5. Light theme.
6. The one-way east coast with the L4/L6 return leg.

Capture on an emulator with a Spanish location, as for the README demo. Remove status bar clutter (demo mode: `adb shell settings put global sysui_demo_allowed 1`).

## Content rating and declarations

- Content rating questionnaire: no violence, no user-generated content, no ads; expected rating Everyone.
- Target audience: pick age groups that do not include under-13s (for example 13+ or 18+); selecting any group that includes children triggers the Families Policy (https://support.google.com/googleplay/android-developer/answer/9285070). Keep the listing free of child-oriented imagery, or Google may reject the mismatch.
- Ads: none. News app: no. Government app: no (it is independent).
- Data safety: see [data-safety.md](data-safety.md). Permissions: see [permissions-rationale.md](permissions-rationale.md).
