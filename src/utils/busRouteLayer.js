// Highlighted line 19 route on the map while the line is in focus (live bus feature). One GeoJSON source
// with the two direction polylines plus the line's stops, drawn as casing + coloured line + chevrons +
// stop rings, below the DOM bus markers. Idempotent: ensure/remove are safe to call on every style.load.
import route from '../data/line19_route.json';

export const LINE19_COLOR = '#D62828'; // the one EMT red every bus badge uses (no line specific colour exists)
export const BUS_HL_SOURCE = 'bus-line-hl-source';
export const BUS_HL_LAYERS = ['bus-line-hl-casing', 'bus-line-hl-fill', 'bus-line-hl-arrows', 'bus-line-hl-stops'];

/** FeatureCollection: one LineString per direction and one Point per route stop (deduplicated by code). */
export function buildBusRouteGeoJSON(data = route) {
  const features = [];
  const seen = new Set();
  for (const d of data?.directions || []) {
    if (Array.isArray(d.polyline) && d.polyline.length > 1) {
      features.push({ type: 'Feature', properties: { kind: 'route', direction: d.id }, geometry: { type: 'LineString', coordinates: d.polyline } });
    }
  }
  for (const d of data?.directions || []) {
    for (const s of d.stops || []) {
      if (seen.has(s.stopCode) || !Array.isArray(s.coordinates)) continue;
      seen.add(s.stopCode);
      features.push({ type: 'Feature', properties: { kind: 'stop', stopCode: s.stopCode }, geometry: { type: 'Point', coordinates: s.coordinates } });
    }
  }
  return { type: 'FeatureCollection', features };
}

const widthExpr = (a, b, c) => ['interpolate', ['linear'], ['zoom'], 10, a, 14, b, 17, c];

export function ensureBusRouteLayer(map, theme = 'dark') {
  if (!map || !map.isStyleLoaded()) return;
  const casing = theme === 'light' ? '#ffffff' : '#101418';
  if (!map.getSource(BUS_HL_SOURCE)) map.addSource(BUS_HL_SOURCE, { type: 'geojson', data: buildBusRouteGeoJSON() });
  const isRoute = ['==', ['get', 'kind'], 'route'];
  const layers = [
    { id: BUS_HL_LAYERS[0], type: 'line', filter: isRoute, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': casing, 'line-width': widthExpr(5, 9, 13), 'line-opacity': 0.7 } },
    { id: BUS_HL_LAYERS[1], type: 'line', filter: isRoute, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': LINE19_COLOR, 'line-width': widthExpr(2.5, 5, 8), 'line-opacity': 0.8 } },
    { id: BUS_HL_LAYERS[2], type: 'symbol', filter: isRoute,
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 90, 'text-field': '›', 'text-size': 18, 'text-font': ['Noto Sans Bold'], 'text-keep-upright': false, 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': '#ffffff', 'text-opacity': 0.9 } },
    { id: BUS_HL_LAYERS[3], type: 'circle', filter: ['==', ['get', 'kind'], 'stop'],
      paint: { 'circle-radius': widthExpr(3, 5, 7), 'circle-color': '#ffffff', 'circle-stroke-color': LINE19_COLOR, 'circle-stroke-width': widthExpr(1.5, 2.5, 3) } },
  ];
  for (const l of layers) {
    if (map.getLayer(l.id)) continue;
    try { map.addLayer({ ...l, source: BUS_HL_SOURCE }); } catch (e) { if (l.type !== 'symbol') throw e; }
  }
}

export function removeBusRouteLayer(map) {
  if (!map) return;
  try {
    for (const id of [...BUS_HL_LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(BUS_HL_SOURCE)) map.removeSource(BUS_HL_SOURCE);
  } catch { /* style mid-reload: the layers are gone with it */ }
}
