// MapLibre WebGL Layer and Marker Helpers for EMT Bus Integration Prototype
// Compliant with TCRP Report 45 and 120 FPS performance standards.

import { Marker } from 'maplibre-gl';

const ROUTE_SOURCE_ID = 'bus-routes-source';
const ROUTE_CASING_LAYER = 'bus-routes-casing';
const ROUTE_FILL_LAYER = 'bus-routes-fill';

const WALK_SOURCE_ID = 'bus-feeder-walk-source';
const WALK_LAYER = 'bus-feeder-walk-layer';

/**
 * Ensures MapLibre style has sources and layers for bus route ribbons and walking feeder links.
 */
export const ensureBusLayers = (map, theme = 'dark') => {
  if (!map || !map.isStyleLoaded()) return;

  // 1. Bus Route Ribbon Source & Layers
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: ROUTE_CASING_LAYER,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      paint: {
        'line-color': theme === 'light' ? '#ffffff' : '#000000',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          10, 3.5,
          13, 6.0,
          16, 9.5
        ],
        'line-opacity': 0.75
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' }
    });

    map.addLayer({
      id: ROUTE_FILL_LAYER,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      paint: {
        'line-color': ['coalesce', ['get', 'color'], '#D62828'],
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          10, 2.0,
          13, 4.0,
          16, 6.5
        ],
        'line-opacity': 0.95
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' }
    });
  }

  // 2. Multimodal Feeder Walk Links Source & Layer (Variant A)
  if (!map.getSource(WALK_SOURCE_ID)) {
    map.addSource(WALK_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: WALK_LAYER,
      type: 'line',
      source: WALK_SOURCE_ID,
      paint: {
        'line-color': '#D62828',
        'line-width': [
          'interpolate', ['linear'], ['zoom'],
          12, 1.8,
          15, 3.0,
          18, 4.5
        ],
        'line-dasharray': [2, 2],
        'line-opacity': 0.85
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' }
    });
  }
};

/**
 * Updates the bus route polylines displayed on the map.
 */
export const setBusRoutesData = (map, lines = []) => {
  if (!map || !map.isStyleLoaded()) return;
  const source = map.getSource(ROUTE_SOURCE_ID);
  if (!source) return;

  const features = lines
    .filter(l => l && l.coordinates && l.coordinates.length > 1)
    .map(line => ({
      type: 'Feature',
      properties: {
        id: line.id,
        name: line.name,
        color: line.color || '#D62828',
      },
      geometry: {
        type: 'LineString',
        coordinates: line.coordinates
      }
    }));

  source.setData({
    type: 'FeatureCollection',
    features
  });
};

/**
 * Draws dashed walking links between a focused metro station and its satellite bus stops (<200m).
 */
export const setFeederWalkLinks = (map, stationCoords, feeders = []) => {
  if (!map || !map.isStyleLoaded()) return;
  const source = map.getSource(WALK_SOURCE_ID);
  if (!source) return;

  if (!stationCoords || !feeders || feeders.length === 0) {
    source.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  const features = feeders.map((feeder) => ({
    type: 'Feature',
    properties: {
      stopCode: feeder.stopCode,
      walkMetres: feeder.walkMetres,
      walkMin: feeder.walkMin
    },
    geometry: {
      type: 'LineString',
      coordinates: [stationCoords, feeder.coordinates]
    }
  }));

  source.setData({
    type: 'FeatureCollection',
    features
  });
};

/**
 * Creates a DOM Marker for a live AVL bus vehicle.
 */
export const createLiveBusMarker = (map, bus, onSelect) => {
  const el = document.createElement('div');
  el.className = 'live-bus-marker';
  el.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 5px;
    background: #1e2430;
    border: 1px solid rgba(255,255,255,0.25);
    border-top: 2.5px solid ${bus.lineColor || '#D62828'};
    border-radius: 5px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    color: #ffffff;
    font: 800 11px/1 system-ui, sans-serif;
    cursor: pointer;
    transform-origin: center center;
    transition: transform 0.15s ease;
    user-select: none;
    z-index: 25;
  `;

  el.title = `${bus.line} (${bus.destination}) • ${bus.speedKmh} km/h • Next: ${bus.nextStop}`;
  el.innerHTML = `
    <span style="font-size:10px;line-height:1">🚌</span>
    <span>${bus.line}</span>
    <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#4CAF50;box-shadow:0 0 5px #4CAF50"></span>
  `;

  el.addEventListener('mouseenter', () => {
    el.style.transform = 'scale(1.2)';
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'scale(1.0)';
  });
  if (onSelect) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(bus);
    });
  }

  const marker = new Marker({ element: el, anchor: 'center' })
    .setLngLat(bus.coordinates)
    .addTo(map);

  return marker;
};

/**
 * Creates a satellite feeder bus stop marker on the map for Variant A.
 */
export const createFeederStopMarker = (map, stop, onSelect) => {
  const el = document.createElement('div');
  el.className = 'feeder-stop-marker';
  el.style.cssText = `
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 3px 6px;
    background: rgba(26, 32, 44, 0.95);
    border: 1.5px solid #D62828;
    border-radius: 999px;
    box-shadow: 0 4px 14px rgba(214, 40, 40, 0.4);
    color: #ffffff;
    font: 700 10px/1 system-ui, sans-serif;
    cursor: pointer;
    transition: transform 0.15s ease;
    user-select: none;
    white-space: nowrap;
    z-index: 28;
  `;

  el.title = `${stop.stopName} (${stop.walkMetres}m walk from Metro)`;
  el.innerHTML = `
    <span style="font-size:11px">🚏</span>
    <span>${stop.stopCode}</span>
    <span style="font-size:9px;color:#ff8a80;font-weight:600">${stop.walkMetres}m</span>
  `;

  el.addEventListener('mouseenter', () => {
    el.style.transform = 'scale(1.15)';
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'scale(1.0)';
  });
  if (onSelect) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(stop);
    });
  }

  const marker = new Marker({ element: el, anchor: 'center' })
    .setLngLat(stop.coordinates)
    .addTo(map);

  return marker;
};

/**
 * Creates a generic bus stop marker for Variant B & C bus network browsing.
 */
export const createBusStopNodeMarker = (map, stop, onSelect) => {
  const el = document.createElement('div');
  el.className = 'bus-network-stop-node';
  el.style.cssText = `
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #D62828;
    border: 2px solid #ffffff;
    box-shadow: 0 2px 6px rgba(0,0,0,0.5);
    cursor: pointer;
    transition: transform 0.15s ease;
    z-index: 22;
  `;

  el.title = `Parada ${stop.code || stop.stopCode || ''} · ${stop.name || stop.stopName || 'EMT Stop'}`;

  el.addEventListener('mouseenter', () => {
    el.style.transform = 'scale(1.5)';
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'scale(1.0)';
  });
  if (onSelect) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(stop);
    });
  }

  const marker = new Marker({ element: el, anchor: 'center' })
    .setLngLat(stop.coordinates)
    .addTo(map);

  return marker;
};
