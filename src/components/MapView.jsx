import React, { useEffect, useRef } from 'react';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import metroData from '../data/metro_lines.json';
import gtfsData from '../data/gtfs_expanded.json';
import imageLineColors from '../data/line_colors_from_image.json';
import lineRenderConfig from '../data/line_render_config.js';

// Line 4's OSM-derived geometry is fetched rather than imported, so its 209 KB
// stays out of the JS chunk. It lives in public/ because that is the only
// directory Vite copies into a build verbatim — served from src/ it resolved in
// dev and 404'd in production, where the catch below swallowed the failure and
// line 4 silently fell back to the coarser metro_lines.json geometry.
// Failing to load it is not fatal — line 4 falls back to the metro_lines.json
// alignment — but it must not be silent, because that silence is exactly how
// the production 404 went unnoticed.
let line4Osm = null;
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
import arrivalStore from '../services/arrivalStore';
import trainPositionEngine from '../services/trainPositionEngine';

// Long enough to stay well inside the upstream rate budget, short enough that
// no prediction reaches the 18-minute age-out before being replaced.
const NETWORK_SYNC_INTERVAL_MS = 120000;

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
const stationFeatures = [
  ...gtfsStations,
  ...metroData.features.filter(
    f => f.geometry.type === 'Point' && !gtfsStationNames.has(f.properties.name)
  ),
];
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

const buildStyle = (tiles, tileSourceId) => ({
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    [tileSourceId]: { type: 'raster', tiles, tileSize: 256, attribution: TILE_ATTRIBUTION },
    'metro-lines': { type: 'geojson', data: lineGeoJSON, tolerance: 0.6, buffer: 128 },
  },
  layers: [
    { id: `${tileSourceId}-tiles`, type: 'raster', source: tileSourceId },
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
  ],
});

const DARK_STYLE  = buildStyle(DARK_TILES,  'basemap-dark');
const LIGHT_STYLE = buildStyle(LIGHT_TILES, 'basemap-light');

/** Picks the first line's color for a station marker border */
const stationBorderColor = (st) => {
  const lines = st.properties.lines || [];
  return lines.length > 0 ? (lineColorMap[lines[0]] || '#aaaaaa') : '#aaaaaa';
};

// ─── Component ────────────────────────────────────────────────────────────────
const MapView = ({ theme, selectedStation, flyTarget, onSelectStation, activeLineFilter, hoverLine }) => {
  const containerRef    = useRef(null);
  const mapRef          = useRef(null);
  const stMarkersRef    = useRef([]);
  const animFrameRef    = useRef(null);
  const markerMapRef    = useRef(new globalThis.Map()); // native JS Map for vehicle markers
  const themeRef        = useRef(theme);
  const filterRef       = useRef(activeLineFilter);
  const hoverRef        = useRef(null);
  const selectStRef     = useRef(onSelectStation);
  const trainCountRef   = useRef(null);
  const zoomScaleRef    = useRef(1); // mutable scale factor updated on every zoom event
  const stInnerElemsRef = useRef([]); // refs to station inner elements for direct scale updates
  const vehInnerElemsRef= useRef([]); // refs to vehicle inner elements for direct scale updates

  useEffect(() => { themeRef.current = theme; }, [theme]);
  useEffect(() => { filterRef.current = activeLineFilter; }, [activeLineFilter]);
  useEffect(() => { selectStRef.current = onSelectStation; }, [onSelectStation]);
  useEffect(() => { hoverRef.current = hoverLine; }, [hoverLine]);

  const stopAnimation = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  };

  const clearVehicleMarkers = () => {
    markerMapRef.current.forEach(m => m.remove());
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
    return `L${v.line} → ${v.direction} • ${eta} ${v.targetStation}${pin}`;
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

    filteredStations.forEach((st) => {
      const sid = st.properties.stop_id || st.properties.id || st.properties.name;
      if (!sid) return;
      if (seenStops.has(sid)) return;
      seenStops.add(sid);

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
        opacity:${v.isLive ? 1 : 0.55};
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

      markerMapRef.current.set(v.id, marker);
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

      markerMapRef.current.forEach((marker, id) => {
        if (!visibleIds.has(id)) {
          marker.remove();
          markerMapRef.current.delete(id);
        }
      });

      currentVisible.forEach((v) => {
        const marker = markerMapRef.current.get(v.id);
        if (marker) {
          marker.setLngLat(v.coordinates);
          marker.getElement().title = describeVehicle(v);
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
      style: theme === 'dark' ? DARK_STYLE : LIGHT_STYLE,
      center: [-0.3763, 39.4699],
      zoom: 11.5,
    });

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

    map.on('style.load', () => {
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
    map.setStyle(theme === 'dark' ? DARK_STYLE : LIGHT_STYLE);
  }, [theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTarget) return;
    const [lng, lat] = flyTarget.geometry.coordinates;
    map.flyTo({
      center: [lng, lat],
      zoom: 14.5,
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

  return (
    <div
      ref={containerRef}
      className="map-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
};

export default MapView;
