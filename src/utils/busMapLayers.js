// MapLibre WebGL Layer and Marker Helpers for EMT Bus Integration Prototype
// Compliant with TCRP Report 45 and 120 FPS performance standards.

import { Marker } from 'maplibre-gl';
import { createCircleGeoJSON } from './geoUtils';
import { getStopDisplayCoordinates } from '../data/emtData';

const ROUTE_SOURCE_ID = 'bus-routes-source';
const ROUTE_CASING_LAYER = 'bus-routes-casing';
const ROUTE_FILL_LAYER = 'bus-routes-fill';

const WALK_SOURCE_ID = 'bus-feeder-walk-source';
const WALK_LAYER = 'bus-feeder-walk-layer';

const WALK_RADIUS_SOURCE_ID = 'bus-walk-radius-source';
const WALK_RADIUS_FILL_LAYER = 'bus-walk-radius-fill';
const WALK_RADIUS_LINE_LAYER = 'bus-walk-radius-line';

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

  // 3. Multimodal 10-Minute Walk Radius Circle (Variant A)
  if (!map.getSource(WALK_RADIUS_SOURCE_ID)) {
    map.addSource(WALK_RADIUS_SOURCE_ID, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.addLayer({
      id: WALK_RADIUS_FILL_LAYER,
      type: 'fill',
      source: WALK_RADIUS_SOURCE_ID,
      paint: {
        'fill-color': '#D62828',
        'fill-opacity': 0.05
      }
    });

    map.addLayer({
      id: WALK_RADIUS_LINE_LAYER,
      type: 'line',
      source: WALK_RADIUS_SOURCE_ID,
      paint: {
        'line-color': '#D62828',
        'line-width': 1.5,
        'line-dasharray': [4, 3],
        'line-opacity': 0.45
      }
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
 * Draws the 10-minute walk radius circle (~800m) and dashed walking links to nearby bus stops.
 */
export const setFeederWalkLinks = (map, stationCoords, feeders = []) => {
  if (!map || !map.isStyleLoaded()) return;
  const source = map.getSource(WALK_SOURCE_ID);
  const radiusSource = map.getSource(WALK_RADIUS_SOURCE_ID);

  if (!stationCoords || !feeders || feeders.length === 0) {
    if (source) source.setData({ type: 'FeatureCollection', features: [] });
    if (radiusSource) radiusSource.setData({ type: 'FeatureCollection', features: [] });
    return;
  }

  // Draw 5-minute walk boundary circle (~400m)
  if (radiusSource) {
    radiusSource.setData(createCircleGeoJSON(stationCoords, 400));
  }

  if (source) {
    const features = feeders.map((feeder) => ({
      type: 'Feature',
      properties: {
        stopCode: feeder.stopCode,
        walkMetres: feeder.walkMetres,
        walkMin: feeder.walkMin
      },
      geometry: {
        type: 'LineString',
        // End at the drawn (display-offset) marker position; real coords stay on the feeder.
        coordinates: [stationCoords, getStopDisplayCoordinates(feeder) || feeder.coordinates]
      }
    }));

    source.setData({
      type: 'FeatureCollection',
      features
    });
  }
};

/**
 * Creates a DOM Marker for a live AVL bus vehicle.
 */
export const createLiveBusMarker = (map, bus, onSelect) => {
  // Outer element is positioned by MapLibre; the pill inside carries the visuals so
  // the Text Size zoom (.live-bus-pill in index.css) never touches the map transform.
  const el = document.createElement('div');
  el.className = 'live-bus-marker';
  const pill = document.createElement('div');
  pill.className = 'live-bus-pill';
  el.style.cssText = 'z-index: 25;';
  pill.style.cssText = `
    display: flex;
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
  `;

  el.title = `${bus.line} (${bus.destination}) • ${bus.speedKmh} km/h • Next: ${bus.nextStop}`;
  pill.innerHTML = `
    <span style="font-size:8px;font-weight:900;background:#ffffff;color:#D62828;padding:1px 2px;border-radius:2px;line-height:1">EMT</span>
    <span>${bus.line}</span>
    <span style="display:inline-block;width:5px;height:5px;border-radius:50%;background:#4CAF50;box-shadow:0 0 5px #4CAF50"></span>
  `;

  el.addEventListener('mouseenter', () => {
    pill.style.transform = 'scale(1.2)';
  });
  el.addEventListener('mouseleave', () => {
    pill.style.transform = 'scale(1.0)';
  });
  if (onSelect) {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(bus);
    });
  }

  el.appendChild(pill);

  const marker = new Marker({ element: el, anchor: 'center' })
    .setLngLat(bus.coordinates)
    .addTo(map);

  return marker;
};

/**
 * Creates a persistent EMT bus stop marker on the map: a compact rectangular badge wrapping the three-letter EMT text.
 * The outer marker element contains no transition on transform, eliminating any jelly/lag during map navigation.
 */
export const createFeederStopMarker = (map, stop, onSelect, isSelected = false) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'emt-stop-marker';
  wrapper.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    user-select: none;
    z-index: ${isSelected ? '50' : '26'};
  `;

  const inner = document.createElement('div');
  inner.className = isSelected ? 'emt-stop-badge is-selected' : 'emt-stop-badge';
  if (typeof inner.setAttribute === 'function') {
    inner.setAttribute('data-stop-code', String(stop.stopCode || stop.code || ''));
  }
  inner.style.cssText = `
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 1.5px 3px;
    border-radius: 3.5px;
    background: #D62828;
    color: #ffffff;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 0.03em;
    line-height: 1;
    border: 1px solid rgba(255, 255, 255, 0.95);
    box-shadow: 0 1.5px 4px rgba(0, 0, 0, 0.35);
    box-sizing: border-box;
    transition: transform 0.12s ease-out;
  `;
  inner.innerHTML = `<span style="transform: translateY(-0.5px); line-height: 1;">EMT</span>`;
  wrapper.appendChild(inner);

  wrapper.title = `Parada ${stop.stopCode || stop.code || ''} · ${stop.stopName || stop.name || 'EMT Stop'}`;

  wrapper.addEventListener('mouseenter', () => {
    if (!inner.classList.contains('is-selected')) {
      inner.style.transform = 'scale(1.22)';
    }
  });
  wrapper.addEventListener('mouseleave', () => {
    if (!inner.classList.contains('is-selected')) {
      inner.style.transform = 'scale(1.0)';
    }
  });
  if (onSelect) {
    wrapper.addEventListener('click', (e) => {
      e.stopPropagation();
      onSelect(stop);
    });
  }

  const marker = new Marker({ element: wrapper, anchor: 'center' })
    .setLngLat(getStopDisplayCoordinates(stop))
    .addTo(map);

  return marker;
};

/**
 * Creates a generic bus stop marker for Variant B & C bus network browsing.
 */
export const createBusStopNodeMarker = (map, stop, onSelect, isSelected = false) => {
  return createFeederStopMarker(map, stop, onSelect, isSelected);
};
