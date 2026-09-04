const fs = require('fs');
const path = require('path');
const csvToRows = (text) => text.trim().split('\n').map(l => l.split(','));

function resolveGtfsDir() {
  const customArg = process.argv[2];
  if (customArg && fs.existsSync(path.join(customArg, 'stops.txt'))) return customArg;

  const projectRoot = path.resolve(__dirname, '..');

  // Feed directories are named by their export date. Always take the newest:
  // a GTFS feed carries a service calendar that expires, and building from a
  // lapsed one yields a timetable with no trips running today.
  const dated = fs.readdirSync(projectRoot)
    .filter(name => /^\d{8}_\d{6}_/.test(name))
    .filter(name => fs.existsSync(path.join(projectRoot, name, 'stops.txt')))
    .sort()
    .reverse();
  if (dated.length) return path.join(projectRoot, dated[0]);

  // Search subdirectories inside project root
  const findInDir = (dir, depth = 0) => {
    if (depth > 3) return null;
    try {
      const items = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of items) {
        if (item.isDirectory() && !item.name.startsWith('.') && item.name !== 'node_modules') {
          const sub = path.join(dir, item.name);
          if (fs.existsSync(path.join(sub, 'stops.txt'))) return sub;
          const deeper = findInDir(sub, depth + 1);
          if (deeper) return deeper;
        }
      }
    } catch { /* ignore */ }
    return null;
  };

  const subFound = findInDir(projectRoot);
  if (subFound) return subFound;

  return path.resolve(process.env.HOME, 'Downloads', '20260728_100006_Metro_Valencia');
}

const gtfsDir = resolveGtfsDir();
const outPath = path.resolve(__dirname, '..', 'src', 'data', 'gtfs_expanded.json');

function readCSV(name) {
  const p = path.join(gtfsDir, name);
  if (!fs.existsSync(p)) return null;
  const txt = fs.readFileSync(p, 'utf8');
  const lines = txt.split('\n').map(l => l.trim()).filter(Boolean);
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    // naive CSV split that works for these simple GTFS files
    const parts = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = parts[i]; });
    return obj;
  });
}

const stops = readCSV('stops.txt') || [];
const routes = readCSV('routes.txt') || [];
const trips = readCSV('trips.txt') || [];
const stop_times = readCSV('stop_times.txt') || [];
const shapes = readCSV('shapes.txt') || [];

// map routes
const routeById = Object.fromEntries(routes.map(r => [r.route_id, {
  id: r.route_id,
  short: r.route_short_name,
  long: r.route_long_name,
  color: r.route_color ? (r.route_color.startsWith('#') ? r.route_color : ('#' + r.route_color)) : undefined,
}]));

// pick representative shape for each route (first trip)
const tripByRoute = {};
for (const t of trips) {
  if (!tripByRoute[t.route_id]) tripByRoute[t.route_id] = t;
}

const shapesById = {};
for (const s of shapes) {
  const id = s.shape_id;
  shapesById[id] = shapesById[id] || [];
  shapesById[id].push({ lat: Number(s.shape_pt_lat), lon: Number(s.shape_pt_lon), seq: Number(s.shape_pt_sequence) });
}
for (const k of Object.keys(shapesById)) shapesById[k].sort((a,b)=>a.seq-b.seq);

// map stop_id to stop object
const stopMap = Object.fromEntries(stops.map(s=>[s.stop_id,{id:s.stop_id,name:s.stop_name,lat:Number(s.stop_lat),lon:Number(s.stop_lon),zone:s.zone_id}]));

// map trip_id -> route_short
const routeShortByTrip = {};
for (const t of trips) { routeShortByTrip[t.trip_id] = routeById[t.route_id] ? routeById[t.route_id].short : null; }

// gather stop -> routes set via stop_times
const stopRoutes = {};
for (const st of stop_times) {
  const trip = st.trip_id;
  const stopId = st.stop_id;
  const rshort = routeShortByTrip[trip];
  if (!rshort) continue;
  stopRoutes[stopId] = stopRoutes[stopId] || new Set();
  stopRoutes[stopId].add(rshort);
}

// build features
const features = [];
// add line features per route (unique short names)
const addedLines = new Set();
for (const route of routes) {
  const short = route.route_short_name;
  if (addedLines.has(short)) continue;
  addedLines.add(short);
  // find a trip for this route to get shape
  const trip = trips.find(t => t.route_id === route.route_id && t.shape_id);
  const shapeId = trip ? trip.shape_id : null;
  let coords = shapeId && shapesById[shapeId] ? shapesById[shapeId].map(p=>[p.lon,p.lat]) : [];
  // If no explicit shape is available, try to construct geometry from stop_times order.
  if ((!coords || coords.length === 0)) {
    // find any trip for this route
    const anyTrip = trips.find(t => t.route_id === route.route_id);
    if (anyTrip) {
      const tripStopTimes = stop_times.filter(st => st.trip_id === anyTrip.trip_id).sort((a,b)=>Number(a.stop_sequence)-Number(b.stop_sequence));
      const stopCoords = [];
      for (const st of tripStopTimes) {
        const s = stopMap[st.stop_id];
        if (s) stopCoords.push([s.lon, s.lat]);
      }
      if (stopCoords.length > 1) coords = stopCoords;
    }
  }
  features.push({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords },
    properties: {
      line: short,
      name: route.route_long_name,
      color: route.route_color ? (route.route_color.startsWith('#') ? route.route_color : ('#' + route.route_color)) : undefined,
      route_id: route.route_id,
    }
  });
}

// The snapshot lags the running network in places, so corrections live in an
// overlay that is re-applied every time this file regenerates.
const overlayPath = path.resolve(__dirname, '..', 'src', 'data', 'network_overlay.json');
const overlay = fs.existsSync(overlayPath)
  ? JSON.parse(fs.readFileSync(overlayPath, 'utf8'))
  : { addStations: [], addLinesToStations: {} };

// add station points
for (const s of stops) {
  const lines = stopRoutes[s.stop_id] ? Array.from(stopRoutes[s.stop_id]) : [];
  const extra = (overlay.addLinesToStations || {})[s.stop_id];
  for (const line of (extra ? extra.lines : [])) {
    if (!lines.includes(line)) lines.push(line);
  }
  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(s.stop_lon), Number(s.stop_lat)] },
    properties: {
      type: 'station',
      id: `st-${s.stop_id}`,
      name: s.stop_name,
      stop_id: s.stop_id,
      lines: lines,
      zone: s.zone_id,
    }
  });
}

// add stations the snapshot omits entirely
for (const s of (overlay.addStations || [])) {
  features.push({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [Number(s.lon), Number(s.lat)] },
    properties: {
      type: 'station',
      id: `st-${s.stop_id}`,
      name: s.name,
      stop_id: s.stop_id,
      lines: s.lines,
      zone: s.zone,
      fromOverlay: true,
    }
  });
}

const out = { type: 'FeatureCollection', features };
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', outPath);
