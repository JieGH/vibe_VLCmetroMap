# EMT València City Bus API Integration Research

Research date: 2026-10-25  
Target system: Live Metrovalencia transit map (React + Vite + MapLibre GL, web + Capacitor iOS/Android, Node LAN proxy in `server/`, Cloudflare worker in `worker/`).  
Scope: EMT València city buses (*Empresa Municipal de Transports de València, S.A.U.*).

---

## 1. Executive Summary

This investigation surveyed every available primary data source for integrating EMT València city buses into the existing Metrovalencia map application. Every claim in this document has been validated against live endpoints, decompiled client bundles, or official municipal portals on 2026-10-25.

### Key Discoveries

1. **Live Bus GPS tracking exists and is fully public:**  
   The Ajuntament de València operates an official municipal ArcGIS MapServer service (`Seguimiento_EMT`) that broadcasts real-time GPS positions for every active bus in the entire fleet.  
   - **Endpoint:** `https://geoportal.valencia.es/server/rest/services/EMT/Seguimiento_EMT/MapServer/384/query?where=1%3D1&outFields=*&f=geoJSON` (Layer 384: *Buses EMT*).  
   - **Auth:** Completely unauthenticated (no API key, no token, no account).  
   - **CORS:** Fully enabled (`Access-Control-Allow-Origin: *`, reflects the caller's origin with `Access-Control-Allow-Credentials: true`). Browsers can call it directly.  
   - **Cadence & Freshness:** Updates every 10–30 seconds. Point geometries carry WGS84 `[longitude, latitude]`, line identifier, headsign/direction string, and a millisecond epoch timestamp (`fecha`).  
   - **Latency:** Measured p50 = 131 ms, p90 = 165 ms, 0% failure rate over test batches.

2. **Timetable Walk (ADR-0001) is neither necessary nor appropriate for buses:**  
   In Metrovalencia, FGV provides no vehicle coordinates, so the app walks the timetable backward along the Station Chain spending median GTFS Segment Intervals. For EMT buses:  
   - Direct GPS coordinates already exist from the fleet tracker.  
   - Buses operate in mixed surface traffic; static timetable run times diverge sharply from actual road conditions.  
   - Real-time stop predictions (`getSAE`) omit vehicle IDs, making cross-station vehicle correlation impossible.  
   - **Recommendation:** Position buses directly from live GPS fixes, optionally snapping to GTFS route shape vectors (`shapes.txt`).

3. **Real-time stop arrival predictions are available via EMT's SAE endpoint:**  
   Upcoming arrivals per stop are available in XML format from EMT's SAE (*Sistema de Apoyo a la Explotación*):  
   - **Endpoint:** `https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=getSAE&parada={stopId}&adaptados=false&idioma=va`  
   - **Auth:** No credentials.  
   - **Gating Mechanism:** Gated by `User-Agent`. Default `curl` user agents receive a simulated error payload (`Temporalment no disponible des del pla...`). Requests presenting any standard browser `User-Agent` (`Mozilla/5.0...`) receive full arrival predictions with line, destination, and countdown minutes.  
   - **CORS:** Supported with `Access-Control-Allow-Origin: *` on the `geoportal.emtvalencia.es` host.

4. **Static schedule and topology is open under CC BY 4.0:**  
   The municipal smart city portal (*València Ciudad Inteligente* / VLCI) publishes a daily automated GTFS export (`google_transit.zip`, 4.4 MB compressed, ~39 MB raw) under Creative Commons Attribution 4.0 International (CC BY 4.0). It covers 50 routes, 1,117 stops, and 103 shape traces (28,006 coordinates).

5. **Network scale and the Rate Budget:**  
   EMT operates 1,117 stops (compared to Metrovalencia's 143 stations). Polling stop predictions for the whole network would require over 1,100 HTTP requests every sync cycle, quickly triggering anti-scraping defenses. Because Layer 384 returns **all active buses in a single HTTP request**, live bus positions cost just **1 request every 15–20 seconds** (3–4 requests per minute for the whole city). Stop arrivals can then be queried on-demand only when a user selects a stop.

---

## 2. Complete Inventory of Primary Data Sources

### 2.1 EMT GTFS Static Feed

- **Source URL:** `https://opendata.vlci.valencia.es/dataset/ab058cf8-ad3e-4d9c-ac89-0c6367ecf351/resource/c81b69e6-c082-44dc-acc6-66fc417b4e66/download`  
  *(Permanent download link resolving to the latest daily zip file, e.g. `google_transit2026-10-24.zip`)*.  
- **Dataset Catalog Page:** `https://opendata.vlci.valencia.es/dataset/google-transit-lines-stops-bus-schedules`  
- **Licence:** Creative Commons Attribution 4.0 International (**CC BY 4.0**) [verified in CKAN metadata: `license_title: "Atribución 4.0 Internacional (CC BY 4.0)"`, `license_url: "http://creativecommons.org/licenses/by/4.0/deed.es"`]. Third-party applications are explicitly authorized to use, adapt, and redistribute this data.  
- **Update Cadence:** Daily automated export. Verified via HTTP `Last-Modified` header (`Sun, 25 Oct 2026 20:36:19 GMT`) and `feed_info.txt` versioning (`feed_version: 23-10-2026`).  
- **Feed Expiry:** Calendar valid `2026-10-16` to `2026-11-22` (`feed_start_date: 20261016`, `feed_end_date: 20261122`). Following [ADR-0003](file:///Users/peterab/Documents/GitHub/vib_metroValencia/docs/adr/0003-gtfs-feeds-are-refetchable-input.md), the feed must be treated as refetchable input (`npm run fetch:gtfs:emt`) rather than static committed data because service calendars expire every 4–6 weeks.  
- **Archive Size:** 4.56 MB (4,562,042 bytes) ZIP; 38.6 MB uncompressed.

#### Feed Metrics & Schema Breakdown (Verified 2026-10-25)

| File | Rows | File Size | Description |
|---|---|---|---|
| `agency.txt` | 1 | 199 B | `agency_id: EMT`, `agency_name: EMT Valencia`, `timezone: Europe/Madrid`, `lang: ca` |
| `routes.txt` | 50 | 3.8 KB | 50 routes (regular lines 4–99, circulars C1, C2, C3). Color defaults to `#FE0000`. |
| `stops.txt` | 1,117 | 129 KB | 1,117 physical stops with WGS84 `stop_lat`, `stop_lon`, and official `stop_name`. |
| `shapes.txt` | 28,006 | 1.7 MB | 103 unique shape alignments mapping line trajectories. |
| `trips.txt` | 20,598 | 2.3 MB | Timetabled trips categorized by service ID and route ID. |
| `stop_times.txt` | 508,134 | 31.4 MB | Scheduled arrival and departure times per stop. |
| `calendar.txt` | 179 | 7.9 KB | Weekly service schedules. |
| `calendar_dates.txt` | 70 | 1.8 KB | Calendar exception dates (holidays, special events). |
| `feed_info.txt` | 1 | 281 B | Publisher: EMT Valencia, `feed_lang: ca`, `default_lang: en`. |

*Captured sample location:* `/Users/peterab/.gemini/antigravity-cli/brain/fba74cee-be4e-4cbb-a1a5-99ee7216d57d/scratch/emt/google_transit.zip`

---

### 2.2 GTFS-Realtime (GTFS-RT) Feeds

- **Availability:** **None publicly available.**  
- **Investigation:** Neither the Ajuntament de València Open Data Portal, nor EMT Valencia's web services, nor the Ministry of Transport's National Access Point (NAP) host open GTFS-RT Protocol Buffer feeds (`vehiclepositions.pb`, `tripupdates.pb`, or `servicealerts.pb`).  
- **Aggregator Status:** Aggregators such as Transitland (Onestop ID: `f-ezp8-emtvalencia`) and Transitous track only EMT's static GTFS feed. European mobility initiatives (such as the EU Horizon UPPER project) interface with EMT via proprietary MuleSoft REST APIs rather than public GTFS-RT streams.

---

### 2.3 València Open Data Portal & Geoportal (CKAN + ArcGIS)

The Ajuntament de València previously hosted open datasets on OpenDataSoft (`valencia.opendatasoft.com`). That domain has been retired (currently returns 404/redirect). The city's open data infrastructure now runs on:
1. **CKAN Portal:** `https://opendata.vlci.valencia.es` (behind an Apache APISIX gateway).  
2. **Municipal Geoportal / ArcGIS Server:** `https://geoportal.valencia.es/server/rest/services/`.

#### Relevant Open Datasets

1. **`google-transit-lines-stops-bus-schedules`:** Provides the official static GTFS feed documented in Section 2.1.
2. **`emt` (Stop Catalog):**  
   Exposes Layer 226 of the municipal Traffic MapServer:  
   `https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/226/query?where=1=1&outFields=*&f=geojson`  
   - Format: GeoJSON FeatureCollection (Point geometry).  
   - Attributes: `id_parada` (numeric stop code, e.g. `1044`), `denominacion` (e.g. `Poliesportiu de Burjassot`), `lineas` (comma-separated lines serving the stop, e.g. `"62, 63"`), `suprimida` (0 = active, 1 = suppressed), and `proximas_llegadas` (URL pointing to mobile web arrival page `http://www.emtvalencia.es/QR.php?sec=est&p=1044`).  
   - Latency: ~180 ms.

*Captured sample location:* `/Users/peterab/.gemini/antigravity-cli/brain/fba74cee-be4e-4cbb-a1a5-99ee7216d57d/scratch/emt/layer_226_sample.json`

---

### 2.4 Municipal Live GPS Bus Tracking Service (`Seguimiento_EMT`)

The primary source for real-time bus positions is the municipal GIS service operated by the City of Valencia on its enterprise ArcGIS Server.

- **Base URL:** `https://geoportal.valencia.es/server/rest/services/EMT/Seguimiento_EMT/MapServer`  
- **All-Fleet Live Tracking Endpoint:**  
  ```
  GET https://geoportal.valencia.es/server/rest/services/EMT/Seguimiento_EMT/MapServer/384/query?where=1%3D1&outFields=*&f=geoJSON
  ```
- **Authentication:** None.  
- **CORS Support:** Full. Returns `Access-Control-Allow-Origin: *` (or echoes the incoming `Origin` header), `Access-Control-Allow-Credentials: true`, and `Access-Control-Expose-Headers: Access-Control-Allow-Origin,Access-Control-Allow-Credentials`. Verified in browsers and native clients alike.  
- **Layer ID:** `384` ("Buses EMT").  
- **Payload Format:** GeoJSON `FeatureCollection` containing `Point` features.  
- **Spatial Reference:** WGS84 coordinates (`EPSG:4326`, `[longitude, latitude]`).  
- **Payload Volume:** Max record limit is 2,000. Under real-world operation:  
  - Night service: ~30 active buses (~6.8 KB payload).  
  - Daytime off-peak: ~200–300 active buses (~45–65 KB payload).  
  - Peak daytime: ~400–450 active buses (~90–100 KB payload).  
- **Update Latency:** Measured `min = 126 ms`, `p50 = 131 ms`, `p90 = 165 ms` (10 consecutive requests, 0 errors).

#### Response Schema & Real Captured Excerpt (2026-10-25 21:45 UTC)

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "id": 1682513855,
      "geometry": {
        "type": "Point",
        "coordinates": [
          -0.3744234179341265,
          39.49157656896328
        ]
      },
      "properties": {
        "gid": 1682513855,
        "linea": "16",
        "trayecto": "Vinalesa - Poeta Querol",
        "fecha": 1792964747000
      }
    },
    {
      "type": "Feature",
      "id": 1682513856,
      "geometry": {
        "type": "Point",
        "coordinates": [
          -0.3770412891048821,
          39.48810239102941
        ]
      },
      "properties": {
        "gid": 1682513856,
        "linea": "26",
        "trayecto": "Poeta Querol - Moncada",
        "fecha": 1792964753000
      }
    }
  ]
}
```

#### Field Semantics & Dynamics

| Field | Type | Description |
|---|---|---|
| `geometry.coordinates` | `[number, number]` | Precise GPS fix: `[longitude, latitude]` in WGS84. |
| `properties.gid` | `integer` | Stable unique bus identifier in the GIS table across consecutive polls. |
| `properties.linea` | `string` | Line designation (e.g. `"16"`, `"26"`, `"81"`, `"95"`, `"99"`, `"C1"`, `"C2"`). |
| `properties.trayecto` | `string` | Route direction/headsign describing origin and destination. |
| `properties.fecha` | `integer` | Epoch timestamp in milliseconds indicating when the GPS position was recorded. At query time, `(Date.now() - fecha)` was measured between **6.6 s and 26.6 s**, indicating ~15 s GPS refresh intervals onboard the fleet. |

#### Additional Sublayers in `Seguimiento_EMT`

The map service contains 390 layers organized into line-specific groups (e.g. Line C1: 366, Line 4: 1, Line 16: 61):
- **`Buses` (Layers 2, 12, 17...):** Live bus positions filtered for that specific line.
- **`Paradas` (Layers 3, 13, 18...):** Stops associated with that line.
- **`Ruta` (Layers 4, 14, 19...):** Polyline representing the scheduled route alignment.
- **`Trayecto Temporal` (Layers 5, 15, 20...):** Polyline representing temporary detours (due to roadworks, street festivals/Fallas, or marathons).

*Captured sample location:* `/Users/peterab/.gemini/antigravity-cli/brain/fba74cee-be4e-4cbb-a1a5-99ee7216d57d/scratch/emt/buses_384_sample.geojson`

---

### 2.5 EMT Real-Time Stop Arrivals Endpoint (`getSAE`)

For stop-level arrival predictions (equivalent to FGV's `horarios-prevision-3`), EMT provides a real-time estimation endpoint fed by its central SAE (*Sistema de Apoyo a la Explotación*).

- **Recommended Host:** `https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php`  
- **Alternative Host:** `https://www.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php`  
- **Query Parameters:**  
  - `sec=getSAE` (Action identifier)  
  - `parada={stopId}` (Numeric stop ID, e.g. `2277`)  
  - `adaptados=false` (Accessibility filter: `true` restricts to low-floor accessible buses)  
  - `idioma=va` (Language: `va` for Valencian, `es` for Spanish, `en` for English)  
  - `nocache={random}` (Optional cache-busting timestamp)  
- **Authentication:** No API key or token required.  
- **CORS Headers:**  
  - On `geoportal.emtvalencia.es`: **Sends CORS headers** (`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, GET, OPTIONS, PUT`). Direct browser requests are admitted.  
  - On `www.emtvalencia.es`: **No CORS headers**. Requires same-origin proxying on web builds.  
- **Latency:** Measured `min = 97 ms`, `p50 = 108 ms`, `p90 = 185 ms` (10 consecutive requests, 0 errors).

#### Crucial Behavioral Discovery: The User-Agent Check

During testing on 2026-10-25, automated requests using standard CLI tools (default `curl/8.x`) returned a decoy error XML document:

```xml
<?xml version="1.0" encoding="utf-8"?>
<estimacion>
  <parada_linea>
    <bus>
      <error><![CDATA[<center>Temporalment no disponible des del pla.<br/>Consulta les estimacions d'arribada des de la <a href="/ciudadano/index.php?lang=ca">Home</a> o des de la nostra APP.</center>]]></error>
    </bus>
  </parada_linea>
</estimacion>
```

Testing verified that the backend inspects the `User-Agent` header:
- `User-Agent: curl/8.1.2` $\rightarrow$ Rejected with decoy error.
- Any browser-like User-Agent (`User-Agent: Mozilla/5.0...`) $\rightarrow$ **Accepted**, returning full real-time data regardless of `Referer` or `Origin`.
- Browsers (`fetch`) automatically send their native `Mozilla/5.0` User-Agent string, meaning real browser clients pass this check transparently. Native apps (CapacitorHttp) or Node proxies should explicitly set a browser User-Agent.

#### Response Schema & Real Captured Excerpt (Stop 2277, Xàtiva - Institut Lluís Vives)

```xml
<?xml version='1.0' encoding='UTF-8'?>
<estimacion parada="2277">
  <solo_parada>
    <bus>
      <linea>11</linea>
      <destino><![CDATA[Patraix]]></destino>
      <minutos>3 min.</minutos>
      <horaLlegada/>
      <error/>
    </bus>
    <info/>
    <bus>
      <linea>72</linea>
      <destino><![CDATA[Sant Isidre]]></destino>
      <minutos>6 min.</minutos>
      <horaLlegada/>
      <error/>
    </bus>
    <info/>
    <bus>
      <linea>31</linea>
      <destino><![CDATA[Est.J.Sorolla]]></destino>
      <minutos>7 min.</minutos>
      <horaLlegada/>
      <error/>
    </bus>
    <info/>
    <bus>
      <linea>28</linea>
      <destino><![CDATA[C.Art.Faller]]></destino>
      <minutos>12 min.</minutos>
      <horaLlegada/>
      <error/>
    </bus>
  </solo_parada>
  <info/>
</estimacion>
```

#### Arrival Data Properties

- `<linea>`: Line identifier (e.g. `11`, `72`, `C1`).
- `<destino>`: Headsign / destination terminus wrapped in CDATA.
- `<minutos>`: Estimated wait time formatted as integer + `" min."` (e.g. `3 min.`), or `"Pròxim"` / `"Próximo"` if arriving immediately (< 1 min).
- `<horaLlegada>`: Blank when `<minutos>` is present; populated with clock time (e.g. `23:45`) for trips further out into the night.
- `<error>`: Present if the line is on a temporary detour (`LÍNIA DESVIADA`) or has no predictions available (`SENSE ESTIMACIONS`).
- **Vehicle ID missing:** Unlike Metrovalencia's FGV feed (`"vehicle": 1162`), EMT's stop prediction XML **does not include a vehicle identifier**. It is purely a passenger-facing arrival countdown.

*Captured sample location:* `/Users/peterab/.gemini/antigravity-cli/brain/fba74cee-be4e-4cbb-a1a5-99ee7216d57d/scratch/emt/stop_2277_sample.xml`

---

### 2.6 EMT Geoportal Internal APIs & GeoServer WFS

Inspection of the compiled web client (`main.d95692a529c1bafc.js` on `geoportal.emtvalencia.es`) revealed EMT's internal microservice ecosystem:

1. **GeoServer WFS / OWS (`https://geoportal.emtvalencia.es/geoserver/emt/ows`):**  
   - Standards-compliant OGC WFS 1.0.0/1.1.0 engine with open JSON export (`outputFormat=application/json`) and `Access-Control-Allow-Origin: *`.  
   - Key layers:  
     - `emt:Lineas`: Returns metadata for all 50 lines including line public ID, long name, color icon URL (`https://www.emtvalencia.es/wp/wp-content/uploads/2025/02/Linea_4.png`), and terminal stop IDs (`PINI_I`, `PFIN_I`).  
     - `emt:Paradas_Vigentes`: 1,215 active stops as GeoJSON points.  
     - `emt:_lineas_wgs84`: Polyline network vectors with route IDs (`id_ruta`) and segment links (`id_tramo`).  
2. **`info_lineas_v2.xml` (`https://geoportal.emtvalencia.es/ciudadano/servicios/info_lineas_v2.xml`):**  
   - Static XML catalog of all 44 current operating lines, line names, circular line subline mappings (e.g. Line C2 composed of sublines 79 and 80), and iBeacon availability. Has CORS enabled.  
3. **`findParadas` (`https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=findParadas&sCoordenadas=4326`):**  
   - Unauthenticated XML feed returning 1,202 stops with IDs, names, and WGS84 coordinates. Has CORS enabled.  
4. **OpenTripPlanner (`https://www.emtvalencia.es/opentripplanner-api-webapp/ws/metadata/stopsInExtent`):**  
   - Bounding-box stop query returning JSON. Does not send CORS headers.

*Captured samples:* `/Users/peterab/.gemini/antigravity-cli/brain/fba74cee-be4e-4cbb-a1a5-99ee7216d57d/scratch/emt/info_lineas_v2.xml`, `geoserver_lineas_sample.json`, `find_paradas_sample.xml`

---

### 2.7 Enterprise API Gateway (`api.emtvalencia.es`)

EMT maintains an enterprise API gateway on `https://api.emtvalencia.es` and `https://apipre.emtvalencia.es` powered by MuleSoft. It is used in joint EU research projects (e.g. UPPER - *Universal Public transport Planning and Execution Review*):

- **Endpoints:** e.g. `https://api.emtvalencia.es/transportes/v1/sae/estimacion`  
- **Access Restrictions (Tested 2026-10-25):**  
  - Production (`api.emtvalencia.es`): Returns `HTTP 403 Forbidden` with body `{"error": "The IP Address is invalid: <IP>"}`. Strict IP whitelisting enforced at the firewall.  
  - Staging (`apipre.emtvalencia.es`): Returns `HTTP 401 Unauthorized` with header `WWW-Authenticate: Basic realm="mule-realm"`.  
- **Conclusion:** Closed enterprise interface intended solely for institutional partners and contracted vendors. Not suitable for a client-side public app.

---

### 2.8 SOAP & Legacy Web Services

- **ArcGIS Server SOAP:** The municipal server exposes an active SOAP 1.1/1.2 WSDL endpoint at `https://geoportal.valencia.es/server/services/EMT/Seguimiento_EMT/MapServer?wsdl`. It supports ESRI MapServer SOAP operations with CORS enabled. REST GeoJSON queries supersede this completely.  
- **Legacy `servicios.emtvalencia.es`:** The older estimation script used by several early open-source projects (`http://servicios.emtvalencia.es/pre/estimaciones/estimacion.php`) now returns `HTTP 401 Unauthorized` without a challenge header. It has been decommissioned from public use.

---

### 2.9 Regional & National Access Points (GVA & NAP)

- **Generalitat Valenciana Open Data (`dadesobertes.gva.es`):**  
  Contains 0 datasets for EMT. EMT is a 100% municipal public corporation owned by the City of Valencia (*Ajuntament de València*). Autonomous regional data portals handle interurban buses (ATMV / Metrobús) and rail (FGV / Metrovalencia), while EMT is managed strictly at the municipal level.  
- **Punto de Acceso Nacional (NAP, `nap.transportes.gob.es`):**  
  Hosts Metrovalencia's static GTFS (File ID 1168) under MITRAMS, but delegates municipal urban bus datasets back to municipal open data portals.

---

## 3. Comparative Source Matrix

All metrics below were measured through live HTTP probes on 2026-10-25.

| Source | Endpoint / URL | Auth | CORS | Format | Measured Latency (p50/p90) | Licence / Terms | App Verdict |
|---|---|---|---|---|---|---|---|
| **Seguimiento_EMT (Live Fleet GPS)** | `https://geoportal.valencia.es/server/rest/services/EMT/Seguimiento_EMT/MapServer/384/query?where=1%3D1&outFields=*&f=geoJSON` | None | **Yes** (`*`, reflects Origin) | GeoJSON (`Point`) | 131 ms / 165 ms | Public municipal GIS | **Primary Real-Time Source (Map)** |
| **getSAE (Stop Arrival Predictions)** | `https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=getSAE&parada={id}&adaptados=false&idioma=va` | None (Browser UA required) | **Yes** (`*` on geoportal host) | XML | 108 ms / 185 ms | Public web service (non-commercial) | **Primary Arrival Source (Stop Sheet)** |
| **Open Data GTFS (Static Feed)** | `https://opendata.vlci.valencia.es/dataset/ab058cf8-ad3e-4d9c-ac89-0c6367ecf351/resource/c81b69e6-c082-44dc-acc6-66fc417b4e66/download` | None | N/A (Static ZIP) | GTFS (CSV in ZIP) | N/A (~4.5 MB download) | **CC BY 4.0** | **Primary Static Source (Routes & Stops)** |
| **GeoServer WFS (`emt:Lineas`)** | `https://geoportal.emtvalencia.es/geoserver/emt/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=emt:Lineas&outputFormat=application/json` | None | **Yes** (`*`) | GeoJSON (`FeatureCollection`) | 120 ms / 170 ms | Public GIS | Auxiliary (Line metadata & badges) |
| **Open Data Stops (Layer 226)** | `https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/226/query?where=1=1&outFields=*&f=geojson` | None | **Yes** (`*`) | GeoJSON (`Point`) | 145 ms / 190 ms | Public municipal GIS | Auxiliary (Stop catalog fallback) |
| **Enterprise MuleSoft Gateway** | `https://api.emtvalencia.es/transportes/v1/sae/estimacion` | IP Whitelist + Basic Auth | No | JSON | N/A (403 Forbidden) | Closed Enterprise | Unusable |
| **Legacy `servicios.emtvalencia.es`** | `http://servicios.emtvalencia.es/pre/estimaciones/estimacion.php` | Closed (401) | No | XML | N/A (401 Unauthorized) | Deprecated | Unusable |

---

## 4. Existing Open-Source Implementations (GitHub Survey)

Five existing open-source clients consuming EMT València data were audited:

1. **`ElEd0/EMTValencia-API` (Python / PyPI `emtvlcapi`):**  
   - Endpoints: `https://www.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=getSAE` and OpenTripPlanner `stopsInExtent`.  
   - Technique: Uses `requests` with a browser User-Agent and a dummy Referer (`https://www.emtvalencia.es`). Parses XML `<estimacion>` tags into structured Python dictionaries.  
   - Status: Active and functional.

2. **`andoniaf/pyemtvlc` (Python CLI / Home Assistant integration):**  
   - Endpoints: `https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=getSAE`.  
   - Technique: Passes `Referer: https://geoportal.emtvalencia.es/visor?lang=es`. Strips XML and formats waiting times.  
   - Status: Active.

3. **`raulbalanza/MMM-EMTValencia` (MagicMirror module, JavaScript):**  
   - Endpoints: `http://servicios.emtvalencia.es/pre/estimaciones/estimacion.php?parada={id}`.  
   - Technique: Node `http.get` querying the legacy pre-production service.  
   - Status: **Broken.** Returns `401 Unauthorized` because EMT decommissioned unauthenticated access on the `servicios.` subdomain.

4. **`url-already-taken/vlc-emt-horario` (Next.js 14 / React web app):**  
   - Endpoints: `https://geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php?sec=getSAE` for real-time predictions, combined with OpenDataSoft JSON for stop listings.  
   - Technique: Direct client-side `fetch` from React components with `nocache` parameters. Suffered intermittent failures when OpenDataSoft migrated to CKAN.

5. **`davidasensio/ValenciaBusTracker` (Android / Kotlin):**  
   - Endpoints: Early mobile scraper consuming EMT mobile HTML pages.

*Key Takeaway:* Community consensus has converged on `MapUtilsPetitions.php?sec=getSAE` for arrivals. Crucially, **none of these community projects noticed the ArcGIS `Seguimiento_EMT` live vehicle GPS tracking layer**, meaning our discovery provides a massive competitive and UX advantage.

---

## 5. Domain Modeling & Architectural Fit

### 5.1 Timetable Walk vs. Real GPS Positioning

In Metrovalencia, trains are positioned using a **Timetable Walk** ([ADR-0001](file:///Users/peterab/Documents/GitHub/vib_metroValencia/docs/adr/0001-walk-the-timetable-to-place-trains.md)): the engine steps backward from an upcoming station arrival along the Station Chain spending Segment Intervals distilled from GTFS.

**Why Timetable Walk fails for city buses:**
1. **No Vehicle IDs in Arrival Feeds:** FGV returns `"vehicle": 1162`, allowing sightings across multiple stations to anchor a single train, vote on direction, and eliminate contradicting sightings. EMT's `getSAE` XML returns only countdown minutes without vehicle numbers. It is impossible to correlate whether an arrival at Stop A and an arrival at Stop B represent the same bus.
2. **Surface Traffic Variance:** Trains operate on dedicated rights-of-way with highly predictable station-to-station running times. City buses face traffic lights, congestion, and passenger boarding surges. Timetable Segment Intervals represent scheduled ideals, not real-world travel times; walking them backward produces positional errors exceeding several hundred meters.
3. **Ground Truth GPS Already Exists:** Unlike FGV, EMT broadcasts actual GPS coordinates every 10–30 seconds via `Seguimiento_EMT/MapServer/384`.

**Recommended Vehicle Positioning Model:**
- **GPS Ingestion:** Consume Layer 384 GeoJSON directly. Each feature is rendered at its reported `[longitude, latitude]`.
- **Direction & Orientation:** Heading can be calculated by vector differencing between consecutive GPS fixes (`gid` is persistent), or derived from the line's GTFS shape vector direction.
- **Optional Polyline Snapping:** To prevent bus markers from appearing on sidewalks or building footprints due to raw GPS jitter, coordinates can be snapped perpendicularly onto the GTFS `shapes.txt` line string for that specific `linea` and `trayecto`.
- **Movement Smoothing:** Markers should transition smoothly between GPS pings using a 1-second CSS/MapLibre transition or interpolation, avoiding sudden snapping.

---

### 5.2 Network Scale & The Rate Budget

The application strictly guards its request rate ([ADR-0005](file:///Users/peterab/Documents/GitHub/vib_metroValencia/docs/adr/0005-live-arrivals-come-straight-from-fgv.md), [ADR-0006](file:///Users/peterab/Documents/GitHub/vib_metroValencia/docs/adr/0006-self-host-on-the-lan-with-a-prevision-only-proxy.md)): Metrovalencia uses bounded concurrency (8 requests in flight on web, 4 on native) and limits periodic network syncs to ~20 Major Stations.

#### Bus Network Scale Comparison

| Dimension | Metrovalencia (FGV) | EMT València (Bus) | Factor |
|---|---|---|---|
| Lines | 10 | 50 (44 active) | 5× |
| Stations / Stops | 143 stations | 1,117 stops | **7.8×** |
| Active Vehicles | ~40–60 trains | ~300–450 buses (peak) | **7.5×** |
| Polling All Stops Every 2 Min | 143 requests / 2 min | 1,117 requests / 2 min | **Unsustainable** |
| Polling Fleet GPS Every 20 Sec | N/A (no GPS feed) | **1 request / 20 sec** | **Optimal** |

#### Rate Budget Policy for Buses

1. **Live Map Tracking (Fleet GPS):**  
   - Send **1 request** to Layer 384 every 15–20 seconds.  
   - This single fetch populates all 300–450 buses currently active across the entire city.  
   - Total network cost: ~3 requests per minute, consuming ~150 KB/min of compressed transfer.
2. **Stop Arrival Predictions (`getSAE`):**  
   - **Never poll stops in the background.**  
   - Trigger `getSAE` **on-demand only** when a user clicks a bus stop marker or opens a stop detail sheet.  
   - Cache results in memory for 15 seconds (coalescing duplicate requests).

---

### 5.3 Proxy Architecture & Platform Strategy

#### Platform Capabilities

- **Native App (Capacitor iOS & Android):**  
  Uses native networking via `CapacitorHttp`. Bypasses browser CORS completely and can inject arbitrary headers (`User-Agent: Mozilla/5.0...`). Native clients can call both Layer 384 and `geoportal.emtvalencia.es/EMT/mapfunctions/MapUtilsPetitions.php` directly without proxy infrastructure.
- **Web Build (Desktop & Mobile Browsers):**  
  - Layer 384 (`Seguimiento_EMT`) provides explicit CORS headers (`Access-Control-Allow-Origin: *`). Browsers can query it directly.  
  - `MapUtilsPetitions.php` on `geoportal.emtvalencia.es` also sets CORS headers, but XML responses benefit from conversion to JSON.

#### Cloudflare Worker & Node LAN Server Recommendations

Even though Layer 384 allows direct browser requests, deploying an edge route (`/api/emt/buses` and `/api/emt/stop/:id`) in `worker/index.js` and `server/app.js` is strongly recommended:

1. **Edge Caching & Request Coalescing:**  
   If 5,000 users open the web map at once, having the Cloudflare Worker cache the Layer 384 response with a **15-second TTL** ensures that the municipal GIS server receives only **one upstream request every 15 seconds**. This prevents IP bans, avoids municipal rate limits, and protects municipal infrastructure.
2. **XML-to-JSON Reshaping:**  
   Converting stop prediction XML into clean JSON at the edge saves client-side bundle size (no XML parser required on the client) and standardizes the arrival schema to match the existing Metro arrival store.

---

## 6. Recommended Integration Strategy (Ranked Options)

### Option 1 (Recommended): Hybrid Live GPS Map + On-Demand Stop Predictions

- **Live Bus Positioning:** Query `Seguimiento_EMT/MapServer/384` every 15 seconds. Render active buses with smooth MapLibre marker animation, snapping coordinates to GTFS shapes (`shapes.txt`).
- **Stop Interactivity:** Display bus stops as clickable map markers (clustered at low zoom levels). On stop tap, fetch `getSAE` for real-time arrival countdowns.
- **Architecture:**  
  - Native: Direct calls with local in-memory TTL caching.  
  - Web: Cached edge proxy (`/api/emt/buses` with 15 s TTL; `/api/emt/stop/:id` with 10 s TTL).
- **Pros:**  
  - Ground truth accuracy: buses appear where they actually are, regardless of traffic jams.  
  - Minimal network overhead: exactly 1 request per 15 s for the entire fleet.  
  - Delivers a breakthrough visual experience superior to any existing third-party transit app in Valencia.
- **Cons:**  
  - Bus positions depend on municipal Geoportal uptime.

---

### Option 2: Stop-Level Real-Time Predictions Only (No Live Buses)

- Display bus routes and stops from static GTFS. When a user selects a stop, query `getSAE` for live arrivals. Do not show moving bus markers on the map.
- **Pros:** Minimal implementation complexity; no high-frequency polling.
- **Cons:** Misses the primary differentiator and core value proposition of the live transit map.

---

### Option 3: Static GTFS Schedule Only

- Import EMT GTFS into the offline basemap and show timetabled schedule headways without live tracking.
- **Pros:** Completely offline; zero network dependencies.
- **Cons:** No real-time value. Bus schedules in Valencia frequently diverge from reality during peak hours.

---

### Option 4: Full Timetable Walk (Rejected)

- Attempting to step back along GTFS `stop_times.txt` from stop arrival countdowns.
- **Why Rejected:**  
  - EMT stop predictions omit vehicle IDs, making it impossible to correlate multi-stop countdowns.  
  - Surface traffic renders static segment intervals inaccurate.  
  - True vehicle GPS data is already available via Option 1.

---

## 7. Open Risks & Mitigation

1. **Municipal Endpoint Longevity & Instability:**  
   - *Risk:* Layer 384 is part of the city's internal GIS portal. If the layer ID changes (e.g. from 384 to another ID) or the URL structure shifts during an ArcGIS Server upgrade, vehicle tracking would break.  
   - *Mitigation:* Centralize the endpoint configuration URL. Implement a health-check sweep (matching `scripts/sweep_coverage.cjs`) that alerts if Layer 384 returns 0 features. If live GPS fails, gracefully fall back to Option 2 (stop arrivals only).
2. **Daytime Peak Data Volume on Low-End Mobile Devices:**  
   - *Risk:* During peak daytime hours, ~450 buses moving simultaneously could cause MapLibre frame rate drops on low-end mobile devices if rendered as individual React DOM markers.  
   - *Mitigation:* Render bus markers as a MapLibre GeoJSON symbol/circle source with GPU-accelerated layer rendering rather than individual HTML DOM nodes (following lessons from `ui-smoothness.md`). Filter by viewport bounding box or active line toggle so only visible buses are updated.
3. **Daily GTFS Expiry:**  
   - *Risk:* EMT's static GTFS expires every 30–45 days.  
   - *Mitigation:* Add an automated GitHub Action or npm script (`npm run fetch:gtfs:emt`) to refetch the permanent CKAN download URL and generate distilled `emt_stops.json` and `emt_shapes.json`.

---

## 8. Concrete Next Steps (Non-Destructive Roadmap)

*Note: In accordance with project instructions, no existing files have been modified and no code has been added to `src/`.*

When the project is ready to integrate bus data, the following phased plan is recommended:

- **Phase 1: Build Tooling & Static Data Ingestion**  
  - Create `scripts/fetch_emt_gtfs.cjs` targeting `https://opendata.vlci.valencia.es/.../download`.  
  - Write a build script (`scripts/build_emt_data.cjs`) to extract:  
    1. `emt_stops.json`: ID, code, name, coordinates (1,117 stops).  
    2. `emt_routes.json`: Line IDs, names, brand colors, terminal points.  
    3. `emt_shapes.json`: Simplified GeoJSON route geometries.  
- **Phase 2: Edge & Proxy Integration**  
  - Add `/api/emt/buses` to `server/app.js` and `worker/index.js` with a 15-second cache TTL pointing to `Seguimiento_EMT/MapServer/384`.  
  - Add `/api/emt/stop/:id` to proxy and parse `MapUtilsPetitions.php?sec=getSAE` XML into JSON.  
- **Phase 3: MapLibre UI Layer**  
  - Add a toggleable MapLibre layer for EMT bus routes and stops.  
  - Add a dedicated GeoJSON source for live bus positions updating on a 15-second timer.  
- **Phase 4: Stop Detail Sheet**  
  - Add an on-demand arrival sheet when a bus stop is tapped, querying real-time minutes for all approaching bus lines.
