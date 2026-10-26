// Fetches real EMT Valencia bus stops from the official Valencia Open Data Geoportal
// and writes them to src/data/emt_stops.json.
//
// Source: Geoportal del Ayuntamiento de València - OpenData Tráfico layer 226 (Paradas de autobús EMT)
// URL: https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/226/query?where=1=1&outFields=*&f=geojson
//
// Usage: node scripts/fetch_emt_stops.cjs

const https = require('https');
const fs = require('fs');
const path = require('path');

const GEOJSON_URL = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/226/query?where=1=1&outFields=*&f=geojson';
const OUTPUT_FILE = path.resolve(__dirname, '../src/data/emt_stops.json');

console.log(`Fetching EMT stops from ${GEOJSON_URL}...`);

https.get(GEOJSON_URL, (res) => {
  if (res.statusCode !== 200) {
    console.error(`Failed with status code: ${res.statusCode}`);
    process.exit(1);
  }

  let raw = '';
  res.on('data', (chunk) => { raw += chunk; });
  res.on('end', () => {
    try {
      const data = JSON.parse(raw);
      if (!data.features || !Array.isArray(data.features)) {
        throw new Error('Invalid GeoJSON: missing features array');
      }

      const stops = data.features
        .filter((f) => f.geometry && Array.isArray(f.geometry.coordinates) && (!f.properties || f.properties.suprimida === 0))
        .map((f) => {
          const p = f.properties || {};
          const rawName = String(p.denominacion || '').replace(/\s*\(\d+\)\s*$/, '').trim();
          const linesStr = String(p.lineas || '');
          const lines = linesStr
            .split(/[,;\s]+/)
            .map((l) => l.trim())
            .filter(Boolean);
          const code = String(p.id_parada || f.id || '');
          const lng = Number(f.geometry.coordinates[0].toFixed(6));
          const lat = Number(f.geometry.coordinates[1].toFixed(6));

          return {
            stopCode: code,
            stopName: rawName || `Parada ${code}`,
            coordinates: [lng, lat],
            lines,
            qrUrl: p.proximas_llegadas || `http://www.emtvalencia.es/QR.php?sec=est&p=${code}`,
          };
        })
        .filter((s) => Number.isFinite(s.coordinates[0]) && Number.isFinite(s.coordinates[1]));

      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(stops, null, 2), 'utf8');
      console.log(`Successfully wrote ${stops.length} real EMT bus stops to ${OUTPUT_FILE}`);
    } catch (err) {
      console.error('Error processing EMT GeoJSON:', err);
      process.exit(1);
    }
  });
}).on('error', (err) => {
  console.error('Network error fetching EMT stops:', err);
  process.exit(1);
});
