#!/usr/bin/env node
const fs = require('fs');

const inPath = './data/line4_osm_raw_overpass.json';
const outPath = './public/line4_osm.geojson';
if (!fs.existsSync(inPath)) {
  console.error('Input OSM JSON not found:', inPath);
  process.exit(1);
}
const osm = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const nodes = new Map();
const ways = new Map();
const relations = [];
for (const el of osm.elements || []) {
  if (el.type === 'node') nodes.set(el.id, [el.lon, el.lat]);
  else if (el.type === 'way') ways.set(el.id, el);
  else if (el.type === 'relation') relations.push(el);
}

// Find relation(s) that likely correspond to Line 4 (route=... ref=4)
const lineRelations = relations.filter(r => (r.tags && (r.tags.ref === '4' || String(r.tags.name || '').includes('4') || r.tags.route)));
let memberWayIds = new Set();
for (const rel of lineRelations) {
  for (const m of rel.members || []) {
    if (m.type === 'way') memberWayIds.add(m.ref);
  }
}
// Fallback: any way with "railway" or "rail" tags in the dataset
if (memberWayIds.size === 0) {
  for (const [id, w] of ways) {
    if (w.tags && (w.tags.railway || w.tags.route || w.tags.public_transport)) memberWayIds.add(id);
  }
}

const features = [];
for (const wayId of memberWayIds) {
  const w = ways.get(wayId);
  if (!w || !Array.isArray(w.nodes)) continue;
  const coords = [];
  for (const nid of w.nodes) {
    const c = nodes.get(nid);
    if (c) coords.push(c);
  }
  if (coords.length >= 2) {
    features.push({
      type: 'Feature',
      properties: { id: `osm-way-${wayId}`, source: 'osm' , tags: w.tags || {}},
      geometry: { type: 'LineString', coordinates: coords },
    });
  }
}

if (features.length === 0) {
  console.error('No way features generated from OSM JSON');
  process.exit(1);
}
const geo = { type: 'FeatureCollection', features };
fs.writeFileSync(outPath, JSON.stringify(geo, null, 2));
console.log('Wrote', outPath, 'with', features.length, 'LineString features');
