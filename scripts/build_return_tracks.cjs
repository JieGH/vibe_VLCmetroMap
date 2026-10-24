// Builds the return track of the coastal one-way loop (Lines 4 and 6) from
// OpenStreetMap, into src/data/return_tracks.json.
//
// metro_lines.json holds one polyline per Line, and for L4/L6 it is the track
// trains take TOWARDS the coast: trunk, the beach leg past Platja Malva-rosa
// and Platja les Arenes, then the L4 balloon (or L6 on to Marítim). Trains
// come BACK on a different track: Marítim/Canyamelar -> Dr. Lluch -> Cabanyal
// -> the trunk junction beside La Cadena. The route relations in OSM say so:
// "Línia 4: Mas del Rosari => Dr. Lluch" runs along the beach leg, and every
// "Dr. Lluch => ..." and "Línia 6: Marítim => Tossal del Rei" runs along the
// inner leg. No way carries a oneway tag, so the direction comes from those
// relations, not from the ways themselves (ADR-0007).
//
// Each return polyline is oriented like its forward one — trunk first, the
// coast last — so "going back" is still "decreasing track distance" and the
// engine needs no second convention. The trunk part is the forward polyline's
// own vertices, so every trunk Station keeps the track distance it has today.
//
// Reads data/valencia_rails.json (an Overpass dump of the tram ways; refresh
// it with scripts/fetch_osm_data.cjs). Usage: node scripts/build_return_tracks.cjs

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rails = JSON.parse(fs.readFileSync(path.join(root, 'data', 'valencia_rails.json'), 'utf8'));
const metro = JSON.parse(fs.readFileSync(path.join(root, 'src', 'data', 'metro_lines.json'), 'utf8'));
const outPath = path.join(root, 'src', 'data', 'return_tracks.json');

// OSM node ids, read off the route relations rather than guessed:
// - JUNCTION: where the inner (westbound) leg leaves the trunk, beside La Cadena.
// - DR_LLUCH_END: the south end of the inner leg, where the L4 balloon rejoins
//   it. The forward L4 polyline ends here too.
// - GRAU_END: the south end of the westbound track past Canyamelar; L6 splices
//   back onto its forward polyline from here to Marítim.
const JUNCTION = 3312513642;
const DR_LLUCH_END = 134325633;
const GRAU_END = 3302702519;

const R = 6371000;
const rad = Math.PI / 180;
const haversine = (a, b) => {
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const nodes = new Map(rails.elements.filter(e => e.type === 'node').map(e => [e.id, [e.lon, e.lat]]));
const ways = rails.elements.filter(e => e.type === 'way' && e.tags && e.tags.railway === 'tram' && e.tags.service !== 'yard');

// Undirected: OSM tags no direction on these ways. The path is chosen by which
// ends it joins, and the shortest one between the junction and Dr. Lluch is the
// inner leg (about 650 m, against 1.4 km round the beach and balloon).
const graph = new Map();
const link = (a, b, w) => {
  if (!graph.has(a)) graph.set(a, []);
  graph.get(a).push({ to: b, w, way: w.id });
};
for (const way of ways) {
  for (let i = 0; i + 1 < way.nodes.length; i++) {
    const a = way.nodes[i];
    const b = way.nodes[i + 1];
    if (!nodes.has(a) || !nodes.has(b)) continue;
    const metres = haversine(nodes.get(a), nodes.get(b));
    link(a, b, { id: way.id, metres });
    link(b, a, { id: way.id, metres });
  }
}

const shortestPath = (from, to, avoid = new Set()) => {
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const todo = new Set([from]);
  while (todo.size) {
    let u = null;
    for (const n of todo) if (u === null || dist.get(n) < dist.get(u)) u = n;
    todo.delete(u);
    if (u === to) break;
    for (const e of graph.get(u) || []) {
      if (avoid.has(e.way)) continue;
      const d = dist.get(u) + e.w.metres;
      if (d < (dist.has(e.to) ? dist.get(e.to) : Infinity)) {
        dist.set(e.to, d);
        prev.set(e.to, { node: u, way: e.way });
        todo.add(e.to);
      }
    }
  }
  if (!prev.has(to)) throw new Error(`No OSM path ${from} -> ${to}`);
  const path_ = [to];
  const wayIds = [];
  for (let n = to; n !== from;) {
    const p = prev.get(n);
    wayIds.unshift(p.way);
    n = p.node;
    path_.unshift(n);
  }
  return { coords: path_.map(n => nodes.get(n)), wayIds: [...new Set(wayIds)], metres: dist.get(to) };
};

const projectOnto = (point, coords) => {
  let best = { perp: Infinity, index: 0, t: 0, point: coords[0] };
  for (let i = 0; i + 1 < coords.length; i++) {
    const [x1, y1] = coords[i];
    const [x2, y2] = coords[i + 1];
    const lenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    let t = lenSq === 0 ? 0 : ((point[0] - x1) * (x2 - x1) + (point[1] - y1) * (y2 - y1)) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const proj = [x1 + t * (x2 - x1), y1 + t * (y2 - y1)];
    const perp = haversine(point, proj);
    if (perp < best.perp) best = { perp, index: i, t, point: proj };
  }
  return best;
};

const bearing = (a, b) => {
  const dx = (b[0] - a[0]) * Math.cos(a[1] * rad);
  const dy = b[1] - a[1];
  return (Math.atan2(dx, dy) / rad + 360) % 360;
};

const forwardOf = (lineId) => metro.features.find(
  f => f.properties && f.properties.line === lineId && f.geometry.type === 'LineString'
).geometry.coordinates;

const out = { _comment: 'Generated by scripts/build_return_tracks.cjs from data/valencia_rails.json. Do not edit.', lines: {} };

const westLeg = shortestPath(JUNCTION, DR_LLUCH_END);
// The outbound track runs 5-10 m beside the westbound one and joins it through
// a crossover, so the shortest path would hop onto it. The L4 and L6 eastbound
// relations use these two ways; the westbound relation uses neither.
const OUTBOUND_SOUTH_WAYS = new Set([71519112, 71519118]);
const towardsGrau = shortestPath(DR_LLUCH_END, GRAU_END, OUTBOUND_SOUTH_WAYS);
console.log(`inner leg: ${Math.round(westLeg.metres)} m via ways ${westLeg.wayIds.join(', ')}`);
console.log(`Dr. Lluch -> Canyamelar -> Grau: ${Math.round(towardsGrau.metres)} m via ways ${towardsGrau.wayIds.join(', ')}`);

for (const lineId of ['4', '6']) {
  const forward = forwardOf(lineId);
  const split = projectOnto(nodes.get(JUNCTION), forward);
  if (split.perp > 15) throw new Error(`L${lineId}: junction is ${Math.round(split.perp)} m from the forward polyline`);

  // The trunk is shared: forward vertices up to the junction, then the junction.
  let coords = [...forward.slice(0, split.index + 1), nodes.get(JUNCTION)];
  coords = coords.concat(westLeg.coords.slice(1));
  let ways_ = westLeg.wayIds;

  if (lineId === '6') {
    // L6 does not end at Dr. Lluch: back along the westbound track through
    // Canyamelar to Grau, then onto its forward polyline to Marítim.
    coords = coords.concat(towardsGrau.coords.slice(1));
    ways_ = [...ways_, ...towardsGrau.wayIds];
    const join = projectOnto(towardsGrau.coords.at(-1), forward);
    if (join.perp > 25) throw new Error(`L6: Grau end is ${Math.round(join.perp)} m from the forward polyline`);
    coords = coords.concat(forward.slice(join.index + 1));
  }

  out.lines[lineId] = {
    osmWays: ways_,
    coordinates: coords.map(c => [Number(c[0].toFixed(7)), Number(c[1].toFixed(7))]),
  };
  console.log(`L${lineId}: ${forward.length} forward vertices, ${coords.length} return vertices, trunk kept to index ${split.index}`);
}

// Verify the forward polyline's coast section against OSM: it should follow the
// beach leg (relation "Mas del Rosari => Dr. Lluch") and no vertex should be
// further than a few metres from some OSM tram way.
const allWayCoords = ways.map(w => w.nodes.map(n => nodes.get(n)).filter(Boolean));
for (const lineId of ['4', '6']) {
  const forward = forwardOf(lineId);
  let worst = 0;
  for (const v of forward.filter(c => c[0] > -0.3285 && c[1] > 39.4635 && c[1] < 39.4755)) {
    worst = Math.max(worst, Math.min(...allWayCoords.map(w => projectOnto(v, w).perp)));
  }
  console.log(`L${lineId} forward coast vertices: furthest ${worst.toFixed(1)} m from any OSM tram way`);
}

// Bearings of the two legs, as the engine reports them: travelling along the
// beach leg southward, and back along the inner leg northward.
const beach = forwardOf('4');
const leg = (coords, from, to) => {
  const a = projectOnto(from, coords).point;
  const b = projectOnto(to, coords).point;
  return bearing(a, b).toFixed(1);
};
const MALVA_ROSA = [-0.3257277906, 39.473690033];
const ARENES = [-0.3257277906, 39.4689292908];
const DR_LLUCH = [-0.3281527758, 39.4693069458];
const CABANYAL = [-0.3275833428, 39.4728546143];
console.log(`beach leg Malva-rosa -> Arenes (forward): ${leg(beach, MALVA_ROSA, ARENES)} deg`);
console.log(`inner leg Dr. Lluch -> Cabanyal (return, travelled towards decreasing distance): ${leg(out.lines['4'].coordinates, DR_LLUCH, CABANYAL)} deg`);

fs.writeFileSync(outPath, JSON.stringify(out) + '\n');
console.log('Wrote', path.relative(root, outPath));
