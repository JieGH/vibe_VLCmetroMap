import React, { useEffect, useMemo, useRef } from 'react';
import { Map as MapLibreMap, Marker, LngLatBounds, addProtocol, setWorkerUrl } from 'maplibre-gl';
import { Protocol, PMTiles } from 'pmtiles';
import { Capacitor } from '@capacitor/core';
import { createBoundedRangeSource } from '../utils/boundedRangeSource';
import { buildVectorLabels, buildVectorNoLabels } from '../utils/mapStyle';
import 'maplibre-gl/dist/maplibre-gl.css';
import metroData from '../data/metro_lines.json';
import gtfsData from '../data/gtfs_expanded.json';
import imageLineColors from '../data/line_colors_from_image.json';
import lineRenderConfig from '../data/line_render_config.js';
import {
  DEFAULT_MAP_ZOOM,
  MAP_PIN_MIN_ZOOM,
  DEFAULT_MAP_CENTER,
  STATION_FOCUS_ZOOM,
  CAMERA_EASE_MS,
  fitBoundsOptions,
  panelAwarePadding as computePanelPadding,
  focusTarget,
  restingSheetRect,
  samePadding,
  recentreOnResize,
  visibleCentreLngLat,
  visibleCentreScreenPoint,
} from '../utils/mapCamera';
import { buildCentrePing, createCentrePinSync, createUserGestureGate, isCentrePinRefresh, movedEnough } from '../utils/centrePin';
import { centreGesture, createThrottle } from '../utils/centrePinBuffer';
import { pinMarkup, pinWrapperStyle } from '../utils/pinIcon';

// Safety net if `moveend` never arrives before the pin's drop (ease is CAMERA_EASE_MS).
const PIN_DROP_FALLBACK_MS = 900;
import { MAP_REGION_BOUNDS, regionMinZoom } from '../utils/mapRegion';
import { zoomCurve, dotScale, trainScale } from '../utils/zoomCurve';
import { lineRanks, allowedRank } from '../utils/lineReveal';
import { probeOfflineBasemap } from '../utils/basemapProbe';
import { startTrainTracker } from '../services/trainTracker';
import { useTranslation, translate } from '../i18n';
import arrivalStore, { NETWORK_SYNC_INTERVAL_MS, STATION_ID_MAP } from '../services/arrivalStore';
import trainPositionEngine from '../services/trainPositionEngine';
import { hasMapSelection, fadesAllVehicles } from '../utils/selectionFocus';
import { renderStationHighlight, renderBusStopHighlight } from '../utils/focusNode';
import { getDistance, nearestFeature, nearestPointOnPath, pathsOffReference } from '../utils/geoUtils';
import { pickWalkSet, WALK_RADIUS_METRO_METRES, WALK_RADIUS_BUS_METRES } from '../utils/walkRadius';
import returnTrackData from '../data/return_tracks.json';
import { emtStage, EMT_MARKER_MIN_ZOOM, thinStopsForZoom } from '../utils/emtDotMode';
import { markerSyncPlan } from '../utils/markerSync';
import { dimmedVehicleOpacity, vehicleShouldPulse, withMapLines, paintLineDim } from '../utils/lineDim';
import {
  ensureBusLayers,
  setBusRoutesData,
  setFeederWalkLinks,
  createFeederStopMarker,
} from '../utils/busMapLayers';
import { getStationBusFeeders, getAllBusStops, getStopDisplayCoordinates } from '../data/emtData';

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

let OFFLINE_BASEMAP_AVAILABLE = false;

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

// Background asynchronous basemap probe (unblocks main JS thread & React mounting)
const initBasemapPromise = (typeof window !== 'undefined')
  ? probeOfflineBasemap(BASEMAP_ARCHIVE, fetch, pmtilesProtocol).then((available) => {
      OFFLINE_BASEMAP_AVAILABLE = available;
    }).catch(() => {})
  : Promise.resolve();

// Snapped positions are what the map draws, so a Station handed in from
// somewhere that has not snapped it — userLocation's Nearest Station, say —
// still has to be drawn and framed at the same place as its own dot.
const snappedCoordinates = (station) => {
  if (!station) return [DEFAULT_MAP_CENTER[0], DEFAULT_MAP_CENTER[1]];
  const name = station.properties?.name;
  const snapped = name ? snappedByName.get(name) : null;
  return snapped?.geometry?.coordinates || station.geometry?.coordinates || [DEFAULT_MAP_CENTER[0], DEFAULT_MAP_CENTER[1]];
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
      'line-opacity': 0.15,
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
      'line-opacity': 0.35,
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
  // Building footprints and library POIs are omitted to keep the transit lines clear and minimize visual clutter.
  layers: [
    ...buildVectorNoLabels(flavour),
    ...structuredClone(metroLayers),
    ...buildVectorLabels(flavour, 'en'),
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
const vehicleOpacity = (v, selectedStation, selectedBusStop = null) =>
  dimmedVehicleOpacity(
    v.isLive ? (v.positionConfidence ?? 1) : 0.55,
    v.line,
    selectedStation,
    fadesAllVehicles(selectedStation, selectedBusStop)
  ).toFixed(2);

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

// Measures the real sheet and the search bar, then asks the pure usableArea rule (mapCamera) for the
// padding that centres a selected stop in what is left. The sheet's resting position comes from its
// layout offsets, so the slide-in animation cannot skew it.
const panelAwarePadding = (map, { hasPanel } = {}) => {
  const container = map?.getContainer();
  const containerRect = container ? container.getBoundingClientRect() : undefined;
  const searchBarRect = document.querySelector('.search-bar-container')?.getBoundingClientRect();
  const panel = document.querySelector('.station-panel, .bus-stop-board');

  const sheetRect = panel
    ? restingSheetRect({
        rect: panel.getBoundingClientRect(),
        offsetParentRect: panel.offsetParent?.getBoundingClientRect(),
        offsetTop: panel.offsetTop,
        offsetLeft: panel.offsetLeft,
      })
    : undefined;

  return computePanelPadding({
    containerRect,
    searchBarRect,
    sheetRect,
    hasPanel: hasPanel ?? Boolean(panel),
  });
};

// The viewer's blue dot, shared by the live marker (with its accuracy ring) and the static one that
// stays at the GPS fix while the centre pin has taken over `userLocation`.
const createUserDot = ({ accuracyRing = false } = {}) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'user-location-marker';
  wrapper.style.cssText = `
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 35;
  `;
  wrapper.innerHTML = `
    ${accuracyRing ? '<div class="user-location-accuracy" style="display:none;"></div>' : ''}
    <div class="user-location-dot"></div>
  `;
  return wrapper;
};

const MapView = ({
  theme,
  selectedStation: selectedStationProp,
  onSelectStation,
  activeLineFilter,
  hoverLine,
  userLocation,
  onReady,
  onUserInteract,
  selectedBusStop = null,
  onSelectBusStop = null,
  liveFixChannel = null,
  following = false,
  centrePinActive = false,
  gpsFix = null,
}) => {
  // Search hands in the raw feed's Station; focus must read like a tapped marker.
  const selectedStation = useMemo(
    () => withMapLines(selectedStationProp, snappedByName.get(selectedStationProp?.properties?.name)),
    [selectedStationProp]
  );
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
  const spawnedKeysRef = useRef(new Set()); // keys shown by the last spawn, for the radius hysteresis
  const nearbyKeysRef = useRef(new Set()); // m:/b: keys of the walk-radius stops whose base markers are magnified
  const selectedBusStopRef = useRef(selectedBusStop);
  useEffect(() => { selectedBusStopRef.current = selectedBusStop; }, [selectedBusStop]);
  const onSelectBusStopRef = useRef(onSelectBusStop);
  useEffect(() => { onSelectBusStopRef.current = onSelectBusStop; }, [onSelectBusStop]);
  // What the camera is centring on and the padding it was centred under, so a resized sheet or window
  // can re-centre the same target (see the usable-area effect below).
  const focusCoordsRef  = useRef(null);
  const focusPaddingRef = useRef(null);
  const prevStationRef  = useRef(null); // previous selectedStation to detect un-focus transitions
  const userLocationRef = useRef(userLocation);
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);
  const followingRef = useRef(following);
  useEffect(() => { followingRef.current = following; }, [following]);
  const userDotRef = useRef(null); // { move(fix) } for the live dot; per-fix updates bypass React (#104)
  const prevUserLocationRef = useRef(null); // previous userLocation to detect clear transitions
  const zoomScaleRef    = useRef(1); // raw zoomCurve value, updated on every zoom event
  const zoomValueRef    = useRef(DEFAULT_MAP_ZOOM); // current map zoom
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
      const isSelected = el.classList.contains('is-selected');
      const hide = ranks ? ranks[i] > maxRank : curve < 0.55;
      if (hide && !isSelected) {
        el.style.visibility = 'hidden';
        el.style.pointerEvents = 'none';
      } else {
        el.style.visibility = '';
        el.style.pointerEvents = '';
        el.style.transition = 'none';
        if (!isSelected) {
          el.style.transform = `scale(${(ranks ? Math.max(dotScale(zoom), 0.7) : dotScale(zoom)).toFixed(3)})`;
        }
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
    if (liveVehicles && liveVehicles.length > 0) {
      const pinned = liveVehicles.filter(v => v.sightingCount > 1).length;
      trainCountRef.current.textContent = pinned > 0
        ? translate(lang, 'mapView.trainCountPinned', { count: liveVehicles.length, pinned })
        : translate(lang, 'mapView.trainCountLive', { count: liveVehicles.length });
      trainCountRef.current.style.display = '';
    } else {
      trainCountRef.current.textContent = translate(lang, 'mapView.trainCountNone');
      trainCountRef.current.style.display = 'none';
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

      const selectedMetroName = (selectedStationRef.current && !selectedStationRef.current.isPin && !selectedStationRef.current.properties?.isPin && selectedStationRef.current.properties?.name !== 'Map Ping' && selectedStationRef.current.properties?.name !== "Where you're at")
        ? (selectedStationRef.current.properties?.name || selectedStationRef.current.name)
        : null;
      const isSelectedStation = Boolean(selectedMetroName && st.properties.name === selectedMetroName);

      const wrapper = document.createElement('div');
      wrapper.className = 'ml-station-marker-wrapper metro-stop-marker';
      wrapper.style.cssText = `display:flex; align-items:center; justify-content:center; cursor:pointer; user-select:none; z-index:${isSelectedStation ? '50' : '27'};`;

      const inner = document.createElement('div');
      inner.className = isSelectedStation ? 'metro-station-badge is-selected' : 'metro-station-badge';
      if (nearbyKeysRef.current.has(`m:${st.properties.name}`)) inner.classList.add('is-nearby');
      if (typeof inner.setAttribute === 'function') {
        inner.setAttribute('data-station-name', st.properties.name);
      }
      const isHovered = hoverRef.current && (st.properties.lines || []).includes(hoverRef.current);
      const isHidden = scale < 0.55 && !isSelectedStation;
      
      inner.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #E2001A;
        color: #ffffff;
        font-family: var(--font-ui);
        font-size: 9px;
        font-weight: 900;
        font-style: italic;
        line-height: 1;
        border: 1px solid rgba(255, 255, 255, 0.95);
        box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.35);
        transform: scale(${drawnScale.toFixed(3)});
        visibility: ${isHidden ? 'hidden' : ''};
        pointer-events: ${isHidden ? 'none' : ''};
        box-sizing: border-box;
        transform-origin: center center;
        transition: transform 0.12s ease-out;
        ${isHovered ? 'outline: 2px solid #FFD100;' : ''}
      `;
      inner.innerHTML = '<span style="transform: translateY(-0.5px); line-height: 1;">m</span>';
      wrapper.appendChild(inner);
      wrapper.title = st.properties.name;
      stInnerElemsRef.current.push(inner);

      wrapper.onmouseenter = () => {
        if (!inner.classList.contains('is-selected')) {
          inner.style.transform = `scale(${(dotScale(zoomValueRef.current) * 1.3).toFixed(3)})`;
        }
      };
      wrapper.onmouseleave = () => {
        if (!inner.classList.contains('is-selected')) {
          inner.style.transform = `scale(${dotScale(zoomValueRef.current).toFixed(3)})`;
        }
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

  // ── Relevant Vehicle Filter ────────────────────────────────────────────────
  // Only show running trains when:
  // 1. A line filter is active (shows trains on that line)
  // 2. A station is chosen (shows trains on lines serving that station)
  // 3. A pin location is placed (shows trains on lines serving stations near the pin)
  // If nothing is chosen, no running trains are shown on startup/overview.
  const getRelevantVehicles = (vehicles) => {
    const activeFilter = filterRef.current;
    const hasLineFilter = Array.isArray(activeFilter) && activeFilter.length > 0;
    const selected = selectedStationRef.current;
    const userLoc = userLocationRef.current;

    const isPin = Boolean(
      selected?.isPin ||
      selected?.properties?.isPin ||
      selected?.properties?.name === 'Map Ping' ||
      selected?.properties?.name === "Where you're at" ||
      userLoc?.isMapClick
    );
    const hasStation = Boolean(selected && !isPin);

    if (!hasLineFilter && !hasStation && !isPin) {
      return [];
    }

    return vehicles.filter((v) => {
      const vLine = String(v.line);

      // 1. Line filter: train must match the chosen line
      if (hasLineFilter && !activeFilter.map(String).includes(vLine)) {
        return false;
      }

      // 2. Station focus: train must be on a line serving this station
      if (hasStation) {
        const stationLines = (selected.properties?.lines || []).map(String);
        if (stationLines.length > 0 && !stationLines.includes(vLine)) {
          return false;
        }
      }

      // 3. Pin focus: train must serve a station near the pin location
      if (isPin) {
        const pinCoords = userLoc?.coordinates || selected?.geometry?.coordinates;
        if (pinCoords) {
          const nearby = (drawnStationsRef.current || stationFeatures).filter((st) => {
            const coords = snappedCoordinates(st);
            return coords && getDistance(pinCoords, coords) <= 800;
          });
          const nearbyLines = new Set(nearby.flatMap((st) => (st.properties?.lines || []).map(String)));
          if (nearbyLines.size > 0 && !nearbyLines.has(vLine)) {
            return false;
          }
        }
      }

      return true;
    });
  };

  // ── Initialize vehicle animation loop ──────────────────────────────────────
  // Runs on display V-Sync (native requestAnimationFrame), matching 60Hz and 120Hz
  // ProMotion screens with delta-time vehicle interpolation and zero cadence judder.
  const initVehicleLoop = (map) => {
    stopAnimation();
    clearVehicleMarkers();

    // Live vehicles only: no timetable/headway guesses are ever drawn.
    const liveNow = (now) => trainPositionEngine.getLiveVehiclesFromMemory(now)
      .map((v) => trainPositionEngine.smoothVehicle(v, now));
    let visible = getRelevantVehicles(liveNow(Date.now()));

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
        opacity:${vehicleOpacity(v, selectedStationRef.current, selectedBusStopRef.current)};
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
        opacity: vehicleOpacity(v, selectedStationRef.current, selectedBusStopRef.current),
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
      let currentVisible = getRelevantVehicles(currentVehicles);
      updateTrainCount(currentVisible);
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
          const opacity = vehicleOpacity(v, selectedStationRef.current, selectedBusStopRef.current);
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
      try {
        if (!map || !map.isStyleLoaded() || !map.style) return;
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
      } catch (err) {
        console.warn('applyLineFilter suppressed error during style transition:', err);
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
  const applyLineDim = (map) => paintLineDim(map, () => selectedStationRef.current);

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
        // Opens past the zoom where updateZoomScale's formula below caps marker scale at its
        // 1.2x maximum (12.3), so stations are already at their largest, easiest-to-tap size,
        // and past MAP_PIN_MIN_ZOOM, so a tap on the opening view sets a pin.
        zoom: DEFAULT_MAP_ZOOM,
        // The map never shows anything beyond the Metrovalencia region (#118): MapLibre clamps pans to the
        // box, and the minimum zoom is the one at which this viewport still fits inside it.
        maxBounds: MAP_REGION_BOUNDS,
        minZoom: regionMinZoom({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight }),
        // No (i) button on the map: OpenStreetMap, Protomaps and MapLibre are credited in About & Legal.
        attributionControl: false,
        maxTileCacheZoomLevels: 5,
        fadeDuration: 0,
      });

      // A bigger or turned screen needs a higher minimum zoom to stay inside the region.
      map.on('resize', () => {
        const { clientWidth, clientHeight } = map.getContainer();
        map.setMinZoom(regionMinZoom({ width: clientWidth, height: clientHeight }));
      });

      // `originalEvent` is set only when a hand moved the camera (drag, pinch,
      // wheel, key); the app's own easeTo/fitBounds carry none. That difference is
      // how auto-locate tells a viewer taking over from its own framing.
      map.on('movestart', (event) => {
        if (event.originalEvent && interactRef.current) interactRef.current();
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
        // EMT stops go dot -> logo -> line numbers with zoom (#108, #116): one attribute, hysteresis in emtStage.
        const el = containerRef.current;
        if (el) {
          const stage = emtStage(zoom, el.dataset.emtStage);
          if (el.dataset.emtStage !== stage) el.dataset.emtStage = stage;
        }
      };
      map.on('zoom', updateZoomScale);
      updateZoomScale();

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

        // Multimodal Walk Radius click on the map:
        // When zoomed in (MAP_PIN_MIN_ZOOM), clicking any point explores all transit
        // (Metro stations and EMT bus stops) within the walk radius (metro 320 m, bus 280 m, see walkRadius.js).
        if (currentZoom >= MAP_PIN_MIN_ZOOM) {
          const nearestToPing = drawnStationsRef.current && drawnStationsRef.current.length > 0
            ? nearestFeature(drawnStationsRef.current, [lng, lat])
            : null;
          const targetStation = {
            properties: {
              name: 'Map Ping',
              lines: [],
              isPin: true,
            },
            geometry: { type: 'Point', coordinates: [lng, lat] },
            isPin: true,
          };

          selectStRef.current(targetStation, {
            userLocation: {
              coordinates: [lng, lat],
              accuracy: 15,
              isMapClick: true,
              status: 'located',
              nearestStation: nearestToPing?.feature || null,
              fetchedAt: Date.now(),
            }
          });
          return;
        }

        if (selectedStationRef.current) {
          selectStRef.current(null);
        }
        if (selectedBusStopRef.current && onSelectBusStopRef.current) {
          onSelectBusStopRef.current(null);
        }
      });

      map.on('style.load', () => {
        // In dev, StrictMode double-mounts this effect, so a stale map from the
        // first mount can still be sitting on a pending style.load when the
        // second mount replaces mapRef.current. The marker refs are shared
        // across instances, so letting a stale callback through would clear the
        // live map's markers and re-attach them to the removed one.
        if (mapRef.current !== map) return;
        if (onReadyRef.current) {
          const notifyReady = onReadyRef.current;
          onReadyRef.current = null; // first style.load only; theme swaps reload the style
          notifyReady();
        }
        initStationMarkers(map);
        initVehicleLoop(map);
        markersReadyRef.current = true;
        applyLineFilter(map, filterRef.current);
        applyLineDim(map);
        ensureBusLayers(map, themeRef.current);
      });

      map.on('webglcontextlost', (e) => {
        console.warn('MapLibre WebGL context lost; preventing default to permit restoration.');
        if (e.originalEvent && typeof e.originalEvent.preventDefault === 'function') {
          e.originalEvent.preventDefault();
        }
      });

      map.on('webglcontextrestored', () => {
        console.info('MapLibre WebGL context restored; re-synchronizing layer state.');
        if (mapRef.current !== map) return;
        initStationMarkers(map);
        initVehicleLoop(map);
        markersReadyRef.current = true;
        applyLineFilter(map, filterRef.current);
        applyLineDim(map);
        ensureBusLayers(map, themeRef.current);
      });

      const stopTracker = startTrainTracker();

      teardown = () => {
        stopTracker();
        stopAnimation();
        clearVehicleMarkers();
        clearStationMarkers();
        clearBusMarkers();
        trainCount.remove();
        trainCountRef.current = null;
        map.remove();
        mapRef.current = null;
      };
    }).catch((err) => {
      console.warn('initBasemapPromise error handled:', err);
      if (onReadyRef.current) {
        const notifyReady = onReadyRef.current;
        onReadyRef.current = null;
        notifyReady();
      }
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
    if (!map.isStyleLoaded() || !map.style) return;
    try {
      map.setStyle(styleFor(theme), { diff: false });
    } catch (err) {
      console.warn('map.setStyle suppressed error during style transition:', err);
    }
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
    if (now.length > 0) {
      // Fetch arrivals for key stations on the selected line
      const lineStations = (drawnStationsRef.current || stationFeatures).filter((st) =>
        (st.properties?.lines || []).some((l) => now.includes(String(l)))
      );
      lineStations.slice(0, 5).forEach((st) => {
        if (st.properties) arrivalStore.getStationArrivals(st.properties);
      });
    }
    if (added.length > 0) {
      const onLine = stationFeatures.filter((st) => (st.properties.lines || []).some((l) => now.includes(String(l))));
      if (onLine.length > 1) {
        const bounds = new LngLatBounds(onLine[0].geometry.coordinates, onLine[0].geometry.coordinates);
        onLine.forEach((st) => bounds.extend(st.geometry.coordinates));
        const pad = panelAwarePadding(map, { hasPanel: Boolean(selectedStationRef.current) });
        map.fitBounds(bounds, fitBoundsOptions({
          top: pad.top + 56, // the line-chip row under the search pill
          bottom: Math.max(pad.bottom, 0) + 32,
          left: Math.max(pad.left, 0) + 32,
          right: Math.max(pad.right, 0) + 32,
        }, { maxZoom: 13, duration: CAMERA_EASE_MS, essential: true }));
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
    applyLineDim(map);
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
      // Closing never moves the camera (#95): the target stays centred where selection put it.
      prevStationRef.current = null;
      return undefined;
    }

    // Live tracking refreshes the GPS hub in place (#104): same hub, new fix. Rebuild its pieces but leave the camera.
    const isHubRefresh = (prevStationRef.current?.properties?.apiId === 'user-location-gps' &&
      selectedStation.properties?.apiId === 'user-location-gps') ||
      // A centre-pin publish (#136) refreshes the hub in place whatever was selected before (the first pan
      // after a GPS press comes from the GPS hub): no focus ease, so the camera never fights a pan.
      (isCentrePinRefresh(userLocation) && Boolean(selectedStation.isPin));
    prevStationRef.current = selectedStation;

    const isPinTarget = Boolean(
      selectedStation.isPin ||
      selectedStation.properties?.isPin ||
      selectedStation.properties?.name === 'Map Ping' ||
      selectedStation.properties?.name === "Where you're at"
    );

    const coordinates = snappedCoordinates(selectedStation);

    // Fetch arrivals for the selected station / pin location and surrounding stations
    if (isPinTarget) {
      const pinCoords = userLocationRef.current?.coordinates || coordinates;
      if (pinCoords) {
        const nearby = (drawnStationsRef.current || stationFeatures).filter((st) => {
          const coords = snappedCoordinates(st);
          return coords && getDistance(pinCoords, coords) <= 800;
        });
        nearby.slice(0, 4).forEach((st) => {
          if (st.properties) arrivalStore.getStationArrivals(st.properties);
        });
      }
    } else if (selectedStation.properties) {
      arrivalStore.getStationArrivals(selectedStation.properties);
      const nearby = (drawnStationsRef.current || stationFeatures).filter((st) => {
        if (st.properties?.name === selectedStation.properties?.name) return false;
        const coords = snappedCoordinates(st);
        return coords && getDistance(coordinates, coords) <= 800;
      });
      nearby.slice(0, 3).forEach((st) => {
        if (st.properties) arrivalStore.getStationArrivals(st.properties);
      });
    }

    let marker = null;
    if (!isPinTarget) {
      const element = document.createElement('div');
      element.className = 'station-focus-node';
      // A visual anchor only — no countdowns to tick, so it's rendered once per
      // selection rather than on an interval. Arrivals live in the Station panel.
      element.innerHTML = renderStationHighlight(selectedStation.properties, themeRef.current, true);
      marker = new Marker({ element, anchor: 'center', offset: [0, 0] })
        .setLngLat(coordinates)
        .addTo(map);
      focusMarkerRef.current = marker;
    }

    // The panel shares this render (same selectedStation update), so it is
    // already in the DOM once this effect runs and can be measured.
    const isPinMode = Boolean(
      isPinTarget ||
      userLocationRef.current?.isMapClick ||
      userLocationRef.current?.status === 'located'
    );

    const focusCoords = (isPinMode && userLocationRef.current?.coordinates)
      ? userLocationRef.current.coordinates
      : coordinates;

    focusCoordsRef.current = focusCoords;
    focusPaddingRef.current = panelAwarePadding(map, { hasPanel: true });
    if (!isHubRefresh) {
      focusTarget(map, focusCoords, focusPaddingRef.current);
    }

    return () => {
      if (marker) {
        marker.remove();
      }
      if (focusMarkerRef.current === marker) focusMarkerRef.current = null;
    };
  }, [selectedStation, selectedBusStop]);

  // ── Bus Stop in focus ───────────────────────────────────────────────────────
  // Clicking an EMT bus stop anchors a compact marker (EMT badge + shortened name + lines)
  // and smoothly centers the visible map on the stop matching metro/pin movement.
  const prevBusStopRef = useRef(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    if (busFocusMarkerRef.current) {
      busFocusMarkerRef.current.remove();
      busFocusMarkerRef.current = null;
    }

    if (!selectedBusStop) {
      // Closing never moves the camera (#95).
      prevBusStopRef.current = null;
      return undefined;
    }

    if (focusMarkerRef.current) {
      focusMarkerRef.current.remove();
      focusMarkerRef.current = null;
    }

    prevBusStopRef.current = selectedBusStop;
    const coordinates = selectedBusStop.coordinates;
    if (!coordinates || !Array.isArray(coordinates)) return undefined;

    let marker = null;
    const element = document.createElement('div');
    element.className = 'bus-focus-node';
    element.innerHTML = renderBusStopHighlight(selectedBusStop, themeRef.current, true, languageRef.current);
    marker = new Marker({ element, anchor: 'center', offset: [0, 0] })
      .setLngLat(getStopDisplayCoordinates(selectedBusStop) || coordinates)
      .addTo(map);
    busFocusMarkerRef.current = marker;

    // Centre the drawn marker (#106 display offset), not the real stop coordinate,
    // so the marker the rider sees is what ends up in the middle.
    focusCoordsRef.current = getStopDisplayCoordinates(selectedBusStop) || coordinates;
    focusPaddingRef.current = panelAwarePadding(map, { hasPanel: true });
    focusTarget(map, focusCoordsRef.current, focusPaddingRef.current);

    return () => {
      if (marker) {
        marker.remove();
      }
      if (busFocusMarkerRef.current === marker) busFocusMarkerRef.current = null;
    };
  }, [selectedBusStop, selectedStation]);

  // ── Keep the selection centred in the usable map area ───────────────────────
  // The sheet grows after its first paint (arrivals load, expand toggles) and the window can be
  // resized, so the padding measured at selection goes stale. Watch the sheet and the map, and
  // when the usable area really changes ease the same target to its new centre. Zoom is kept (#94)
  // and nothing happens when the padding is unchanged, so the ease started by selection is not
  // restarted and the camera cannot loop (moving it never resizes the sheet). Closing the sheet
  // removes the observer and moves nothing (#95).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || (!selectedBusStop && !selectedStation) || typeof ResizeObserver === 'undefined') return undefined;

    let frame = 0;
    const recentre = () => {
      frame = 0;
      const coords = focusCoordsRef.current;
      if (!coords) return;
      const padding = panelAwarePadding(map, { hasPanel: true });
      if (samePadding(padding, focusPaddingRef.current)) return;
      focusPaddingRef.current = padding;
      recentreOnResize(map, coords, padding);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(recentre);
    };

    const observer = new ResizeObserver(schedule);
    const panel = document.querySelector('.station-panel, .bus-stop-board');
    if (panel) observer.observe(panel);
    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [selectedStation, selectedBusStop]);

  // ── Highlight active chosen station or bus stop ─────────────────
  const updateStopHighlights = () => {
    const container = containerRef.current;
    if (!container) return;

    const selectedMetroName = (selectedStationRef.current && !selectedStationRef.current.isPin && !selectedStationRef.current.properties?.isPin && selectedStationRef.current.properties?.name !== 'Map Ping' && selectedStationRef.current.properties?.name !== "Where you're at")
      ? (selectedStationRef.current.properties?.name || selectedStationRef.current.name)
      : null;

    container.querySelectorAll('.metro-station-badge').forEach((el) => {
      const match = Boolean(selectedMetroName && el.getAttribute('data-station-name') === selectedMetroName);
      el.classList.toggle('is-nearby', nearbyKeysRef.current.has(`m:${el.getAttribute('data-station-name')}`));
      if (match) {
        el.classList.add('is-selected');
        if (el.parentElement?.parentElement) {
          el.parentElement.parentElement.style.zIndex = '50';
        }
      } else {
        el.classList.remove('is-selected');
        if (el.parentElement?.parentElement) {
          el.parentElement.parentElement.style.zIndex = '';
        }
      }
    });

    const selectedStopCode = selectedBusStopRef.current
      ? String(selectedBusStopRef.current.stopCode || selectedBusStopRef.current.code || '')
      : null;

    container.querySelectorAll('.emt-stop-badge').forEach((el) => {
      const match = Boolean(selectedStopCode && el.getAttribute('data-stop-code') === selectedStopCode);
      el.classList.toggle('is-nearby', nearbyKeysRef.current.has(`b:${el.getAttribute('data-stop-code')}`));
      if (match) {
        el.classList.add('is-selected');
        if (el.parentElement?.parentElement) {
          el.parentElement.parentElement.style.zIndex = '50';
        }
      } else {
        el.classList.remove('is-selected');
        if (el.parentElement?.parentElement) {
          el.parentElement.parentElement.style.zIndex = '';
        }
      }
    });
  };

  useEffect(() => {
    updateStopHighlights();
  }, [selectedStation, selectedBusStop]);

  // ── The viewer's own dot ───────────────────────────────────────────────────
  // A MapLibre Marker rather than a style layer, matching every other marker
  // here, which also means it survives the setStyle a theme flip performs.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userLocation || userLocation.status !== 'located') return undefined;

    const isPing = Boolean(userLocation.isMapClick);
    // The centre pin is a screen-fixed overlay (below), not a map marker that would slide with the map.
    if (isPing && centrePinActive) return undefined;
    const wrapper = isPing ? document.createElement('div') : createUserDot({ accuracyRing: true });

    if (isPing) {
      wrapper.className = 'user-ping-marker';
      wrapper.style.cssText = `position: relative; cursor: pointer; z-index: 35; ${pinWrapperStyle}`;
      wrapper.innerHTML = pinMarkup();
      wrapper.onclick = (e) => {
        e.stopPropagation();
        focusTarget(map, userLocation.coordinates, panelAwarePadding(map, { hasPanel: true }), {
          minZoom: 15.2,
          essential: false,
        });
      };
    }

    const marker = new Marker({ element: wrapper, anchor: isPing ? 'bottom' : 'center' })
      .setLngLat(userLocation.coordinates)
      .addTo(map);

    // The dot's position and accuracy may be fresher than `userLocation` (live tracking moves it per fix).
    let shown = { coordinates: userLocation.coordinates, accuracy: userLocation.accuracy, updatedAt: userLocation.updatedAt ?? userLocation.fetchedAt };

    const sizeAccuracyRing = () => {
      if (isPing) return;
      const accuracyRing = wrapper.querySelector('.user-location-accuracy');
      if (!accuracyRing) return;
      if (!Number.isFinite(shown.accuracy)) {
        accuracyRing.style.display = 'none';
        return;
      }
      const scale = metresPerPixel(shown.coordinates[1], map.getZoom());
      const diameter = (2 * shown.accuracy) / scale;
      accuracyRing.style.display = diameter < 26 ? 'none' : '';
      accuracyRing.style.width = `${diameter}px`;
      accuracyRing.style.height = `${diameter}px`;
    };

    const fade = () => {
      if (!isPing) {
        wrapper.style.opacity = userFixOpacity(Date.now() - shown.updatedAt);
      }
    };

    sizeAccuracyRing();
    fade();
    map.on('zoom', sizeAccuracyRing);
    const fadeTimer = setInterval(fade, 5000);

    // Live tracking: move only this marker (no React render, no other layer touched). When following, ease the
    // camera at the current zoom (#94) once the dot drifts out of the middle of the visible area, and never
    // while the viewer is mid-gesture or has panned away (`following` is then false).
    const FOLLOW_SLACK_PX = 60;
    const move = (fix) => {
      if (isPing || !fix) return;
      shown = fix;
      marker.setLngLat(fix.coordinates);
      sizeAccuracyRing();
      fade();
      if (!followingRef.current) return;
      const dot = map.project(fix.coordinates);
      const middle = map.project(map.getCenter());
      if (Math.hypot(dot.x - middle.x, dot.y - middle.y) > FOLLOW_SLACK_PX) {
        map.easeTo({ center: fix.coordinates, duration: CAMERA_EASE_MS, essential: false });
      }
    };
    userDotRef.current = { move };
    const unsubscribe = liveFixChannel ? liveFixChannel.subscribe(move) : null;
    const pending = liveFixChannel?.get();
    if (pending) move(pending);

    return () => {
      userDotRef.current = null;
      if (unsubscribe) unsubscribe();
      map.off('zoom', sizeAccuracyRing);
      clearInterval(fadeTimer);
      marker.remove();
    };
  }, [userLocation, centrePinActive]);

  // While the centre pin has replaced the GPS dot's location, keep the blue dot where the fix was (it moves
  // with the map). Static: live tracking is stopped by then, and the dot is the same markup as the live one.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !gpsFix?.coordinates) return undefined;
    const marker = new Marker({ element: createUserDot(), anchor: 'center' }).setLngLat(gpsFix.coordinates).addTo(map);
    return () => marker.remove();
  }, [gpsFix]);

  // ── Magnify the walk-radius stops in place when a pin or GPS fix is the focus ───────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return undefined;

    const isPingOrGps = Boolean(
      userLocation?.isMapClick ||
      (userLocation?.status === 'located' && userLocation?.coordinates && (selectedStation?.isPin || !selectedStation))
    );
    if (!isPingOrGps || !userLocation?.coordinates) {
      spawnedKeysRef.current = new Set();
      nearbyKeysRef.current = new Set();
      updateStopHighlights();
      return undefined;
    }

    const pinCoords = userLocation.coordinates;
    const keep = spawnedKeysRef.current;
    const shown = new Set();

    // 1. Surrounding Metro Stations within the walk radius (nearest one if none)
    const nearbyStations = pickWalkSet(drawnStationsRef.current, pinCoords, {
      getCoords: snappedCoordinates,
      getKey: (st) => `m:${st.properties.name}`,
      keep,
      radiusMetres: WALK_RADIUS_METRO_METRES,
      fallbackMaxMetres: Infinity, // the metro fallback is kept as is (#122)
    }).items.map(({ item }) => item);

    nearbyStations.forEach((st) => shown.add(`m:${st.properties.name}`));

    // 2. Surrounding EMT Bus Stops
    const allBusStops = getAllBusStops();
    // Distance is to the stop's real coordinate; the marker is drawn at its display offset.
    const nearbyBusStops = pickWalkSet(allBusStops, pinCoords, {
      getCoords: (stop) => stop.coordinates,
      getKey: (stop) => `b:${stop.stopCode}`,
      keep,
      radiusMetres: WALK_RADIUS_BUS_METRES,
      allowFallback: !userLocation.isMapClick, // a map ping never spawns a far stop (#122)
    }).items.map(({ item }) => item);

    nearbyBusStops.forEach((stop) => shown.add(`b:${stop.stopCode}`));

    spawnedKeysRef.current = shown;
    // The base markers just get magnified (CSS .is-nearby); the chosen one is hidden under its highlight.
    nearbyKeysRef.current = shown;
    updateStopHighlights();
  }, [userLocation, selectedStation, selectedBusStop]);

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
      // Dismissing the ping/location never moves the camera (#95).
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
    // The centre pin sits at the map centre already; framing it would only fight the viewer's pan (#136).
    if (isCentrePinRefresh(userLocation)) return;

    focusTarget(map, userLocation.coordinates, panelAwarePadding(map, { hasPanel: true }), {
      minZoom: STATION_FOCUS_ZOOM,
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
      // #115: markers are DOM and never wait for the style; only the layer work does (see markerSyncPlan).
      const plan = markerSyncPlan(map.isStyleLoaded());
      const styled = (fn, ...args) => (plan.layers ? fn(...args) : undefined);
      if (plan.retryOnIdle) map.once('idle', syncBus);
      styled(ensureBusLayers, map, theme);
      clearBusMarkers();

      // Multimodal Hub Feeder with Persistent EMT Bus Stops
      styled(setBusRoutesData, map, []);

      // 1. Persistent EMT bus stops across the map (rectangular EMT badges)
      const allStops = getAllBusStops();
      const currentZoom = map.getZoom();

      // Gated to EMT_MARKER_MIN_ZOOM (below the opening zoom, so the dots show on open) and viewport-culled (+30% buffer) to ensure 60fps performance with 1,155 stops
      if (currentZoom >= EMT_MARKER_MIN_ZOOM) {
        const bounds = map.getBounds();
        const lngSpan = bounds.getEast() - bounds.getWest();
        const latSpan = bounds.getNorth() - bounds.getSouth();
        const minLng = bounds.getWest() - lngSpan * 0.3;
        const maxLng = bounds.getEast() + lngSpan * 0.3;
        const minLat = bounds.getSouth() - latSpan * 0.3;
        const maxLat = bounds.getNorth() + latSpan * 0.3;

        // Zoomed out one dot per street is enough (#140); the selected stop is added back below.
        const visibleStops = thinStopsForZoom(
          allStops,
          currentZoom,
          map.getCenter().lat,
          emtStage(currentZoom, containerRef.current?.dataset.emtStage)
        ).filter((stop) => {
          const [lng, lat] = stop.coordinates;
          return lng >= minLng && lng <= maxLng && lat >= minLat && lat <= maxLat;
        });

        // Always ensure selected bus stop is mounted if present
        if (selectedBusStopRef.current?.coordinates) {
          const selCode = String(selectedBusStopRef.current.stopCode);
          if (!visibleStops.some((s) => String(s.stopCode) === selCode)) {
            visibleStops.push(selectedBusStopRef.current);
          }
        }

        const selectedCode = selectedBusStopRef.current
          ? String(selectedBusStopRef.current.stopCode || selectedBusStopRef.current.code || '')
          : null;

        visibleStops.forEach((stop) => {
          const stopCode = String(stop.stopCode || stop.code || '');
          const isSelected = Boolean(selectedCode && stopCode === selectedCode);
          const marker = createFeederStopMarker(map, stop, () => {
            if (onSelectBusStop) onSelectBusStop(stop);
          }, isSelected, languageRef.current);
          busMarkersRef.current.push(marker);
        });
      }

      // 2. When a station/ping is focused, draw the walk radius circle + dashed feeder walk links
      if (selectedStation) {
        const coords = snappedCoordinates(selectedStation);
        const centerCoords = (userLocation?.isMapClick && userLocation?.coordinates) || coords;
        const feeders = getStationBusFeeders(selectedStation.properties.name, centerCoords);
        styled(setFeederWalkLinks, map, centerCoords, feeders);
      } else {
        styled(setFeederWalkLinks, map, null, []);
      }

      updateStopHighlights();
    };

    syncBus();

    map.on('moveend', syncBus);

    return () => {
      map.off('moveend', syncBus);
      map.off('idle', syncBus);
      clearBusMarkers();
    };
  }, [selectedStation, theme, onSelectBusStop]);

  const hasPin = Boolean(
    userLocation?.isMapClick ||
    (userLocation?.status === 'located' && userLocation?.coordinates) ||
    selectedStation?.isPin ||
    selectedStation?.properties?.isPin ||
    selectedStation?.properties?.name === 'Map Ping' ||
    selectedStation?.properties?.name === "Where you're at"
  );

  // Centre pin (#134): while active, the pin is the middle of the visible map. Each gesture end
  // (debounced) republishes the centre as a Map Ping, so hub, nodes and walk radii follow it.
  // Nothing is drawn here: the ping marker is reused.
  const centreSyncRef = useRef(null);
  const centrePinElRef = useRef(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!centrePinActive || !map) return undefined;
    const publishCentre = (centre) => {
      const nearest = drawnStationsRef.current?.length ? nearestFeature(drawnStationsRef.current, centre) : null;
      const { station, userLocation: pingLocation } = buildCentrePing(centre, Date.now(), nearest?.feature || null);
      selectStRef.current(station, { userLocation: { ...pingLocation, centrePin: true }, centrePin: true });
    };
    const getLast = () => userLocationRef.current?.coordinates;
    centreGesture.setActive(true);
    const sync = createCentrePinSync({
      map,
      getLast,
      publish: publishCentre,
      // The gesture is over once the debounce fires: bus arrivals may be fetched for the final position (ADR-0013).
      onSettle: () => centreGesture.setMoving(false),
    });
    // Mid-drag: republish on a throttle so the list, nodes and metro rows (local data) follow the pin live.
    // This makes no network request: the bus section waits for `moving` to clear.
    const midDrag = createThrottle(() => {
      const centre = visibleCentreLngLat(map);
      if (movedEnough(getLast(), centre)) publishCentre(centre);
    });
    centreSyncRef.current = sync;
    // Only hand gestures move the pin; the app's own camera eases (locate, selection focus) do not.
    // A hand gesture that interrupts an ease can show up as any of these starts, so all of them count.
    const gate = createUserGestureGate(sync.schedule, {
      onHandStart: () => centreGesture.setMoving(true),
      onHandMove: midDrag,
    });
    const starts = ['movestart', 'dragstart', 'zoomstart', 'rotatestart', 'pitchstart'];
    starts.forEach((name) => map.on(name, gate.onUserStart));
    map.on('move', gate.onMove);
    map.on('moveend', gate.onMoveEnd);
    return () => {
      starts.forEach((name) => map.off(name, gate.onUserStart));
      map.off('move', gate.onMove);
      map.off('moveend', gate.onMoveEnd);
      midDrag.cancel();
      centreGesture.setActive(false);
      sync.cancel();
      centreSyncRef.current = null;
    };
  }, [centrePinActive]);

  // The centre pin itself: a screen-fixed element at the visible-map centre (above the sheet), so it stays
  // put under the finger while the map and the blue dot slide. Same look as the ping marker; it never
  // takes pointer events, so map gestures pass through.
  useEffect(() => {
    const map = mapRef.current;
    if (!centrePinActive || !map) return undefined;
    const el = document.createElement('div');
    el.className = 'user-ping-marker centre-pin-overlay';
    el.style.cssText = `position: absolute; left: 0; top: 0; pointer-events: none; z-index: 35; ${pinWrapperStyle}`;
    el.innerHTML = pinMarkup();
    centrePinElRef.current = el;
    const place = () => {
      const { x, y } = visibleCentreScreenPoint(map);
      el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
    };
    place();
    map.getContainer().appendChild(el);
    map.on('move', place);
    map.on('resize', place);
    return () => {
      map.off('move', place);
      map.off('resize', place);
      if (centrePinElRef.current === el) centrePinElRef.current = null;
      el.remove();
    };
  }, [centrePinActive]);

  // A locate press (a fresh, non-ping fix) drops the pin at the visible centre once the camera has settled
  // on the fix, so the green dot exists immediately without a pan. Declared after the framing effect, so
  // that ease has started (isMoving) by the time this runs.
  const pressFixKey = userLocation?.status === 'located' && !userLocation.isMapClick ? userLocation.fetchedAt : null;
  // A new tap placement (not the centre pin's own drag republish, which carries `centrePin`).
  const tapDropKey = userLocation?.status === 'located' && userLocation.isMapClick && !userLocation.centrePin ? userLocation.fetchedAt : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!centrePinActive || !map || (pressFixKey == null && tapDropKey == null)) return undefined;
    const inner = centrePinElRef.current?.querySelector('.map-pin-drop');
    let timer = null;
    let played = false;
    // The pin stays hidden while the camera eases to the spot, then drops onto it once (CSS animation only).
    const play = () => {
      if (played) return;
      played = true;
      clearTimeout(timer);
      map.off('moveend', play);
      if (inner) {
        inner.classList.remove('is-awaiting', 'is-dropping');
        void inner.offsetWidth;
        inner.classList.add('is-dropping');
      }
      if (pressFixKey != null) centreSyncRef.current?.schedule({ force: true });
    };
    if (inner) {
      inner.classList.remove('is-dropping');
      inner.classList.add('is-awaiting');
    }
    if (map.isMoving()) {
      map.once('moveend', play);
      timer = setTimeout(play, PIN_DROP_FALLBACK_MS);
    } else {
      play();
    }
    return () => {
      played = true;
      clearTimeout(timer);
      map.off('moveend', play);
      inner?.classList.remove('is-awaiting');
    };
  }, [centrePinActive, pressFixKey, tapDropKey]);

  return (
    <div
      ref={containerRef}
      className="map-container"
      data-has-pin={hasPin ? 'true' : 'false'}
      data-has-selection={hasMapSelection(selectedStation, selectedBusStop) ? 'true' : 'false'}
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default MapView;
