// Generates the MapLibre styles (dark/light) and the merged Line GeoJSON for the
// native app, replicating what src/components/MapView.jsx assembles at runtime.
// Run from the repo root (tools/sync-data.sh does): node android-native/tools/build-style.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const require = createRequire(resolve(repo, 'package.json'));
const { buildVectorNoLabels, buildVectorLabels } = await import(resolve(repo, 'src/utils/mapStyle.js'));
const { pathsOffReference } = await import(resolve(repo, 'src/utils/geoUtils.js'));
const lineRenderConfig = (await import(resolve(repo, 'src/data/line_render_config.js'))).default;

const readJson = (p) => JSON.parse(readFileSync(resolve(repo, p), 'utf8'));
const metroData = readJson('src/data/metro_lines.json');
const gtfsData = readJson('src/data/gtfs_expanded.json');
const imageLineColors = readJson('src/data/line_colors_from_image.json');
const returnTrackData = readJson('src/data/return_tracks.json');
let line4Osm = null;
try { line4Osm = readJson('public/line4_osm.geojson'); } catch { /* optional, as in the web app */ }

const isLine = (f) => f.geometry && f.geometry.type === 'LineString';

// ---- Line features (same precedence as MapView.jsx) -------------------------
const lineById = new Map();
for (const f of metroData.features.filter(isLine)) {
  if (f.properties?.line) lineById.set(String(f.properties.line), { ...f });
}
if (line4Osm?.features?.length) {
  const longest = line4Osm.features.reduce((best, cur) => {
    if (!isLine(cur)) return best;
    const len = cur.geometry.coordinates.length;
    return !best || len > best.len ? { feat: cur, len } : best;
  }, null);
  if (longest) {
    lineById.set('4', { ...longest.feat, properties: { ...longest.feat.properties, line: '4', source: 'osm' } });
  }
}
for (const f of (gtfsData.features ?? []).filter(isLine)) {
  const id = f.properties?.line && String(f.properties.line);
  if (!id) continue;
  const preferGTFS = (lineRenderConfig.useGTFS ?? []).map(String).includes(id);
  if (preferGTFS || !lineById.has(id)) lineById.set(id, { ...f });
}
const lineFeatures = [...lineById.values()].map((f) => {
  const lid = String(f.properties.line);
  return { ...f, properties: { ...f.properties, color: imageLineColors[lid] || f.properties.color || '#888888', offset: 0 } };
});
// Smoothing is configured empty (applyTo: []) in line_render_config.js, so it is skipped here.

const returnLegFeatures = lineFeatures.flatMap((f) => {
  const id = String(f.properties.line);
  const rt = returnTrackData.lines?.[id];
  if (!rt || !isLine(f)) return [];
  return pathsOffReference(rt.coordinates, f.geometry.coordinates, lineRenderConfig.sharedToleranceMeters)
    .map((coordinates) => ({
      type: 'Feature',
      properties: { ...f.properties, offset: 0, returnLeg: true },
      geometry: { type: 'LineString', coordinates },
    }));
});
const lineGeoJSON = { type: 'FeatureCollection', features: [...lineFeatures, ...returnLegFeatures] };

// ---- Metro layers (verbatim from MapView.jsx metroLayers) --------------------
const widthFill = ['interpolate', ['linear'], ['zoom'], 6, 0.75, 8, 1.2, 10, 1.8, 11.5, 2.4, 13, 3.4, 15, 4.8, 17, 6.8, 19, 9.0];
const widthCasing = ['interpolate', ['linear'], ['zoom'], 6, 1.2, 8, 1.8, 10, 2.6, 11.5, 3.4, 13, 4.6, 15, 6.2, 17, 8.5, 19, 11.0];
const offsetExpr = ['interpolate', ['linear'], ['zoom'],
  6, 0,
  8, ['*', ['get', 'offset'], 0.15],
  10, ['*', ['get', 'offset'], 0.35],
  11.5, ['*', ['get', 'offset'], 0.6],
  13, ['*', ['get', 'offset'], 0.85],
  15, ['*', ['get', 'offset'], 1.1],
  17, ['*', ['get', 'offset'], 1.4],
  19, ['*', ['get', 'offset'], 1.8]];
const layout = { 'line-cap': 'round', 'line-join': 'round' };
const metroLayers = () => [
  { id: 'metro-casing', type: 'line', source: 'metro-lines', layout,
    paint: { 'line-color': '#000000', 'line-width': widthCasing, 'line-opacity': 0.35, 'line-offset': offsetExpr } },
  { id: 'metro-fill', type: 'line', source: 'metro-lines', layout,
    paint: { 'line-color': ['get', 'color'], 'line-width': widthFill, 'line-offset': offsetExpr } },
];

// ---- Styles -------------------------------------------------------------------
// asset:// is resolved by MapLibre Native against the APK's assets/ folder.
const FLAVOURS = { dark: 'dark', light: 'white' };
const outDir = resolve(here, '../app/src/main/assets/basemap');
mkdirSync(outDir, { recursive: true });

for (const [theme, flavour] of Object.entries(FLAVOURS)) {
  const style = {
    version: 8,
    glyphs: 'asset://basemap/fonts/{fontstack}/{range}.pbf',
    sprite: `asset://basemap/sprites/${flavour}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: 'pmtiles://asset://basemap/valencia.pmtiles',
        attribution: '© OpenStreetMap · Protomaps',
      },
      // Empty here; the app loads data/lines.geojson (or its own merged result) into this source.
      'metro-lines': { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, tolerance: 0.6, buffer: 128 },
    },
    layers: [...buildVectorNoLabels(flavour), ...metroLayers(), ...buildVectorLabels(flavour, 'en')],
  };
  writeFileSync(resolve(outDir, `style-${theme}.json`), JSON.stringify(style));
  console.log(`style-${theme}.json: ${style.layers.length} layers`);
}
mkdirSync(resolve(here, '../app/src/main/assets/data'), { recursive: true });
writeFileSync(resolve(here, '../app/src/main/assets/data/lines.geojson'), JSON.stringify(lineGeoJSON));
console.log(`lines.geojson: ${lineGeoJSON.features.length} features (${returnLegFeatures.length} return legs)`);
