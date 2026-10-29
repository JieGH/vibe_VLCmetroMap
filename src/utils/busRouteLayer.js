// Highlighted line 19 route on the map while the line is in focus (live bus feature). One GeoJSON source
// with the two direction polylines, drawn as casing + coloured line + chevrons, below the DOM bus markers.
// Stops are not drawn here: the map's regular EMT stop markers stay the only stop UI.
// Idempotent: ensure/remove are safe to call on every style.load.
import route from '../data/line19_route.json';

export const LINE19_COLOR = '#D62828'; // the one EMT red every bus badge uses (no line specific colour exists)
export const BUS_HL_SOURCE = 'bus-line-hl-source';
export const BUS_HL_LAYERS = ['bus-line-hl-casing', 'bus-line-hl-fill', 'bus-line-hl-arrows'];
// Layers an older build of this feature added (route stop rings). A hot reload or a style kept across an
// update can leave them (and a source they pin) behind, so ensure/remove clear them first.
const LEGACY_LAYERS = ['bus-line-hl-stops'];
export const BUS_HL_ARROW_IMAGE = 'bus-line-hl-chevron';

/** FeatureCollection: one LineString per direction. */
export function buildBusRouteGeoJSON(data = route) {
  const features = [];
  for (const d of data?.directions || []) {
    if (Array.isArray(d.polyline) && d.polyline.length > 1) {
      features.push({ type: 'Feature', properties: { kind: 'route', direction: d.id }, geometry: { type: 'LineString', coordinates: d.polyline } });
    }
  }
  return { type: 'FeatureCollection', features };
}

const widthExpr = (a, b, c) => ['interpolate', ['linear'], ['zoom'], 10, a, 14, b, 17, c];

/**
 * RGBA pixels of a white ">" chevron with a dark outline, drawn from distances to its two strokes, so no
 * canvas or font glyph is needed (the glyph route rendered a tiny, unreliable "›"). Pure.
 * @param {number} size square size in pixels
 */
export function buildChevronImage(size = 48) {
  const data = new Uint8Array(size * size * 4);
  const k = size / 24;
  const pts = [[6.5 * k, 4.5 * k], [17.5 * k, 12 * k], [6.5 * k, 19.5 * k]];
  const dist = (x, y, [ax, ay], [bx, by]) => {
    const dx = bx - ax; const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.min(dist(x + 0.5, y + 0.5, pts[0], pts[1]), dist(x + 0.5, y + 0.5, pts[1], pts[2]));
      const i = (y * size + x) * 4;
      if (d <= 2.2 * k) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255; }
      else if (d <= 3.6 * k) { data[i] = 16; data[i + 1] = 20; data[i + 2] = 24; data[i + 3] = 235; }
    }
  }
  return { width: size, height: size, data };
}

export function ensureBusRouteLayer(map, theme = 'dark') {
  if (!map || !map.isStyleLoaded()) return;
  for (const id of LEGACY_LAYERS) if (map.getLayer(id)) map.removeLayer(id);
  const casing = theme === 'light' ? '#ffffff' : '#101418';
  let hasChevron = false;
  try {
    if (typeof map.hasImage === 'function' && typeof map.addImage === 'function') {
      if (!map.hasImage(BUS_HL_ARROW_IMAGE)) map.addImage(BUS_HL_ARROW_IMAGE, buildChevronImage(), { pixelRatio: 2 });
      hasChevron = true;
    }
  } catch { hasChevron = false; }
  if (!map.getSource(BUS_HL_SOURCE)) map.addSource(BUS_HL_SOURCE, { type: 'geojson', data: buildBusRouteGeoJSON() });
  const isRoute = ['==', ['get', 'kind'], 'route'];
  const layers = [
    { id: BUS_HL_LAYERS[0], type: 'line', filter: isRoute, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': casing, 'line-width': widthExpr(7, 12, 19), 'line-opacity': 0.92 } },
    { id: BUS_HL_LAYERS[1], type: 'line', filter: isRoute, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': LINE19_COLOR, 'line-width': widthExpr(4, 7.5, 12), 'line-opacity': 1 } },
  ];
  if (hasChevron) {
    layers.push({ id: BUS_HL_LAYERS[2], type: 'symbol', filter: isRoute,
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 160, 'icon-image': BUS_HL_ARROW_IMAGE, 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.4, 14, 0.6, 17, 0.8], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      paint: { 'icon-opacity': 1 } });
  }
  for (const l of layers) {
    if (map.getLayer(l.id)) continue;
    try { map.addLayer({ ...l, source: BUS_HL_SOURCE }); } catch (e) { if (l.type !== 'symbol') throw e; }
  }
}

export function removeBusRouteLayer(map) {
  if (!map) return;
  try {
    for (const id of [...BUS_HL_LAYERS, ...LEGACY_LAYERS].reverse()) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(BUS_HL_SOURCE)) map.removeSource(BUS_HL_SOURCE);
  } catch { /* style mid-reload: the layers are gone with it */ }
}
