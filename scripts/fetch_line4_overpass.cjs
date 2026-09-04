#!/usr/bin/env node
// Fetch Line 4 geometry from Overpass and write GeoJSON to src/data/line4_osm.geojson
// Usage: npm run fetch:line4 (install deps: node-fetch and osmtogeojson)

const fs = require('fs');
const fetch = require('node-fetch');
const osmtogeojson = require('osmtogeojson');

const query = `[out:json][timeout:25];
relation["route"~"subway|light_rail|tram"]["ref"="4"]["network"~"Metro|metro|Metrovalencia"];(._;>;);out body;`;

(async () => {
  try {
    console.log('Posting Overpass query...');
    const res = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const osmJson = await res.json();
    console.log('Converting OSM JSON to GeoJSON...');
    const geo = osmtogeojson(osmJson);
    const outPath = './public/line4_osm.geojson';
    fs.writeFileSync(outPath, JSON.stringify(geo, null, 2));
    console.log('Wrote', outPath);
  } catch (err) {
    console.error('Failed to fetch/convert Line 4:', err);
    process.exit(1);
  }
})();
