import React, { useEffect, useRef } from 'react';
import { Map as MapLibreMap, Marker, LngLatBounds, addProtocol, setWorkerUrl } from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import { Capacitor } from '@capacitor/core';
import { createBoundedRangeSource } from '../utils/boundedRangeSource';
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
  STATION_FOCUS_ZOOM,
  zoomOutTarget,
  CAMERA_EASE_MS,
  panelAwarePadding as computePanelPadding,
} from '../utils/mapCamera';
import { zoomCurve, dotScale, trainScale } from '../utils/zoomCurve';
import { lineRanks, allowedRank } from '../utils/lineReveal';
import { probeOfflineBasemap } from '../utils/basemapProbe';
import { startTrainTracker } from '../services/trainTracker';
import { useTranslation, translate } from '../i18n';
import arrivalStore, { NETWORK_SYNC_INTERVAL_MS, STATION_ID_MAP } from '../services/arrivalStore';
import trainPositionEngine from '../services/trainPositionEngine';
import { renderStationHighlight, renderBusStopHighlight } from '../utils/focusNode';
import { getDistance, nearestFeature, nearestPointOnPath, pathsOffReference } from '../utils/geoUtils';
import returnTrackData from '../data/return_tracks.json';
import { lineOpacityExpression, dimmedVehicleOpacity, vehicleShouldPulse } from '../utils/lineDim';
import {
  ensureBusLayers,
  setBusRoutesData,
  setFeederWalkLinks,
  createLiveBusMarker,
  createFeederStopMarker,
  createBusStopNodeMarker,
} from '../utils/busMapLayers';
import { EMT_LINES, LIVE_BUS_TELEMETRY, getStationBusFeeders, getAllBusStops } from '../data/emtData';

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

const pmtilesProtocol = new Protocol();
// Android's local web server answers a range request with the rest of the
// whole archive rather than the slice asked for, which corrupts every tile
// read. See boundedRangeSource.js.
if (Capacitor.getPlatform() === 'android') {
  pmtilesProtocol.add(new PMTiles(createBoundedRangeSource(BASEMAP_ARCHIVE)));
}
addProtocol('pmtiles', pmtilesProtocol.tile);

// Both startup fetches are independent, so they run concurrently: the module
// evaluates in max(geometry, probe) instead of their sum.
let line4Osm = null;
let OFFLINE_BASEMAP_AVAILABLE = false;

const loadLine4Osm = async () => {
  try {
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
};

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
    // A return leg counts as its Line's track: Cabanyal is 168 m from the
    // beach leg, inside the snap limit, and would otherwise be dragged onto
    // a street its trains never use.
    for (const geometry of lineCoordsById.get(String(lineId)) || []) {
      const candidate = nearestPointOnPath(geometry, station.geometry.coordinates);
      if (candidate && (!best || candidate.distance < best.distance)) best = candidate;
    }
  }

  if (!best || best.distance > SNAP_LIMIT_M) return station;

  station.geometry.coordinates = best.coordinates;
  return station;
};

let lineById = new Map();
let lineFeatures = [];
let returnLegFeatures = [];
let lineCoordsById = new Map();
let stationFeatures = [];
let snappedByName = new Map();
let lineGeoJSON = { type: 'FeatureCollection', features: [] };
let lineColorMap = {};

function rebuildNetworkGeometry() {
  lineById = new Map();
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

  let features = Array.from(lineById.values());
  // Ensure each feature has a resolved `color` property (image override > feature.color > default)
  for (const f of features) {
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

  lineFeatures = features.map((f) => {
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

  // A Line with a one-way section draws its outbound alignment above, and the
  // return leg it lacks here: on lines 4 and 6, Dr. Lluch → Cabanyal runs on its
  // own street inland of the beach leg (ADR-0007). Only the stretch off the
  // drawn alignment is added, so the shared trunk is not painted twice. Kept out
  // of lineFeatures, which holds one feature per Line, and carrying the same
  // `line` property, so filtering and dimming treat it as part of its Line.
  returnLegFeatures = lineFeatures.flatMap((f) => {
    const id = String(f.properties.line);
    const returnTrack = returnTrackData.lines && returnTrackData.lines[id];
    if (!returnTrack || !f.geometry || f.geometry.type !== 'LineString') return [];
    return pathsOffReference(returnTrack.coordinates, f.geometry.coordinates, lineRenderConfig.sharedToleranceMeters)
      .map(coordinates => ({
        type: 'Feature',
        properties: { ...f.properties, offset: 0, returnLeg: true },
        geometry: { type: 'LineString', coordinates },
      }));
  });

  lineCoordsById = new Map();
  for (const f of [...lineFeatures, ...returnLegFeatures]) {
    if (!f.geometry || f.geometry.type !== 'LineString') continue;
    const id = String(f.properties.line);
    lineCoordsById.set(id, [...(lineCoordsById.get(id) || []), f.geometry.coordinates]);
  }

  stationFeatures = mergeDuplicateStations(rawStations).map(snapStationToItsLines);
  snappedByName = new Map(stationFeatures.map(f => [f.properties.name, f]));
  lineGeoJSON = { type: 'FeatureCollection', features: [...lineFeatures, ...returnLegFeatures] };
  lineColorMap = Object.fromEntries(
    lineFeatures.map(f => [f.properties.line, (imageLineColors && imageLineColors[f.properties.line]) ? imageLineColors[f.properties.line] : f.properties.color])
  );
}

// Synchronous baseline geometry pass
rebuildNetworkGeometry();

// Background asynchronous asset fetch (unblocks main JS thread & React mounting)
const initBasemapPromise = (typeof window !== 'undefined')
  ? Promise.all([
      loadLine4Osm(),
      probeOfflineBasemap(BASEMAP_ARCHIVE, fetch, pmtilesProtocol).then((available) => {
        OFFLINE_BASEMAP_AVAILABLE = available;
      }),
    ]).then(() => {
      rebuildNetworkGeometry();
    }).catch(() => {})
  : Promise.resolve();

// Snapped positions are what the map draws, so a Station handed in from
// somewhere that has not snapped it — userLocation's Nearest Station, say —
// still has to be drawn and framed at the same place as its own dot.
const snappedCoordinates = (station) => {
  const snapped = station && snappedByName.get(station.properties.name);
  return snapped ? snapped.geometry.coordinates : station.geometry.coordinates;
};

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
  glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
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
// On top of that, a Vehicle running on a Line that doesn't serve the
// selected Station is dimmed further, same as the Line itself.
const vehicleOpacity = (v, selectedStation) =>
  dimmedVehicleOpacity(v.isLive ? (v.positionConfidence ?? 1) : 0.55, v.line, selectedStation).toFixed(2);

// Says in the reader's words — not the model's — why a marker is drawn faint,
// covering both causes: how far the walk had to reach, and how long since the
// API last confirmed the train. Takes `lang` rather than reading it from a
// hook because this runs inside MapView's long-lived, mount-once marker
// effect (see languageRef below) — a plain function reading a ref-held
// language stays correct across a language switch, where a value captured by
// the effect's own closure at mount would not.
const describePositionDoubt = (v, lang) => {
  if (!v.isLive || v.positionConfidence >= 1) return '';
  const confirmed = v.secondsUnheard < 60
    ? translate(lang, 'mapView.justNow')
    : translate(lang, 'mapView.minAgo', { min: Math.round(v.secondsUnheard / 60) });
  const basis = v.isDeadReckoned
    ? translate(lang, 'mapView.deadReckoned')
    : translate(lang, 'mapView.uncertainty', { metres: v.positionUncertaintyMetres });
  return translate(lang, 'mapView.lastConfirmed', { basis, time: confirmed });
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
// junction and the map stops being a map. It was 15.5, which still read as too
// close after a locate press; it now matches the zoom of tapping a Station, so
// both ways of arriving at a platform land on the same view.
const USER_FRAME_MAX_ZOOM = STATION_FOCUS_ZOOM;

// Zooming out past this by hand puts the walking box away.
const WALK_BANNER_MIN_ZOOM = 13;

// With no Station to frame against, the zoom the camera moves to at least.
const USER_ONLY_ZOOM = 13.8;

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

const MapView = ({
  theme,
  selectedStation,
  onSelectStation,
  activeLineFilter,
  hoverLine,
  userLocation,
  onReady,
  onUserInteract,
  onZoomedOut,
  variant = 'A',
  activeBusLine = null,
  onSelectBusLine = null,
  activeMode = 'metro',
  selectedBusStop = null,
  onSelectBusStop = null,
}) => {
  const { language } = useTranslation();
  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const stMarkersRef    = useRef([]);
  const busMarkersRef   = useRef([]);
  const animFrameRef    = useRef(null);
  // native JS Map of vehicle id → { marker, inner }. The inner element is kept
  // alongside its marker because the animation loop restyles it every frame,
  // and rediscovering it by walking the marker's DOM would tie the loop to a
  // wrapper structure built far away in createVehicleMarker.
  const markerMapRef    = useRef(new globalThis.Map());
  const themeRef        = useRef(theme);
  const languageRef     = useRef(language);
  const filterRef       = useRef(activeLineFilter);
  const hoverRef        = useRef(null);
  const selectStRef     = useRef(onSelectStation);
  const onReadyRef      = useRef(onReady);
  const selectedStationRef = useRef(selectedStation);
  const lastFramedFetchedAtRef = useRef(null); // prevents camera jumps on accuracy refinements
  const trainCountRef   = useRef(null);
  const focusMarkerRef  = useRef(null); // the expanded node for the Station in focus
  const busFocusMarkerRef = useRef(null); // the expanded node for the Bus Stop in focus
  const selectedBusStopRef = useRef(selectedBusStop);
  useEffect(() => { selectedBusStopRef.current = selectedBusStop; }, [selectedBusStop]);
  const onSelectBusStopRef = useRef(onSelectBusStop);
  useEffect(() => { onSelectBusStopRef.current = onSelectBusStop; }, [onSelectBusStop]);
  const prevStationRef  = useRef(null); // previous selectedStation to detect un-focus transitions
  const prevUserLocationRef = useRef(null); // previous userLocation to detect clear transitions
  const zoomScaleRef    = useRef(1); // raw zoomCurve value, updated on every zoom event
  const zoomValueRef    = useRef(DEFAULT_MAP_ZOOM); // current map zoom
  const closingZoomRef  = useRef(false); // a sheet-close zoom-out ease is running
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
  // Reveal rank per station dot while a Line filter is active (aligned with stInnerElemsRef; null otherwise).
  const stRanksRef = useRef(null);
  const prevFilterRef = useRef([]);
  const markersReadyRef = useRef(false); // station/vehicle markers are DOM: only the first style load gates them
  const vehInnerElemsRef= useRef([]); // refs to vehicle inner elements for direct scale updates

  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { languageRef.current = language; }, [language]);
  useEffect(() => { filterRef.current = activeLineFilter; }, [activeLineFilter]);
  useEffect(() => { selectStRef.current = onSelectStation; }, [onSelectStation]);
  const zoomedOutRef = useRef(onZoomedOut);
  useEffect(() => { zoomedOutRef.current = onZoomedOut; }, [onZoomedOut]);
  const interactRef = useRef(onUserInteract);
  useEffect(() => { interactRef.current = onUserInteract; }, [onUserInteract]);
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
    stRanksRef.current = null;
  };

  // Apply zoom-based scale directly to all known marker DOM elements. `curve` is
  // the raw zoomCurve value (also used for the hide thresholds); the drawn
  // sizes come from dotScale/trainScale so dot and train share one curve.
  const applyMarkerScale = (curve, zoom) => {
    zoomScaleRef.current = curve;

    // Station markers: hide below curve 0.55 (~zoom 9.7)
    // With a Line filter on, stations appear by rank instead (majors in the Line overview, the rest as
    // the map zooms in) and keep a minimum size so the overview dots stay visible.
    const ranks = stRanksRef.current;
    const maxRank = allowedRank(zoom);
    stInnerElemsRef.current.forEach((el, i) => {
      const hide = ranks ? ranks[i] > maxRank : curve < 0.55;
      if (hide) {
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      } else {
        el.style.visibility = '';
        el.style.pointerEvents = '';
        el.style.transition = 'none';
        el.style.transform = `scale(${(ranks ? Math.max(dotScale(zoom), 0.7) : dotScale(zoom)).toFixed(3)})`;
      }
    });

    // Vehicle markers: hide below curve 0.3 (~zoom 8.7)
    vehInnerElemsRef.current.forEach(el => {
      if (curve < 0.3) {
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      } else {
        el.style.visibility = '';
        el.style.pointerEvents = '';
        el.style.transition = 'none';
        el.style.transform = `scale(${trainScale(zoom).toFixed(3)})`;
      }
    });
  };

  // Says plainly whether a marker is a reported train or a headway guess, and
  // how many independent sightings pin it down.
  const describeVehicle = (v) => {
    const lang = languageRef.current;
    const eta = v.secondsToTarget <= 0
      ? translate(lang, 'mapView.atPlatform')
      : translate(lang, 'mapView.etaMinTo', { min: Math.round(v.secondsToTarget / 60) });
    const pin = v.sightingCount > 1 ? translate(lang, 'mapView.sightings', { count: v.sightingCount }) : '';
    return `L${v.line} → ${v.direction} • ${eta} ${v.targetStation}${pin}${describePositionDoubt(v, lang)}`;
  };

  // `liveVehicles` is the frame's live Vehicles, already walked by the caller.
  const updateTrainCount = (liveVehicles) => {
    if (!trainCountRef.current) return;
    const lang = languageRef.current;
    if (liveVehicles.length > 0) {
      const pinned = liveVehicles.filter(v => v.sightingCount > 1).length;
      trainCountRef.current.textContent = pinned > 0
        ? translate(lang, 'mapView.trainCountPinned', { count: liveVehicles.length, pinned })
        : translate(lang, 'mapView.trainCountLive', { count: liveVehicles.length });
    } else {
      trainCountRef.current.textContent = translate(lang, 'mapView.trainCountNone');
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
    const drawnScale = dotScale(zoomValueRef.current);

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
        transform: scale(${drawnScale.toFixed(3)});
        visibility: ${isHidden ? 'hidden' : ''};
        pointer-events: ${isHidden ? 'none' : ''};
        box-sizing:border-box;
        transform-origin: center center;
      `;
      wrapper.appendChild(inner);
      wrapper.title = st.properties.name;
      stInnerElemsRef.current.push(inner);

      wrapper.onmouseenter = () => {
        inner.style.transition = 'transform .1s ease';
        inner.style.transform = `scale(${(dotScale(zoomValueRef.current) * 1.5).toFixed(3)})`;
      };
      wrapper.onmouseleave = () => {
        inner.style.transition = 'transform .1s ease';
        inner.style.transform = `scale(${dotScale(zoomValueRef.current).toFixed(3)})`;
      };
      wrapper.onclick = (e) => {
        e.stopPropagation();
        selectStRef.current(st);
      };

      const marker = new Marker({ element: wrapper, anchor: 'center' })
        .setLngLat(st.geometry.coordinates)
        .addTo(map);

      stMarkersRef.current.push(marker);
    });

    if (Array.isArray(activeFilter) && activeFilter.length > 0 && !hovered) {
      const ranks = lineRanks(drawnStationsRef.current, activeFilter);
      stRanksRef.current = drawnStationsRef.current.map((st) => ranks.get(st) ?? 2);
      applyMarkerScale(zoomScaleRef.current, zoomValueRef.current);
    } else {
      stRanksRef.current = null;
    }
  };

  // ── Initialize vehicle animation loop ──────────────────────────────────────
  // Runs on display V-Sync (native requestAnimationFrame), matching 60Hz and 120Hz
  // ProMotion screens with delta-time vehicle interpolation and zero cadence judder.
  const initVehicleLoop = (map) => {
    stopAnimation();
    clearVehicleMarkers();

    const activeFilter = filterRef.current;
    // Live vehicles only: no timetable/headway guesses are ever drawn.
    const liveNow = (now) => trainPositionEngine.getLiveVehiclesFromMemory(now)
      .map((v) => trainPositionEngine.smoothVehicle(v, now));
    let visible = liveNow(Date.now());
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
      
      const isPulsing = vehicleShouldPulse(v, selectedStationRef.current);
      inner.className = `ml-vehicle-marker-inner${isPulsing ? ' pulsing' : ''}`;
      inner.innerHTML = `<span style="pointer-events:none">L${v.line}</span>`;
      inner.style.cssText = `
        width:28px; height:28px; border-radius:50%;
        background:${color};
        border:2px solid rgba(255,255,255,0.9);
        display:flex; align-items:center; justify-content:center;
        color:#fff; font-size:10px; font-weight:800;
        opacity:${vehicleOpacity(v, selectedStationRef.current)};
        box-sizing:border-box; position:relative;
        transform: scale(${trainScale(zoomValueRef.current).toFixed(3)});
        visibility: ${isHidden ? 'hidden' : ''};
        pointer-events: ${isHidden ? 'none' : ''};
        transform-origin: center center;
      `;
      wrapper.appendChild(inner);
      vehInnerElemsRef.current.push(inner);

      wrapper.title = describeVehicle(v);

      const marker = new Marker({ element: wrapper, anchor: 'center' })
        .setLngLat(v.coordinates)
        .addTo(map);

      markerMapRef.current.set(v.id, {
        marker,
        inner,
        title: wrapper.title,
        lng: v.coordinates[0],
        lat: v.coordinates[1],
        opacity: vehicleOpacity(v, selectedStationRef.current),
        isPulsing,
      });
    };

    visible.forEach(createVehicleMarker);

    const animate = () => {
      const now = Date.now();
      const currentVehicles = liveNow(now);
      // Forget render state for trains that are gone (getAllVehicles used to).
      const alive = new Set(currentVehicles.map(v => v.id));
      for (const id of trainPositionEngine.renderState.keys()) {
        if (!alive.has(id)) trainPositionEngine.renderState.delete(id);
      }
      updateTrainCount(currentVehicles);
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
          if (existing.lng !== v.coordinates[0] || existing.lat !== v.coordinates[1]) {
            existing.lng = v.coordinates[0];
            existing.lat = v.coordinates[1];
            existing.marker.setLngLat(v.coordinates);
          }
          // Confidence moves while the train does — the countdown runs down,
          // syncs land or fail to — so the marker has to follow it rather than
          // keep the opacity it was created with. Each value is written only
          // when it changed; most frames change none of them.
          const title = describeVehicle(v);
          if (existing.title !== title) {
            existing.title = title;
            existing.marker.getElement().title = title;
          }
          const opacity = vehicleOpacity(v, selectedStationRef.current);
          if (existing.opacity !== opacity) {
            existing.opacity = opacity;
            existing.inner.style.opacity = opacity;
          }
          const isPulsing = vehicleShouldPulse(v, selectedStationRef.current);
          if (existing.isPulsing !== isPulsing) {
            existing.isPulsing = isPulsing;
            existing.inner.classList.toggle('pulsing', isPulsing);
          }
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
        if (src && typeof src.setData === 'function') src.setData({ type: 'FeatureCollection', features: [...lineFeatures, ...returnLegFeatures] });
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('styledata', apply);
  };

  // Dims Lines outside the selected Station's Station Chain — and, via
  // vehicleOpacity, the Vehicles running on them — rather than hiding them.
  // Independent of applyLineFilter above: that hides non-matching Lines
  // outright via `filter`, this only ever de-emphasizes a Line the filter
  // has already let through, via a `line-opacity` paint expression, so the
  // two can never fight over the same Line.
  const applyLineDim = (map, selectedStation) => {
    const apply = () => {
      if (map.getLayer('metro-fill') && map.getLayer('metro-casing')) {
        map.setPaintProperty('metro-fill', 'line-opacity', lineOpacityExpression(selectedStation, 1));
        map.setPaintProperty('metro-casing', 'line-opacity', lineOpacityExpression(selectedStation, 0.35));
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once('styledata', apply);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let isCancelled = false;
    let teardown = null;

    initBasemapPromise.then(() => {
      if (isCancelled || !containerRef.current || mapRef.current) return;

      const map = new MapLibreMap({
        container: containerRef.current,
        style: styleFor(theme),
        center: DEFAULT_MAP_CENTER,
        // 12.3 is where updateZoomScale's formula below caps marker scale at its
        // 1.2x maximum, so the default view opens with stations already at their
        // largest, easiest-to-tap size rather than the network's full extent.
        zoom: DEFAULT_MAP_ZOOM,
        // No (i) button on the map: OpenStreetMap, Protomaps and MapLibre are credited in About & Legal.
        attributionControl: false,
        maxTileCacheZoomLevels: 5,
        fadeDuration: 0,
      });

      // `originalEvent` is set only when a hand moved the camera (drag, pinch,
      // wheel, key); the app's own easeTo/fitBounds carry none. That difference is
      // how auto-locate tells a viewer taking over from its own framing.
      map.on('movestart', (event) => {
        if (event.originalEvent && interactRef.current) interactRef.current();
      });
      // The viewer pulling out to the network overview is done with the walking box (a hand gesture only: closing
      // the Station sheet eases out by itself and has its own way of clearing the box).
      map.on('zoomend', (event) => {
        if (event.originalEvent && map.getZoom() < WALK_BANNER_MIN_ZOOM && zoomedOutRef.current) zoomedOutRef.current();
      });

      const trainCount = document.createElement('div');
      trainCount.className = 'line3-train-count glass-panel';
      trainCount.setAttribute('aria-live', 'polite');
      containerRef.current.appendChild(trainCount);
      trainCountRef.current = trainCount;
      updateTrainCount(trainPositionEngine.getLiveVehiclesFromMemory(Date.now()));
      mapRef.current = map;

      const updateZoomScale = () => {
        const zoom = map.getZoom();
        zoomValueRef.current = zoom;
        applyMarkerScale(zoomCurve(zoom), zoom);
      };
      map.on('zoom', updateZoomScale);
      updateZoomScale();

      // A touch or click on the map cancels a running sheet-close zoom-out.
      const cancelClosingEase = () => {
        if (closingZoomRef.current) { closingZoomRef.current = false; map.stop(); }
      };
      map.on('mousedown', cancelClosingEase);
      map.on('touchstart', cancelClosingEase);

      map.on('dragstart', () => { wasDraggedRef.current = true; });
      map.on('dragend', () => {
        // Cleared on the next tick so the 'click' MapLibre fires immediately
        // after some drag gestures still sees the flag set.
        setTimeout(() => { wasDraggedRef.current = false; }, 0);
      });

      // A forgiving tap on station or multimodal walk hub click.
      map.on('click', (event) => {
        if (wasDraggedRef.current) return;

        const { lng, lat } = event.lngLat;
        const currentZoom = map.getZoom();
        const radiusM = TAP_RADIUS_PX * metresPerPixel(lat, currentZoom);
        const nearest =
          zoomScaleRef.current >= 0.55
            ? nearestFeature(drawnStationsRef.current, [lng, lat])
            : null;

        if (nearest && nearest.distance <= radiusM) {
          selectStRef.current(nearest.feature);
          return;
        }

        // Multimodal 5-Minute Walk Radius click on the map:
        // When zoomed in (zoom >= 13), clicking any point explores all transit
        // (Metro stations and EMT bus stops) within a 5-minute walk (~400m).
        if (currentZoom >= 13 && drawnStationsRef.current && drawnStationsRef.current.length > 0) {
          const nearestWithin5Min = nearestFeature(drawnStationsRef.current, [lng, lat]);
          if (nearestWithin5Min && nearestWithin5Min.distance <= 400) {
            selectStRef.current(nearestWithin5Min.feature, {
              userLocation: {
                coordinates: [lng, lat],
                accuracy: 15,
                isMapClick: true,
                status: 'located',
                fetchedAt: Date.now(),
              }
            });
            return;
          }
        }

        if (selectedStationRef.current) {
          selectStRef.current(null);
        }
        if (selectedBusStopRef.current && onSelectBusStopRef.current) {
          onSelectBusStopRef.current(null);
        }
      });

      // Boot arrivals early in the background while the splash screen covers initial load.
      let bootedArrivals = false;
      const startArrivalSync = () => {
        if (bootedArrivals) return;
        bootedArrivals = true;
        arrivalStore.bootNetwork();
      };
      const bootTimer = setTimeout(startArrivalSync, 100);

      map.on('style.load', () => {
        // In dev, StrictMode double-mounts this effect, so a stale map from the
        // first mount can still be sitting on a pending style.load when the
        // second mount replaces mapRef.current. The marker refs are shared
        // across instances, so letting a stale callback through would clear the
        // live map's markers and re-attach them to the removed one.
        if (mapRef.current !== map) return;
        startArrivalSync();
        clearTimeout(bootTimer);
        if (onReadyRef.current) {
          const notifyReady = onReadyRef.current;
          onReadyRef.current = null; // first style.load only; theme swaps reload the style
          notifyReady();
        }
        initStationMarkers(map);
        initVehicleLoop(map);
        markersReadyRef.current = true;
        applyLineFilter(map, filterRef.current);
        applyLineDim(map, selectedStationRef.current);
        ensureBusLayers(map, themeRef.current);
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
      const stopTracker = startTrainTracker();

      teardown = () => {
        clearTimeout(bootTimer);
        clearInterval(syncTimer);
        stopTracker();
        document.removeEventListener('visibilitychange', syncIfVisible);
        stopAnimation();
        clearVehicleMarkers();
        clearStationMarkers();
        clearBusMarkers();
        trainCount.remove();
        trainCountRef.current = null;
        map.remove();
        mapRef.current = null;
      };
    });

    return () => {
      isCancelled = true;
      if (teardown) teardown();
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
    if (!map) return;
    applyLineFilter(map, activeLineFilter);
    // Rebuild station markers to reflect the active line filter. setFilter leaves the style "not loaded" until
    // the next frame, so isStyleLoaded() cannot gate this: the markers are DOM, not style layers.
    if (markersReadyRef.current) {
      initStationMarkers(map);
      initVehicleLoop(map);
    }
    // A Line was just picked: frame all of it (its stations) on screen.
    const now = Array.isArray(activeLineFilter) ? activeLineFilter.map(String) : [];
    const added = now.filter((l) => !prevFilterRef.current.includes(l));
    prevFilterRef.current = now;
    if (added.length > 0) {
      const onLine = stationFeatures.filter((st) => (st.properties.lines || []).some((l) => now.includes(String(l))));
      if (onLine.length > 1) {
        const bounds = new LngLatBounds(onLine[0].geometry.coordinates, onLine[0].geometry.coordinates);
        onLine.forEach((st) => bounds.extend(st.geometry.coordinates));
        const pad = panelAwarePadding(map, { hasPanel: Boolean(selectedStationRef.current) });
        map.fitBounds(bounds, {
          padding: {
            top: pad.top + 56, // the line-chip row under the search pill
            bottom: Math.max(pad.bottom, 0) + 32,
            left: Math.max(pad.left, 0) + 32,
            right: Math.max(pad.right, 0) + 32,
          },
          maxZoom: 13,
          duration: CAMERA_EASE_MS,
          essential: true,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLineFilter]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) initStationMarkers(map);
  }, [hoverLine]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyLineDim(map, selectedStation);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStation]);

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
    if (busFocusMarkerRef.current) {
      busFocusMarkerRef.current.remove();
      busFocusMarkerRef.current = null;
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
        closingZoomRef.current = true;
        map.once('moveend', () => { closingZoomRef.current = false; });
        map.easeTo({
          center: map.getCenter(),
          padding: ZERO_PADDING,
          zoom: zoomOutTarget(map.getZoom()),
          duration: CAMERA_EASE_MS,
          essential: true,
        });
      }
      return undefined;
    }

    closingZoomRef.current = false;
    prevStationRef.current = selectedStation;

    const coordinates = snappedCoordinates(selectedStation);

    const element = document.createElement('div');
    element.className = 'station-focus-node';
    // A visual anchor only — no countdowns to tick, so it's rendered once per
    // selection rather than on an interval. Arrivals live in the Station panel.
    element.innerHTML = renderStationHighlight(selectedStation.properties, themeRef.current);
    const marker = new Marker({ element, anchor: 'bottom', offset: [0, -6] })
      .setLngLat(coordinates)
      .addTo(map);
    focusMarkerRef.current = marker;

    // The panel shares this render (same selectedStation update), so it is
    // already in the DOM once this effect runs and can be measured.
    const basePadding = panelAwarePadding(map, { hasPanel: true });
    const targetZoom = calculateFocusZoom(map.getZoom());

    if (!userLocationRef.current?.isMapClick) {
      map.easeTo({
        center: coordinates,
        zoom: targetZoom,
        padding: basePadding,
        duration: CAMERA_EASE_MS,
        essential: true,
      });
    }

    return () => {
      marker.remove();
      if (focusMarkerRef.current === marker) focusMarkerRef.current = null;
    };
  }, [selectedStation]);

  // ── Bus Stop in focus ───────────────────────────────────────────────────────
  // Clicking an EMT bus stop anchors a compact marker (EMT badge + shortened name + lines)
  // and smoothly centers the visible map on the stop.
  const prevBusStopRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    if (busFocusMarkerRef.current) {
      busFocusMarkerRef.current.remove();
      busFocusMarkerRef.current = null;
    }

    if (!selectedBusStop) {
      if (prevBusStopRef.current) {
        prevBusStopRef.current = null;
      }
      return undefined;
    }

    if (focusMarkerRef.current) {
      focusMarkerRef.current.remove();
      focusMarkerRef.current = null;
    }

    prevBusStopRef.current = selectedBusStop;
    const coordinates = selectedBusStop.coordinates;
    if (!coordinates || !Array.isArray(coordinates)) return undefined;

    const element = document.createElement('div');
    element.className = 'bus-focus-node';
    element.innerHTML = renderBusStopHighlight(selectedBusStop, themeRef.current);
    const marker = new Marker({ element, anchor: 'bottom', offset: [0, -12] })
      .setLngLat(coordinates)
      .addTo(map);
    busFocusMarkerRef.current = marker;

    const basePadding = panelAwarePadding(map, { hasPanel: true });
    const targetZoom = Math.max(map.getZoom(), 15.5);

    map.easeTo({
      center: coordinates,
      zoom: targetZoom,
      padding: basePadding,
      duration: CAMERA_EASE_MS,
      essential: true,
    });

    return () => {
      marker.remove();
      if (busFocusMarkerRef.current === marker) busFocusMarkerRef.current = null;
    };
  }, [selectedBusStop]);

  // ── The viewer's own dot ───────────────────────────────────────────────────
  // A MapLibre Marker rather than a style layer, matching every other marker
  // here, which also means it survives the setStyle a theme flip performs.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation || userLocation.status !== 'located') return undefined;

    const isPing = Boolean(userLocation.isMapClick);
    const wrapper = document.createElement('div');
    wrapper.className = isPing ? 'user-ping-marker' : 'user-location-marker';

    if (isPing) {
      wrapper.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 35;
        font-size: 26px;
        line-height: 1;
        user-select: none;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
      `;
      wrapper.innerHTML = `<span>📍</span>`;
    } else {
      wrapper.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 35;
      `;
      wrapper.innerHTML = `
        <div class="user-location-accuracy" style="display:none;"></div>
        <div class="user-location-dot" style="width: 14px; height: 14px; border-radius: 50%; background: #3B82F6; border: 2.5px solid #ffffff; box-shadow: 0 0 10px #3B82F6; box-sizing: border-box;"></div>
      `;
    }

    const marker = new Marker({ element: wrapper, anchor: isPing ? 'bottom' : 'center' })
      .setLngLat(userLocation.coordinates)
      .addTo(map);

    const sizeAccuracyRing = () => {
      if (isPing) return;
      const accuracyRing = wrapper.querySelector('.user-location-accuracy');
      if (!accuracyRing) return;
      if (!Number.isFinite(userLocation.accuracy)) {
        accuracyRing.style.display = 'none';
        return;
      }
      const scale = metresPerPixel(userLocation.coordinates[1], map.getZoom());
      const diameter = (2 * userLocation.accuracy) / scale;
      accuracyRing.style.display = diameter < 26 ? 'none' : '';
      accuracyRing.style.width = `${diameter}px`;
      accuracyRing.style.height = `${diameter}px`;
    };

    const fade = () => {
      if (!isPing) {
        wrapper.style.opacity = userFixOpacity(Date.now() - (userLocation.updatedAt ?? userLocation.fetchedAt));
      }
    };

    sizeAccuracyRing();
    fade();
    map.on('zoom', sizeAccuracyRing);
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
          duration: CAMERA_EASE_MS,
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

    const padding = panelAwarePadding(map, { hasPanel: true });
    const targetZoom = Math.max(map.getZoom(), STATION_FOCUS_ZOOM);

    map.easeTo({
      center: userLocation.coordinates,
      zoom: targetZoom,
      padding,
      duration: CAMERA_EASE_MS,
      essential: true,
    });
  }, [userLocation]);

  const clearBusMarkers = () => {
    busMarkersRef.current.forEach((m) => {
      try {
        m.remove();
      } catch (err) {
        // ignore if already removed
      }
    });
    busMarkersRef.current = [];
  };

  // ── EMT Bus Integration Prototype Effect ──────────────────────────────────────
  // Handles bus ribbons, satellite feeder nodes, live bus vehicles, and mode layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const syncBus = () => {
      ensureBusLayers(map, theme);
      clearBusMarkers();

      // VARIANT A: Multimodal Hub Feeder with Persistent EMT Bus Stops
      if (variant === 'A') {
        setBusRoutesData(map, []);

        // 1. Persistent EMT bus stops across the map (square EMT markers)
        const allStops = getAllBusStops();
        allStops.forEach((stop) => {
          const marker = createFeederStopMarker(map, stop, () => {
            if (onSelectBusStop) onSelectBusStop(stop);
          });
          busMarkersRef.current.push(marker);
        });

        // 2. When a station/ping is focused, draw the 5-min walk radius circle + dashed feeder walk links
        if (selectedStation) {
          const coords = snappedCoordinates(selectedStation);
          const centerCoords = (userLocation?.isMapClick && userLocation?.coordinates) || coords;
          const feeders = getStationBusFeeders(selectedStation.properties.name, centerCoords);
          setFeederWalkLinks(map, centerCoords, feeders);
        } else {
          setFeederWalkLinks(map, null, []);
        }
      }

      // VARIANT B: Line-on-Demand Canvas
      else if (variant === 'B') {
        setFeederWalkLinks(map, null, []);

        if (activeBusLine) {
          setBusRoutesData(map, [activeBusLine]);

          // Zoom to route
          if (activeBusLine.coordinates && activeBusLine.coordinates.length > 0) {
            const bounds = activeBusLine.coordinates.reduce(
              (b, c) => b.extend(c),
              new LngLatBounds(activeBusLine.coordinates[0], activeBusLine.coordinates[0])
            );
            map.fitBounds(bounds, {
              padding: { top: 120, bottom: 220, left: 60, right: 60 },
              duration: 900,
              maxZoom: 15,
            });
          }

          // Route stops
          (activeBusLine.stops || []).forEach((st) => {
            const marker = createBusStopNodeMarker(map, st, (stop) => {
              if (onSelectBusStop) onSelectBusStop(stop);
            });
            busMarkersRef.current.push(marker);
          });

          // Active live AVL buses on this line
          const lineBuses = LIVE_BUS_TELEMETRY.filter(
            (b) => String(b.line).toLowerCase() === String(activeBusLine.id).toLowerCase()
          );
          lineBuses.forEach((bus) => {
            const marker = createLiveBusMarker(map, bus, (b) => {
              if (onSelectBusLine) onSelectBusLine(activeBusLine);
            });
            busMarkersRef.current.push(marker);
          });
        } else {
          setBusRoutesData(map, []);
        }
      }

      // VARIANT C: Dual-Lens Mode Switcher
      else if (variant === 'C') {
        setFeederWalkLinks(map, null, []);

        if (activeMode === 'bus') {
          const primaryTrunks = EMT_LINES.slice(0, 5);
          setBusRoutesData(map, primaryTrunks);

          if (map.getLayer('metro-fill')) map.setPaintProperty('metro-fill', 'line-opacity', 0.15);
          if (map.getLayer('metro-casing')) map.setPaintProperty('metro-casing', 'line-opacity', 0.10);

          primaryTrunks.forEach((line) => {
            (line.stops || []).forEach((st) => {
              const marker = createBusStopNodeMarker(map, st, (stop) => {
                if (onSelectBusStop) onSelectBusStop(stop);
              });
              busMarkersRef.current.push(marker);
            });
          });

          LIVE_BUS_TELEMETRY.forEach((bus) => {
            const marker = createLiveBusMarker(map, bus, (b) => {
              const foundLine = EMT_LINES.find((l) => l.id === b.line);
              if (foundLine && onSelectBusLine) onSelectBusLine(foundLine);
            });
            busMarkersRef.current.push(marker);
          });
        } else if (activeMode === 'all') {
          setBusRoutesData(map, EMT_LINES.slice(0, 3));
          if (map.getLayer('metro-fill')) map.setPaintProperty('metro-fill', 'line-opacity', 0.85);
          if (map.getLayer('metro-casing')) map.setPaintProperty('metro-casing', 'line-opacity', 0.35);
        } else {
          setBusRoutesData(map, []);
          if (map.getLayer('metro-fill')) map.setPaintProperty('metro-fill', 'line-opacity', 0.95);
          if (map.getLayer('metro-casing')) map.setPaintProperty('metro-casing', 'line-opacity', 0.35);
        }
      }
    };

    if (map.isStyleLoaded()) {
      syncBus();
    } else {
      map.once('style.load', syncBus);
    }

    return () => {
      clearBusMarkers();
    };
  }, [variant, selectedStation, activeBusLine, activeMode, theme, onSelectBusStop, onSelectBusLine]);

  return (
    <div
      ref={containerRef}
      className="map-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default MapView;
