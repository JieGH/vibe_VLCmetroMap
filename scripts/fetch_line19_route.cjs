// Fetches the EMT line 19 route shape and stop order from the municipal ArcGIS
// Seguimiento_EMT service and writes them to src/data/line19_route.json.
//
// Layers (all line 19 only; a `linea` filter returns HTTP 400, so where=1=1):
//   73 = Paradas (51 stops), 74 = Ruta (75 directed LineString segments).
// A browser User-Agent is mandatory (ADR-0011). See ADR-0014 and issue #149.
//
// Layer 74 `id_tramo` is `<from><to>`; a node is `P` + stopCode*100 + 2 digits
// (a stop) or `L` + id (a waypoint). The 75 segments chain into ONE closed
// directed loop. The loop is cut at the two termini into one polyline per
// direction, matching the `trayecto` strings of the Bus GPS Stream (layer 384):
//   - Est.del Nord terminus  = stop 2314 (Periodista Azzati - Plaça de
//     l'Ajuntament; buses layover there with the Est.del Nord trayecto)
//   - La Malva-rosa terminus = stop 18   (La Malva-rosa - Cavite; buses layover
//     there and flip trayecto, see the line 19 recording fixture)
//
// Usage: node scripts/fetch_line19_route.cjs

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = 'https://geoportal.valencia.es/server/rest/services/EMT/Seguimiento_EMT/MapServer';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const STOPS_FILE = path.resolve(__dirname, '../src/data/emt_stops.json');
const OUTPUT_FILE = path.resolve(__dirname, '../src/data/line19_route.json');

const NORD_STOP = 2314;
const MALVAROSA_STOP = 18;
const NORD_TRAYECTO = 'Est.del Nord - La Malva-rosa';
const MALVAROSA_TRAYECTO = 'La Malva-rosa - Est.del Nord';
const MAX_JOINT_GAP_M = 10;

function get(layer) {
  const url = `${BASE}/${layer}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`layer ${layer}: HTTP ${res.statusCode}`));
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw).features); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function metres(a, b) {
  const R = 6371008.8;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const round6 = (p) => [Number(p[0].toFixed(6)), Number(p[1].toFixed(6))];
const stopCodeOf = (node) => (node[0] === 'P' ? Math.floor(Number(node.slice(1)) / 100) : null);

function chainLoop(segments) {
  const parsed = segments.map((f) => {
    const [from, to] = f.properties.id_tramo.match(/[PL]\d+/g);
    return { from, to, coords: f.geometry.coordinates };
  });
  const byFrom = new Map();
  for (const s of parsed) {
    if (byFrom.has(s.from)) throw new Error(`node ${s.from} has two outgoing segments`);
    byFrom.set(s.from, s);
  }
  const chain = [];
  let cur = parsed[0];
  do {
    chain.push(cur);
    cur = byFrom.get(cur.to);
    if (!cur) throw new Error('chain broken: dangling segment');
  } while (cur !== parsed[0] && chain.length <= parsed.length);
  if (chain.length !== parsed.length) throw new Error(`loop covers ${chain.length} of ${parsed.length} segments`);
  chain.forEach((s, i) => {
    const next = chain[(i + 1) % chain.length];
    const gap = metres(s.coords[s.coords.length - 1], next.coords[0]);
    if (gap > MAX_JOINT_GAP_M) throw new Error(`joint gap ${gap.toFixed(1)} m after ${s.from}${s.to}`);
  });
  return chain;
}

function buildDirection(segs, trayecto, id, catalogue) {
  const polyline = [];
  const nodes = []; // { node, alongM } at the start of each segment, plus the end
  let along = 0;
  const push = (p) => {
    const q = round6(p);
    const last = polyline[polyline.length - 1];
    if (last) along += metres(last, q);
    polyline.push(q);
  };
  for (const s of segs) {
    s.coords.forEach((p, i) => {
      if (i === 0 && polyline.length) {
        // joint: keep the previous end point, never add a duplicate vertex
        nodes.push({ node: s.from, alongM: along });
        return;
      }
      if (i === 0) nodes.push({ node: s.from, alongM: 0 });
      push(p);
    });
  }
  const end = segs[segs.length - 1];
  nodes.push({ node: end.to, alongM: along });

  const stops = [];
  const seen = new Set();
  for (const n of nodes) {
    const code = stopCodeOf(n.node);
    if (code === null) continue;
    const cat = catalogue.get(String(code));
    if (!cat) continue; // not a layer 73 stop (e.g. 24, no catalogue entry): skipped
    if (seen.has(code)) throw new Error(`stop ${code} twice in ${id}`);
    seen.add(code);
    stops.push({ stopCode: String(code), stopName: cat.stopName, coordinates: cat.coordinates, alongM: Math.round(n.alongM) });
  }
  return { id, trayecto, lengthM: Math.round(along), polyline, stops };
}

async function main() {
  const [stopFeatures, routeFeatures] = await Promise.all([get(73), get(74)]);
  if (routeFeatures.length !== 75) throw new Error(`expected 75 route segments, got ${routeFeatures.length}`);
  const emt = JSON.parse(fs.readFileSync(STOPS_FILE, 'utf8'));
  const emtByCode = new Map(emt.map((s) => [s.stopCode, s]));

  const catalogue = new Map();
  for (const f of stopFeatures) {
    const code = String(f.properties.id_parada);
    const e = emtByCode.get(code);
    if (!e) throw new Error(`layer 73 stop ${code} missing from emt_stops.json`);
    if (!e.lines.includes('19')) throw new Error(`stop ${code} lacks line 19 in emt_stops.json`);
    const d = metres(f.geometry.coordinates, e.coordinates);
    if (d > 30) throw new Error(`stop ${code} differs ${d.toFixed(0)} m between layer 73 and emt_stops.json`);
    catalogue.set(code, { stopName: e.stopName, coordinates: e.coordinates });
  }

  const chain = chainLoop(routeFeatures);
  const at = (stop) => {
    const i = chain.findIndex((s) => stopCodeOf(s.from) === stop);
    if (i < 0) throw new Error(`terminus stop ${stop} not on the loop`);
    return i;
  };
  const nord = at(NORD_STOP);
  const malva = at(MALVAROSA_STOP);
  const rotated = chain.slice(nord).concat(chain.slice(0, nord));
  const cut = (malva - nord + chain.length) % chain.length;

  const directions = [
    buildDirection(rotated.slice(0, cut), NORD_TRAYECTO, 'to-malvarosa', catalogue),
    buildDirection(rotated.slice(cut), MALVAROSA_TRAYECTO, 'to-nord', catalogue),
  ];

  const out = {
    line: '19',
    source: 'Ajuntament de Valencia, ArcGIS Seguimiento_EMT MapServer layers 73 (Paradas) and 74 (Ruta)',
    fetched: new Date().toISOString().slice(0, 10),
    note: 'Generated by scripts/fetch_line19_route.cjs. Polyline is [lon, lat]; alongM is metres from the start of the direction polyline. Stop 24 is a route node with no layer 73 entry and is omitted.',
    segments: chain.length,
    directions,
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(out), 'utf8');
  for (const d of directions) console.log(`${d.id}: ${d.polyline.length} points, ${d.lengthM} m, ${d.stops.length} stops`);
  console.log(`Wrote ${OUTPUT_FILE}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
