import React, { useEffect, useRef } from 'react';
import { Map as MapLibreMap, Marker, LngLatBounds, addProtocol, setWorkerUrl } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { noLabels, labels } from 'protomaps-themes-base';
import 'maplibre-gl/dist/maplibre-gl.css';
import metroData from '../data/metro_lines.json';
import gtfsData from '../data/gtfs_expanded.json';
import imageLineColors from '../data/line_colors_from_image.json';
import lineRenderConfig from '../data/line_render_config.js';
import {
  DEFAULT_MAP_ZOOM,
  DEFAULT_MAP_CENTER,
  ZERO_PADDING,
  calculateFocusZoom,
  calculateUnfocusCamera,
  panelAwarePadding as computePanelPadding,
} from '../utils/mapCamera';

// Line 4's OSM-derived geometry is fetched rather than imported, so its 209 KB
// stays out of the JS chunk. It lives in public/ because that is the only
// directory Vite copies into a build verbatim — served from src/ it resolved in
// dev and 404'd in production, where the catch below swallowed the failure and
// line 4 silently fell back to the coarser metro_lines.json geometry.
// Failing to load it is not fatal — line 4 falls back to the metro_lines.json
// alignment — but it must not be silent, because that silence is exactly how
// the production 404 went unnoticed.
// MapLibre derives its worker's URL from import.meta.url, which resolves to a
// file Vite's bundler never writes (maplibre-gl is bundled into the app chunk,
// not kept as its own file) — a build-only 404 that a dev server's raw module
// resolution never hits, which is why this only ever broke in production and
// the native app. Bundling the worker as a Vite asset (?worker&url) was tried
// first and loads without error but never actually starts: MapLibre requests
// it as { type: 'module' }, and Vite's default worker output format is IIFE —
// a mismatch that fails silent, with no console error and no worker activity,
// rather than throwing. Pointing at an unbundled, unmodified copy in public/ —
// the one directory Vite copies verbatim, already used for line4's OSM geojson
// for the same reason — sidesteps both failure modes entirely. Re-copy
// public/vendor/maplibre/*.mjs from node_modules/maplibre-gl/dist/ if the
// maplibre-gl version ever changes.
setWorkerUrl('/vendor/maplibre/maplibre-gl-worker.mjs');

// The offline basemap: one PMTiles archive of the Valencia region, read
// straight off disk in the native app and by HTTP range request on the web, so
// a visitor pulls the handful of tiles they look at rather than all 34 MB.
//
// Vector rather than raster because the complaint that started this was zoom:
// every raster provider that needs no API key stops having real tiles around
// zoom 16, and CARTO's keyless tiles come back stamped "API KEY REQUIRED".
// Vector tiles have no such ceiling — the archive stops at zoom 15 and MapLibre
// renders it sharp at 20, because it is drawing geometry rather than stretching
// pixels.
// Absolute rather than root-relative: MapLibre rejects a relative sprite URL
// outright ("must be absolute"), and having the archive, glyphs and sprite all
// resolve the same way keeps the native app — served from capacitor://localhost
// rather than http — working off the same three lines.
const BASEMAP_DIR = typeof window !== 'undefined' && window.location
  ? `${window.location.origin}/basemap`
  : '/basemap';
const BASEMAP_ARCHIVE = `${BASEMAP_DIR}/valencia.pmtiles`;

addProtocol('pmtiles', new Protocol().tile);

let line4Osm = null;
if (typeof window !== 'undefined') {
  try {
    // eslint-disable-next-line no-undef
    const response = await fetch('/line4_osm.geojson');
    if (response.ok) {
      line4Osm = await response.json();
    } else {
      console.warn(
        `Line 4 OSM geometry unavailable (HTTP ${response.status}); ` +
        'falling back to the coarser metro_lines.json alignment.'
      );
    }
  } catch (error) {
    console.warn('Line 4 OSM geometry failed to load; falling back to metro_lines.json.', error);
  }
}

let OFFLINE_BASEMAP_AVAILABLE = false;
if (typeof window !== 'undefined') {
  try {
    // eslint-disable-next-line no-undef
    const probe = await fetch(BASEMAP_ARCHIVE, { headers: { Range: 'bytes=0-0' } });
    OFFLINE_BASEMAP_AVAILABLE = probe.ok;
    if (!probe.ok) {
      console.warn(
        `Offline basemap unavailable (HTTP ${probe.status}); falling back to online raster tiles, ` +
        'which stop resolving past zoom 16. Run `npm run fetch:basemap`.'
      );
    }
  } catch (error) {
    console.warn('Offline basemap unreachable; falling back to online raster tiles.', error);
  }
}

import arrivalStore, { NETWORK_SYNC_INTERVAL_MS, STATION_ID_MAP } from '../services/arrivalStore';
import trainPositionEngine from '../services/trainPositionEngine';
import { renderStationHighlight } from '../utils/focusNode';
import { getDistance, nearestFeature, nearestPointOnPath } from '../utils/geoUtils';

// ─── Static data (computed once at module load) ────────────────────────────────
const allFeatures = [
  ...metroData.features,
  ...(gtfsData && gtfsData.features ? gtfsData.features : []),
];

// Chaikin subdivision to smooth a polyline. Returns a new array of coordinates.
const chaikinSmooth = (coords, iterations = 2) => {
  if (!coords || coords.length < 3) return coords;
  let pts = coords.map(c => c.slice());
  for (let it = 0; it < iterations; it++) {
    const next = [];
    next.push(pts[0]);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const q = [p0[0] * 0.75 + p1[0] * 0.25, p0[1] * 0.75 + p1[1] * 0.25];
      const r = [p0[0] * 0.25 + p1[0] * 0.75, p0[1] * 0.25 + p1[1] * 0.75];
      next.push(q, r);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
};

// Deduplicate line features by `properties.line` preferring `metroData` entries.
const lineById = new Map();
// First add metroData lines (they appear first in allFeatures already)
for (const f of metroData.features.filter(f => f.geometry && f.geometry.type === 'LineString')) {
  if (f.properties && f.properties.line) lineById.set(String(f.properties.line), { ...f });
}
// If an OSM-derived Line 4 file is present, prefer its longest LineString as the authoritative Line 4 geometry
try {
  if (line4Osm && Array.isArray(line4Osm.features) && line4Osm.features.length) {
    const longest = line4Osm.features.reduce((best, cur) => {
      if (!cur.geometry || cur.geometry.type !== 'LineString') return best;
      const len = cur.geometry.coordinates.length;
      if (!best || len > best.len) return { feat: cur, len };
      return best;
    }, null);
    if (longest && longest.feat) {
      const f = { ...longest.feat };
      f.properties = { ...f.properties, line: '4', source: 'osm' };
      lineById.set('4', f);
    }
  }
} catch (e) { /* ignore */ }
// Then add GTFS lines only if not present or if configured to prefer GTFS for a given line
for (const f of (gtfsData && gtfsData.features ? gtfsData.features : []).filter(f => f.geometry && f.geometry.type === 'LineString')) {
  const id = f.properties && f.properties.line && String(f.properties.line);
  if (!id) continue;
  const preferGTFS = Array.isArray(lineRenderConfig.useGTFS) && lineRenderConfig.useGTFS.map(String).includes(id);
  if (preferGTFS) {
    lineById.set(id, { ...f });
  } else if (!lineById.has(id)) {
    lineById.set(id, { ...f });
  }
}

let lineFeatures = Array.from(lineById.values());
// Ensure each feature has a resolved `color` property (image override > feature.color > default)
for (const f of lineFeatures) {
  const lid = String(f.properties.line);
  const override = imageLineColors && imageLineColors[lid];
  f.properties = { ...f.properties, color: override || f.properties.color || '#888888', offset: 0 };
}
// Smooth configured lines so their rendered curves match.
const smoothingApplyTo = (lineRenderConfig && lineRenderConfig.smoothing && Array.isArray(lineRenderConfig.smoothing.applyTo))
  ? lineRenderConfig.smoothing.applyTo.map(String)
  : ['3', '4', '9'];
const smoothingIterations = (lineRenderConfig && lineRenderConfig.smoothing && Number.isFinite(lineRenderConfig.smoothing.iterations))
  ? lineRenderConfig.smoothing.iterations
  : 2;
lineFeatures = lineFeatures.map((f) => {
  const id = f.properties && String(f.properties.line);
  if (smoothingApplyTo.includes(id)) {
    const coords = f.geometry && f.geometry.coordinates;
    if (coords && coords.length > 4) {
      try {
        const smoothed = chaikinSmooth(coords, smoothingIterations);
        return { ...f, geometry: { ...f.geometry, coordinates: smoothed } };
      } catch (e) {
        return f;
      }
    }
  }
  return f;
});
// gtfs_expanded.json carries every station on the network, so it is the single
// source here; metro_lines.json only contributes points it alone knows about.
const gtfsStations = (gtfsData && gtfsData.features)
  ? gtfsData.features.filter(f => f.geometry.type === 'Point')
  : [];
const gtfsStationNames = new Set(gtfsStations.map(f => f.properties.name));
const rawStations = [
  ...gtfsStations,
  ...metroData.features.filter(
    f => f.geometry.type === 'Point' && !gtfsStationNames.has(f.properties.name)
  ),
];

// How far a Station is allowed to be from its Line before snapping it there
// would be a lie rather than a correction. Beyond this it is an Off-Track
// Station — the geometry omits the branch it actually sits on (ADR-0002), and
// dragging it onto the wrong track would put it visibly nowhere near where it
// is. Fira València and Ll. Llarga - Terramelar, 642 m and 546 m out, are the
// two that stay where the data puts them.
const SNAP_LIMIT_M = 200;

// Two features this close together, resolving to the same station in the live
// API, are one Station spelled two ways rather than two Stations.
const DUPLICATE_LIMIT_M = 150;

const stationApiId = (properties) => {
  if (!properties || !properties.name) return null;
  const direct = STATION_ID_MAP[properties.name];
  if (direct !== undefined) return Number(direct);
  const lower = STATION_ID_MAP[properties.name.toLowerCase().trim()];
  return lower === undefined ? null : Number(lower);
};

// "Pl. Espanya" and "Plaça Espanya" are 99 m apart in the data and both resolve
// to station 51 in the live API: one interchange drawn as two dots, each
// showing half its Lines. Merged into whichever came from GTFS — the single
// source above — carrying the union of both features' Lines.
const mergeDuplicateStations = (stations) => {
  const kept = [];
  const byApiId = new Map();

  for (const station of stations) {
    const apiId = stationApiId(station.properties);
    const twin = apiId === null ? null : byApiId.get(apiId);

    if (twin && getDistance(twin.geometry.coordinates, station.geometry.coordinates) < DUPLICATE_LIMIT_M) {
      const lines = new Set([
        ...(twin.properties.lines || []),
        ...(station.properties.lines || []),
      ]);
      twin.properties = { ...twin.properties, lines: [...lines] };
      continue;
    }

    // Cloned rather than mutated in place: trainPositionEngine imports the same
    // gtfs_expanded.json objects, and moving a Station under it would shift
    // every position walked through that Station.
    const clone = {
      ...station,
      properties: { ...station.properties },
      geometry: { ...station.geometry, coordinates: station.geometry.coordinates.slice() },
    };
    kept.push(clone);
    if (apiId !== null && !byApiId.has(apiId)) byApiId.set(apiId, clone);
  }

  return kept;
};

// Station coordinates come from the GTFS Feed and the track alignment from OSM,
// two surveys that disagree by tens of metres — Xàtiva sits 45 m off the line
// it serves, which at station zoom is a station floating beside its own track.
// Snapping the marker onto the alignment the map actually draws is a rendering
// correction only: the Timetable Walk keeps projecting from the feed's own
// coordinates, so nothing about where trains are placed changes.
const snapStationToItsLines = (station) => {
  const lines = station.properties.lines || [];
  let best = null;

  for (const lineId of lines) {
    const geometry = lineCoordsById.get(String(lineId));
    if (!geometry) continue;
    const candidate = nearestPointOnPath(geometry, station.geometry.coordinates);
    if (candidate && (!best || candidate.distance < best.distance)) best = candidate;
  }

  if (!best || best.distance > SNAP_LIMIT_M) return station;

  station.geometry.coordinates = best.coordinates;
  return station;
};

const lineCoordsById = new Map(
  lineFeatures
    .filter(f => f.geometry && f.geometry.type === 'LineString')
    .map(f => [String(f.properties.line), f.geometry.coordinates])
);

const stationFeatures = mergeDuplicateStations(rawStations).map(snapStationToItsLines);

// Snapped positions are what the map draws, so a Station handed in from
// somewhere that has not snapped it — userLocation's Nearest Station, say —
// still has to be drawn and framed at the same place as its own dot.
const snappedByName = new Map(stationFeatures.map(f => [f.properties.name, f]));
const snappedCoordinates = (station) => {
  const snapped = station && snappedByName.get(station.properties.name);
  return snapped ? snapped.geometry.coordinates : station.geometry.coordinates;
};
const lineGeoJSON    = { type: 'FeatureCollection', features: lineFeatures };

// Build a color lookup from line id → color from actual GeoJSON data,
// allowing overrides from the sampled image colors file.
const lineColorMap = Object.fromEntries(
  lineFeatures.map(f => [f.properties.line, (imageLineColors && imageLineColors[f.properties.line]) ? imageLineColors[f.properties.line] : f.properties.color])
);

const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY;

// CARTO tiles (used when API key is provided, appending ?api_key=...)
const getCartoTiles = (variant) => {
  const keyParam = cartoApiKey ? `?api_key=${cartoApiKey}` : '';
  return [
    `https://a.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png${keyParam}`,
    `https://b.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png${keyParam}`,
    `https://c.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png${keyParam}`,
    `https://d.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}.png${keyParam}`,
  ];
};

// Clean, keyless dark and light canvas tiles (Esri Gray Canvas)
// Used when no CARTO API key is provided so tiles never display "API KEY REQUIRED" watermarks
const KEYLESS_DARK_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
];
const KEYLESS_LIGHT_TILES = [
  'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}'
];

const DARK_TILES = cartoApiKey ? getCartoTiles('dark_all') : KEYLESS_DARK_TILES;
const LIGHT_TILES = cartoApiKey ? getCartoTiles('light_all') : KEYLESS_LIGHT_TILES;
const TILE_ATTRIBUTION = cartoApiKey ? '© OpenStreetMap © CARTO' : '© OpenStreetMap © Esri';

// The Line layers, as a template both basemaps below clone. They sit above the
// basemap's own geometry and below its labels, so a street name stays readable
// where a Line crosses it while the Lines themselves are never buried under a
// road. Cloned rather than shared for the reason given at styleFor.
const metroLayers = [
  {
    id: 'metro-casing',
    type: 'line',
    source: 'metro-lines',
    paint: {
      'line-color': '#000000',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        6, 1.2,
        8, 1.8,
        10, 2.6,
        11.5, 3.4,
        13, 4.6,
        15, 6.2,
        17, 8.5,
        19, 11.0
      ],
      'line-opacity': 0.35,
      'line-offset': [
        'interpolate', ['linear'], ['zoom'],
        6, 0,
        8, ['*', ['get', 'offset'], 0.15],
        10, ['*', ['get', 'offset'], 0.35],
        11.5, ['*', ['get', 'offset'], 0.6],
        13, ['*', ['get', 'offset'], 0.85],
        15, ['*', ['get', 'offset'], 1.1],
        17, ['*', ['get', 'offset'], 1.4],
        19, ['*', ['get', 'offset'], 1.8]
      ]
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  },
  {
    id: 'metro-fill',
    type: 'line',
    source: 'metro-lines',
    paint: {
      'line-color': ['get', 'color'],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        6, 0.75,
        8, 1.2,
        10, 1.8,
        11.5, 2.4,
        13, 3.4,
        15, 4.8,
        17, 6.8,
        19, 9.0
      ],
      'line-offset': [
        'interpolate', ['linear'], ['zoom'],
        6, 0,
        8, ['*', ['get', 'offset'], 0.15],
        10, ['*', ['get', 'offset'], 0.35],
        11.5, ['*', ['get', 'offset'], 0.6],
        13, ['*', ['get', 'offset'], 0.85],
        15, ['*', ['get', 'offset'], 1.1],
        17, ['*', ['get', 'offset'], 1.4],
        19, ['*', ['get', 'offset'], 1.8]
      ]
    },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  },
];

// Raster fallback, used only when the offline archive is missing. Esri's Gray
// Canvas stops having real tiles at zoom 16 and serves a "map data not yet
// available" placeholder above it, which is exactly why the offline vector
// basemap exists — but a clone that has not run `npm run fetch:basemap` should
// still get a map rather than a void.
const buildRasterStyle = (tiles, tileSourceId) => ({
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    [tileSourceId]: { type: 'raster', tiles, tileSize: 256, attribution: TILE_ATTRIBUTION, maxzoom: 16 },
    'metro-lines': { type: 'geojson', data: lineGeoJSON, tolerance: 0.6, buffer: 128 },
  },
  layers: [
    { id: `${tileSourceId}-tiles`, type: 'raster', source: tileSourceId },
    ...structuredClone(metroLayers),
  ],
});

// Protomaps' basemap flavours. 'white' gives the clean near-white ground the
// app already had; 'dark' rather than 'black' for the other, because 'black'
// paints earth #141414 under roads #333333 and the structure of the city simply
// does not survive that little contrast — it reads as an empty screen with
// Lines floating on it. Each flavour names its own sprite file.
const THEME_FLAVOURS = { dark: 'dark', light: 'white' };

const buildVectorStyle = (flavour) => ({
  version: 8,
  glyphs: `${BASEMAP_DIR}/fonts/{fontstack}/{range}.pbf`,
  sprite: `${BASEMAP_DIR}/sprites/${flavour}`,
  sources: {
    protomaps: {
      type: 'vector',
      url: `pmtiles://${BASEMAP_ARCHIVE}`,
      attribution: '© OpenStreetMap · Protomaps',
    },
    'metro-lines': { type: 'geojson', data: lineGeoJSON, tolerance: 0.6, buffer: 128 },
  },
  // Basemap geometry, then the Lines, then the basemap's labels on top.
  layers: [
    ...noLabels('protomaps', flavour),
    ...structuredClone(metroLayers),
    ...labels('protomaps', flavour, 'en'),
  ],
});

// Built fresh on every call rather than held as two module-level constants.
// MapLibre takes ownership of the style object it is handed and mutates it, and
// StrictMode mounts this component twice in dev: the first map consumed the
// shared object and the second one — the live one — got the leftovers, so the
// basemap and the Lines both silently failed to draw while the console stayed
// clean. Toggling the theme appeared to fix it only because that handed over
// the other, still-untouched object.
const styleFor = (theme) => (OFFLINE_BASEMAP_AVAILABLE
  ? buildVectorStyle(theme === 'dark' ? THEME_FLAVOURS.dark : THEME_FLAVOURS.light)
  : buildRasterStyle(
    theme === 'dark' ? DARK_TILES : LIGHT_TILES,
    theme === 'dark' ? 'basemap-dark' : 'basemap-light'
  ));

// The CSS opacity a vehicle marker is drawn at. For a live train that is its
// Position Confidence; a Simulated Train keeps its own flat value, because
// hollow and dashed is a different claim about a train, not a fainter one.
const vehicleOpacity = (v) =>
  (v.isLive ? (v.positionConfidence ?? 1) : 0.55).toFixed(2);

// Says in the reader's words — not the model's — why a marker is drawn faint,
// covering both causes: how far the walk had to reach, and how long since the
// API last confirmed the train.
const describePositionDoubt = (v) => {
  if (!v.isLive || v.positionConfidence >= 1) return '';
  const confirmed = v.secondsUnheard < 60
    ? 'just now'
    : `${Math.round(v.secondsUnheard / 60)} min ago`;
  const basis = v.isDeadReckoned
    ? 'position estimated past its last prediction'
    : `position estimated ±${v.positionUncertaintyMetres} m`;
  return ` • ${basis}, last confirmed ${confirmed}`;
};


/** Picks the first line's color for a station marker border */
const stationBorderColor = (st) => {
  const lines = st.properties.lines || [];
  return lines.length > 0 ? (lineColorMap[lines[0]] || '#aaaaaa') : '#aaaaaa';
};

// ─── Component ────────────────────────────────────────────────────────────────

// The radius, in screen pixels, within which a tap counts as meaning a Station.
// A Station dot is drawn 10 px across, which is a quarter of the 44 px Apple
// asks for as a minimum touch target and the reason the map had to be zoomed
// right in before a station could be hit at all. 22 px gives that 44 px target
// without drawing anything bigger.
//
// Enlarging each marker's own hit box would have been the obvious fix and the
// wrong one: neighbouring Stations are 99 m apart at the closest and 387 m at
// the first quartile, so at normal zoom those boxes overlap, and an overlap
// between DOM elements is settled by which one happens to be on top rather than
// which one you meant. Resolving the tap to the *nearest* Station within the
// radius settles it by distance instead, which is the thing the finger was
// actually aiming at.
const TAP_RADIUS_PX = 22;

// How close framing the viewer against their Nearest Station is allowed to get.
// Without a cap, standing 40 m from a platform fills the screen with one
// junction and the map stops being a map.
const USER_FRAME_MAX_ZOOM = 15.5;

// A User Location is a single fix, taken once, and it starts going stale
// immediately — you can walk 500 m in the time it takes to read a departure
// board. Rather than let a stale dot keep claiming to be current, it fades as
// it ages, on a floor, for the same reason Position Confidence has one: a
// position that has become a guess must read as uncertain, not absent.
const USER_FIX_FADE_MS = 300000;
const USER_FIX_OPACITY_FLOOR = 0.4;

const userFixOpacity = (ageMs) => {
  const spent = Math.min(1, Math.max(0, ageMs / USER_FIX_FADE_MS));
  return (1 - spent * (1 - USER_FIX_OPACITY_FLOOR)).toFixed(3);
};

// Metres per pixel at a given latitude and zoom. The accuracy circle is a real
// distance, so it has to be redrawn at every zoom rather than pinned to a pixel
// size — a fixed circle would claim a different accuracy at every scale.
const metresPerPixel = (latitude, zoom) =>
  (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom);

const panelAwarePadding = (map, { hasPanel } = {}) => {
  const container = map?.getContainer();
  const containerRect = container ? container.getBoundingClientRect() : undefined;
  const searchBarRect = document.querySelector('.search-bar-container')?.getBoundingClientRect();
  const panel = document.querySelector('.station-panel');
  const isPanelPresent = hasPanel ?? Boolean(panel);

  let panelRect;
  let panelHeight;
  let panelWidth;

  if (panel) {
    panelRect = panel.getBoundingClientRect();
    // offsetHeight and offsetWidth reflect resting layout dimensions,
    // immune to in-flight CSS transforms (e.g. translateY slide-up).
    // Adding 16px accounts for floating card margins.
    panelHeight = (panel.offsetHeight || 0) + 16;
    panelWidth = (panel.offsetWidth || 0) + 16;
  }

  return computePanelPadding({
    containerRect,
    searchBarRect,
    panelRect,
    panelHeight,
    panelWidth,
    hasPanel: isPanelPresent,
  });
};

const MapView = ({ theme, selectedStation, flyTarget, onSelectStation, activeLineFilter, hoverLine, userLocation }) => {
  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const stMarkersRef    = useRef([]);
  const animFrameRef    = useRef(null);
  // native JS Map of vehicle id → { marker, inner }. The inner element is kept
  // alongside its marker because the animation loop restyles it every frame,
  // and rediscovering it by walking the marker's DOM would tie the loop to a
  // wrapper structure built far away in createVehicleMarker.
  const markerMapRef    = useRef(new globalThis.Map());
  const themeRef        = useRef(theme);
  const filterRef       = useRef(activeLineFilter);
  const hoverRef        = useRef(null);
  const selectStRef     = useRef(onSelectStation);
  const selectedStationRef = useRef(selectedStation);
  const lastFramedFetchedAtRef = useRef(null); // prevents camera jumps on accuracy refinements
  const trainCountRef   = useRef(null);
  const focusMarkerRef  = useRef(null); // the expanded node for the Station in focus
  const preFocusZoomRef = useRef(null); // zoom level before station was focused
  const prevStationRef  = useRef(null); // previous selectedStation to detect un-focus transitions
  const prevUserLocationRef = useRef(null); // previous userLocation to detect clear transitions
  const zoomScaleRef    = useRef(1); // mutable scale factor updated on every zoom event
  const stInnerElemsRef = useRef([]); // refs to station inner elements for direct scale updates
  // MapLibre still emits a trailing 'click' after some real drag gestures
  // (notably a touch pan that ends without much velocity), which would
  // otherwise read as a background tap and dismiss the open Station panel
  // out from under the viewer mid-gesture.
  const wasDraggedRef   = useRef(false);
  // The Stations actually drawn right now, which is not every Station: a Line
  // filter or a hovered Line narrows them. A tap must only ever resolve to
  // something the viewer can currently see.
  const drawnStationsRef = useRef([]);
  const vehInnerElemsRef= useRef([]); // refs to vehicle inner elements for direct scale updates

  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { filterRef.current = activeLineFilter; }, [activeLineFilter]);
  useEffect(() => { selectStRef.current = onSelectStation; }, [onSelectStation]);
  useEffect(() => { selectedStationRef.current = selectedStation; }, [selectedStation]);
  useEffect(() => { hoverRef.current = hoverLine; }, [hoverLine]);

  const stopAnimation = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  const clearVehicleMarkers = () => {
    markerMapRef.current.forEach(({ marker }) => marker.remove());
    markerMapRef.current.clear();
    vehInnerElemsRef.current = [];
  };

  const clearStationMarkers = () => {
    stMarkersRef.current.forEach(m => m.remove());
    stMarkersRef.current = [];
    stInnerElemsRef.current = [];
  };

  // Apply zoom-based scale directly to all known marker DOM elements
  const applyMarkerScale = (scale) => {
    zoomScaleRef.current = scale;

    // Station markers: hide below scale 0.55 (~zoom 9.7), scale above that
    stInnerElemsRef.current.forEach(el => {
      if (scale < 0.55) {
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      } else {
        el.style.visibility = '';
        el.style.pointerEvents = '';
        el.style.transform = `scale(${Math.min(1.2, scale).toFixed(3)})`;
      }
    });

    // Vehicle markers: hide below scale 0.3 (~zoom 8.7), scale above
    vehInnerElemsRef.current.forEach(el => {
      if (scale < 0.3) {
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      } else {
        el.style.visibility = '';
        el.style.pointerEvents = '';
        el.style.transform = `scale(${Math.min(1.1, scale).toFixed(3)})`;
      }
    });
  };

  // Says plainly whether a marker is a reported train or a headway guess, and
  // how many independent sightings pin it down.
  const describeVehicle = (v) => {
    if (!v.isLive) {
      return `L${v.line} → ${v.direction} • simulated from the timetable, not a reported train`;
    }
    const eta = v.secondsToTarget <= 0
      ? 'at platform'
      : `${Math.round(v.secondsToTarget / 60)} min to`;
    const pin = v.sightingCount > 1 ? ` • ${v.sightingCount} sightings` : '';
    return `L${v.line} → ${v.direction} • ${eta} ${v.targetStation}${pin}${describePositionDoubt(v)}`;
  };

  const updateTrainCount = () => {
    if (!trainCountRef.current) return;
    const now = Date.now();
    const liveVehicles = trainPositionEngine.getLiveVehiclesFromMemory(now);
    if (liveVehicles.length > 0) {
      const pinned = liveVehicles.filter(v => v.sightingCount > 1).length;
      trainCountRef.current.textContent = pinned > 0
        ? `${liveVehicles.length} live trains · ${pinned} confirmed at two stations`
        : `${liveVehicles.length} live trains`;
    } else {
      trainCountRef.current.textContent = 'No live predictions — showing simulated trains';
    }
  };

  // ── Initialize station markers ─────────────────────────────────────────────
  // Outer element is owned by MapLibre (for position: transform translate3d).
  // Inner child element handles scale and visuals so MapLibre transform is NEVER overwritten.
  const initStationMarkers = (map) => {
    clearStationMarkers();
    const isDark = themeRef.current === 'dark';
    const activeFilter = filterRef.current;
    const hovered = hoverRef.current;
    const seenStops = new Set();
    const scale = zoomScaleRef.current;

    const filteredStations = stationFeatures.filter((st) => {
      if (hovered) {
        const lines = st.properties.lines || [];
        return lines.includes(hovered);
      }
      if (Array.isArray(activeFilter) && activeFilter.length > 0) {
        const lines = st.properties.lines || [];
        return lines.some(l => activeFilter.includes(String(l)));
      }
      return true;
    });

    drawnStationsRef.current = [];

    filteredStations.forEach((st) => {
      const sid = st.properties.stop_id || st.properties.id || st.properties.name;
      if (!sid) return;
      if (seenStops.has(sid)) return;
      seenStops.add(sid);
      drawnStationsRef.current.push(st);

      const wrapper = document.createElement('div');
      wrapper.className = 'ml-station-marker-wrapper';
      // Fixed wrapper size; inner scales via transform so MapLibre anchor stays correct
      wrapper.style.cssText = 'width:10px; height:10px; cursor:pointer; z-index:1; overflow:visible;';

      const inner = document.createElement('div');
      const isHovered = hoverRef.current && (st.properties.lines || []).includes(hoverRef.current);
      const isHidden = scale < 0.55;
      
      inner.style.cssText = `
        width:10px; height:10px; border-radius:50%;
        background:${isDark ? '#1a1a2e' : '#ffffff'};
        border:${isHovered ? '3px' : '2px'} solid ${stationBorderColor(st)};
        box-shadow:0 2px 6px rgba(0,0,0,.5);
        transition:transform .1s ease;
        transform: scale(${Math.min(1.2, scale).toFixed(3)});
        visibility: ${isHidden ? 'hidden' : ''};
        pointer-events: ${isHidden ? 'none' : ''};
        box-sizing:border-box;
        transform-origin: center center;
      `;
      wrapper.appendChild(inner);
      wrapper.title = st.properties.name;
      stInnerElemsRef.current.push(inner);

      wrapper.onmouseenter = () => { inner.style.transform = `scale(${(zoomScaleRef.current * 1.5).toFixed(3)})`; };
      wrapper.onmouseleave = () => { inner.style.transform = `scale(${zoomScaleRef.current.toFixed(3)})`; };
      wrapper.onclick = (e) => {
        e.stopPropagation();
        selectStRef.current(st);
      };

      const marker = new Marker({ element: wrapper, anchor: 'center' })
        .setLngLat(st.geometry.coordinates)
        .addTo(map);

      stMarkersRef.current.push(marker);
    });
  };

  // ── Initialize vehicle animation loop ──────────────────────────────────────
  const initVehicleLoop = (map) => {
    stopAnimation();
    clearVehicleMarkers();

    const activeFilter = filterRef.current;
    const initialVehicles = trainPositionEngine.getAllVehicles(Date.now());
    // Show only live vehicles (hide timetable/simulated vehicles)
    let visible = initialVehicles;
    if (Array.isArray(activeFilter) && activeFilter.length > 0) {
      visible = visible.filter(v => activeFilter.includes(String(v.line)));
    }

    const createVehicleMarker = (v) => {
      const color = lineColorMap[v.line] || '#ffffff';
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'width:28px; height:28px; cursor:default; z-index:1000; overflow:visible;';

      const inner = document.createElement('div');
      const currentScale = zoomScaleRef.current;
      const isHidden = currentScale < 0.3;
      
      inner.innerHTML = `<span style="pointer-events:none">L${v.line}</span>`;
      // A simulated train is a guess at a headway, not a train anyone reported.
      // It reads as hollow and unlit so it can never be mistaken for live data.
      inner.style.cssText = `
        width:28px; height:28px; border-radius:50%;
        background:${v.isLive ? color : 'transparent'};
        border:2px ${v.isLive ? 'solid rgba(255,255,255,0.9)' : `dashed ${color}`};
        box-shadow:0 0 0 0 ${color};
        display:flex; align-items:center; justify-content:center;
        color:${v.isLive ? '#fff' : color}; font-size:10px; font-weight:800;
        opacity:${vehicleOpacity(v)};
        ${v.isLive ? 'animation: vehiclePulse 2s ease-in-out infinite;' : ''}
        box-sizing:border-box; position:relative;
        transform: scale(${Math.min(1.1, currentScale).toFixed(3)});
        visibility: ${isHidden ? 'hidden' : ''};
        pointer-events: ${isHidden ? 'none' : ''};
        transform-origin: center center;
        transition: transform .1s ease;
      `;
      wrapper.appendChild(inner);
      vehInnerElemsRef.current.push(inner);

      wrapper.title = describeVehicle(v);

      const marker = new Marker({ element: wrapper, anchor: 'center' })
        .setLngLat(v.coordinates)
        .addTo(map);

      markerMapRef.current.set(v.id, { marker, inner });
    };

    visible.forEach(createVehicleMarker);

    const animate = () => {
      const now = Date.now();
      const currentVehicles = trainPositionEngine.getAllVehicles(now);
      updateTrainCount();
      let currentVisible = currentVehicles;
      if (Array.isArray(filterRef.current) && filterRef.current.length > 0) {
        currentVisible = currentVisible.filter(v => filterRef.current.includes(String(v.line)));
      }
      const visibleIds = new Set(currentVisible.map(v => v.id));

      markerMapRef.current.forEach(({ marker }, id) => {
        if (!visibleIds.has(id)) {
          marker.remove();
          markerMapRef.current.delete(id);
        }
      });

      currentVisible.forEach((v) => {
        const existing = markerMapRef.current.get(v.id);
        if (existing) {
          existing.marker.setLngLat(v.coordinates);
          existing.marker.getElement().title = describeVehicle(v);
          // Confidence moves while the train does — the countdown runs down,
          // syncs land or fail to — so the marker has to follow it rather than
          // keep the opacity it was created with.
          existing.inner.style.opacity = vehicleOpacity(v);
        } else {
          // The API can return a different set of vehicle IDs after a poll.
          // Add new live trains without waiting for a map/style refresh.
          createVehicleMarker(v);
        }
      });
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);
  };

  const applyLineFilter = (map, filter) => {
    const apply = () => {
      if (map.getLayer('metro-fill') && map.getLayer('metro-casing')) {
        let expr = null;
        if (Array.isArray(filter) && filter.length > 0) {
          expr = ['any', ...filter.map(f => ['==', ['get', 'line'], f])];
        } else if (filter && typeof filter === 'string') {
          expr = ['==', ['get', 'line'], filter];
        }
        map.setFilter('metro-fill', expr);
        map.setFilter('metro-casing', expr);

        // Compute side-by-side offsets when multiple lines are visible.
        // If no filter, reset offsets to 0.
        const allLines = lineFeatures.map(l => String(l.properties.line));
        const visible = Array.isArray(filter) && filter.length > 0 ? filter.map(String) : allLines;
        const n = visible.length;
        const spacing = (lineRenderConfig && Number.isFinite(lineRenderConfig.offsetSpacing)) ? lineRenderConfig.offsetSpacing : 6; // pixels
        const offsets = {};
        // Group visible lines by an approximate geometry key so identical/shared
        // geometries are not offset apart (they represent the same track).
        const geomKey = (id) => {
          const feat = lineFeatures.find(l => String(l.properties.line) === String(id));
          if (!feat || !feat.geometry || !feat.geometry.coordinates) return id;
          return feat.geometry.coordinates.map(c => `${c[0].toFixed(5)},${c[1].toFixed(5)}`).join('|');
        };
        const groups = {};
        visible.forEach(id => {
          const key = geomKey(id);
          groups[key] = groups[key] || [];
          groups[key].push(String(id));
        });
        // Standalone lines (like Line 4 running on its own dedicated tracks) MUST have offset 0
        // to prevent twisting, miter spikes, or self-intersecting loops on corners.
        // Only lines sharing the exact same track corridor receive a subtle side-by-side offset.
        for (const feat of lineFeatures) {
          offsets[String(feat.properties.line)] = 0;
        }
        for (const key of Object.keys(groups)) {
          const group = groups[key];
          if (group.length > 1) {
            for (let i = 0; i < group.length; i++) {
              const id = group[i];
              offsets[id] = (i - (group.length - 1) / 2) * Math.min(spacing, 4);
            }
          }
        }
        // apply offsets to features
        for (const feat of lineFeatures) {
          const id = String(feat.properties.line);
          feat.properties.offset = offsets[id] || 0;
        }
        // update source data so `line-offset` picks up new offsets
        const src = map.getSource('metro-lines');
        if (src && typeof src.setData === 'function') src.setData({ type: 'FeatureCollection', features: lineFeatures });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('styledata', apply);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: styleFor(theme),
      center: DEFAULT_MAP_CENTER,
      // 12.3 is where updateZoomScale's formula below caps marker scale at its
      // 1.2x maximum, so the default view opens with stations already at their
      // largest, easiest-to-tap size rather than the network's full extent.
      zoom: DEFAULT_MAP_ZOOM,
      attributionControl: { compact: true },
    });

    // Ensure bottom-right attribution starts collapsed into the compact info icon
    const collapseAttribution = () => {
      const attributionEl = containerRef.current?.querySelector('.maplibregl-ctrl-attrib');
      if (attributionEl) {
        attributionEl.classList.add('maplibregl-compact');
        attributionEl.classList.remove('maplibregl-compact-show');
        attributionEl.removeAttribute('open');
      }
    };
    collapseAttribution();
    map.once('load', collapseAttribution);

    const trainCount = document.createElement('div');
    trainCount.className = 'line3-train-count glass-panel';
    trainCount.setAttribute('aria-live', 'polite');
    containerRef.current.appendChild(trainCount);
    trainCountRef.current = trainCount;
    updateTrainCount();
    mapRef.current = map;

    const updateZoomScale = () => {
      const zoom = map.getZoom();
      // At zoom 11.5 scale = 1.0, at zoom 9 scale ~0.5, at zoom 7.5 scale = 0 (fully hidden)
      const scale = Math.max(0.0, Math.min(1.2, (zoom - 7.5) / 4.0));
      applyMarkerScale(scale);
    };
    map.on('zoom', updateZoomScale);
    updateZoomScale();

    map.on('dragstart', () => { wasDraggedRef.current = true; });
    map.on('dragend', () => {
      // Cleared on the next tick so the 'click' MapLibre fires immediately
      // after some drag gestures still sees the flag set.
      setTimeout(() => { wasDraggedRef.current = false; }, 0);
    });

    // A forgiving tap. This fires only for clicks that reach the map canvas —
    // a click that lands squarely on a Station marker is handled by the marker's
    // own handler and never gets here — so this is purely the near-miss case.
    map.on('click', (event) => {
      if (wasDraggedRef.current) return;

      const { lng, lat } = event.lngLat;
      const radiusM = TAP_RADIUS_PX * metresPerPixel(lat, map.getZoom());
      const nearest =
        zoomScaleRef.current >= 0.55
          ? nearestFeature(drawnStationsRef.current, [lng, lat])
          : null;

      if (nearest && nearest.distance <= radiusM) {
        selectStRef.current(nearest.feature);
      } else if (selectedStationRef.current) {
        selectStRef.current(null);
      }
    });

    map.on('style.load', () => {
      // In dev, StrictMode double-mounts this effect, so a stale map from the
      // first mount can still be sitting on a pending style.load when the
      // second mount replaces mapRef.current. The marker refs are shared
      // across instances, so letting a stale callback through would clear the
      // live map's markers and re-attach them to the removed one.
      if (mapRef.current !== map) return;
      collapseAttribution();
      initStationMarkers(map);
      initVehicleLoop(map);
      applyLineFilter(map, filterRef.current);
      arrivalStore.seedStrategicHubs();
    });

    // Predictions age out after about 18 minutes, so without a repeat sweep the
    // whole network quietly decays into simulated trains. Stations still inside
    // their memory pause cost nothing, so this is cheaper than it looks.
    const syncIfVisible = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      arrivalStore.syncNetwork();
    };
    const syncTimer = setInterval(syncIfVisible, NETWORK_SYNC_INTERVAL_MS);
    document.addEventListener('visibilitychange', syncIfVisible);

    return () => {
      clearInterval(syncTimer);
      document.removeEventListener('visibilitychange', syncIfVisible);
      stopAnimation();
      clearVehicleMarkers();
      clearStationMarkers();
      trainCount.remove();
      trainCountRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    // The map is constructed with the style matching the initial `theme`, so
    // this effect's mount-time run has nothing to do — and calling setStyle
    // before that initial style has loaded triggers a second style.load cycle
    // (and a "Style is not done loading" console warning) that only widens
    // the StrictMode double-mount race above. A theme flip that lands in that
    // narrow pre-load window is silently missed, which is an acceptable trade
    // for removing the race.
    if (!map.isStyleLoaded()) return;
    // diff:false because the two vector styles differ by more than paint: each
    // flavour names its own sprite file, and MapLibre's style diffing cannot
    // express a sprite change. Left to diff, a flip repainted some of the 56
    // basemap layers and not others, landing on a light ground wearing dark
    // labels. A full reload costs one re-read of the archive header and is the
    // only way to be sure the whole basemap changed.
    map.setStyle(styleFor(theme), { diff: false });
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    const [lng, lat] = snappedCoordinates(flyTarget);
    map.flyTo({
      center: [lng, lat],
      zoom: 14.5,
      padding: panelAwarePadding(map, { hasPanel: true }),
      essential: true,
      duration: 1200,
    });
  }, [flyTarget]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyLineFilter(map, activeLineFilter);
    // Rebuild station markers to reflect the active line filter
    if (map.isStyleLoaded()) {
      initStationMarkers(map);
      initVehicleLoop(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLineFilter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) initStationMarkers(map);
  }, [hoverLine]);

  // ── Station Focus ──────────────────────────────────────────────────────────
  // Clicking a Station does two things here: the camera eases in to centre it,
  // and a compact highlight marker (icon + name) anchors the pick on the map.
  // Arrivals live only in the Station panel, not on the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    if (focusMarkerRef.current) {
      focusMarkerRef.current.remove();
      focusMarkerRef.current = null;
    }
    // The floating "N live trains" readout and the Station panel say the same
    // kind of thing at once — worse, the panel visually sits on top of it,
    // so the count peeked out from under the panel's corner. The panel is the
    // more specific answer while a Station is in focus.
    if (trainCountRef.current) {
      trainCountRef.current.style.visibility = selectedStation ? 'hidden' : '';
    }

    if (!selectedStation) {
      if (prevStationRef.current) {
        prevStationRef.current = null;
        const { zoom: targetZoom, padding: targetPadding } = calculateUnfocusCamera({
          preFocusZoom: preFocusZoomRef.current,
        });
        preFocusZoomRef.current = null;

        map.easeTo({
          center: map.getCenter(),
          padding: targetPadding,
          zoom: targetZoom,
          duration: 600,
          essential: true,
        });
      }
      return undefined;
    }

    if (!prevStationRef.current) {
      preFocusZoomRef.current = map.getZoom();
    }
    prevStationRef.current = selectedStation;

    const coordinates = snappedCoordinates(selectedStation);

    const element = document.createElement('div');
    element.className = 'station-focus-node';
    // A visual anchor only — no countdowns to tick, so it's rendered once per
    // selection rather than on an interval. Arrivals live in the Station panel.
    element.innerHTML = renderStationHighlight(selectedStation.properties, themeRef.current);
    const marker = new Marker({ element, anchor: 'bottom', offset: [0, -14] })
      .setLngLat(coordinates)
      .addTo(map);
    focusMarkerRef.current = marker;

    // The panel shares this render (same selectedStation update), so it is
    // already in the DOM once this effect runs and can be measured.
    const basePadding = panelAwarePadding(map, { hasPanel: true });
    const targetZoom = calculateFocusZoom(map.getZoom());

    map.easeTo({
      center: coordinates,
      zoom: targetZoom,
      padding: basePadding,
      duration: 900,
      essential: true,
    });

    return () => {
      marker.remove();
      if (focusMarkerRef.current === marker) focusMarkerRef.current = null;
    };
  }, [selectedStation]);

  // ── The viewer's own dot ───────────────────────────────────────────────────
  // A MapLibre Marker rather than a style layer, matching every other marker
  // here, which also means it survives the setStyle a theme flip performs.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation || userLocation.status !== 'located') return undefined;

    const wrapper = document.createElement('div');
    wrapper.className = 'user-location-marker';
    const accuracyRing = document.createElement('div');
    accuracyRing.className = 'user-location-accuracy';
    const dot = document.createElement('div');
    dot.className = 'user-location-dot';
    wrapper.appendChild(accuracyRing);
    wrapper.appendChild(dot);

    const marker = new Marker({ element: wrapper, anchor: 'center' })
      .setLngLat(userLocation.coordinates)
      .addTo(map);

    const sizeAccuracyRing = () => {
      if (!Number.isFinite(userLocation.accuracy)) {
        accuracyRing.style.display = 'none';
        return;
      }
      const scale = metresPerPixel(userLocation.coordinates[1], map.getZoom());
      const diameter = (2 * userLocation.accuracy) / scale;
      // Below the dot's own size the ring says nothing the dot does not already
      // say, and drawing it would only make a precise fix look fuzzy.
      accuracyRing.style.display = diameter < 26 ? 'none' : '';
      accuracyRing.style.width = `${diameter}px`;
      accuracyRing.style.height = `${diameter}px`;
    };

    const fade = () => {
      wrapper.style.opacity = userFixOpacity(Date.now() - userLocation.fetchedAt);
    };

    sizeAccuracyRing();
    fade();
    map.on('zoom', sizeAccuracyRing);
    // Five seconds is one hundredth of the fade's span, so the decay reads as
    // gradual without a second animation loop running against the vehicles'.
    const fadeTimer = setInterval(fade, 5000);

    return () => {
      map.off('zoom', sizeAccuracyRing);
      clearInterval(fadeTimer);
      marker.remove();
    };
  }, [userLocation]);

  // ── Framing the viewer against their Nearest Station ───────────────────────
  // Declared after the station-focus effect on purpose. A locate that names a
  // Station sets both `selectedStation` and `userLocation` in one commit, so
  // both effects run; React runs them in declaration order, and this one has to
  // be the camera call that lands. Seeing both points is the whole answer —
  // centring on the viewer alone says where you are but not how far the train
  // is.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!userLocation || userLocation.status !== 'located') {
      if (prevUserLocationRef.current && !selectedStationRef.current) {
        map.easeTo({
          center: map.getCenter(),
          padding: ZERO_PADDING,
          duration: 600,
          essential: true,
        });
      }
      prevUserLocationRef.current = null;
      lastFramedFetchedAtRef.current = null;
      return;
    }

    prevUserLocationRef.current = userLocation;

    // Only animate the camera once per locate request (keyed by fetchedAt timestamp).
    // Subsequent accuracy refinements for the same fix update the marker dot and
    // accuracy ring in place without disrupting the user's view or overriding a station click.
    if (lastFramedFetchedAtRef.current === userLocation.fetchedAt) {
      return;
    }
    lastFramedFetchedAtRef.current = userLocation.fetchedAt;

    const padding = panelAwarePadding(map, { hasPanel: Boolean(userLocation.nearestStation) });

    if (!userLocation.nearestStation) {
      // No Station worth naming — too rough a fix, or genuinely nothing near.
      // Being located is still useful, so the camera still goes there.
      map.easeTo({
        center: userLocation.coordinates,
        zoom: Math.max(map.getZoom(), 14.5),
        padding,
        duration: 900,
        essential: true,
      });
      return;
    }

    const bounds = new LngLatBounds(userLocation.coordinates, userLocation.coordinates);
    bounds.extend(snappedCoordinates(userLocation.nearestStation));
    map.fitBounds(bounds, {
      padding,
      maxZoom: USER_FRAME_MAX_ZOOM,
      duration: 900,
      essential: true,
    });
  }, [userLocation]);

  return (
    <div
      ref={containerRef}
      className="map-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default MapView;
