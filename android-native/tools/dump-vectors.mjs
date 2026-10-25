#!/usr/bin/env node
// Runs the REAL web-app JS (trainPositionEngine, stationFocus, fuzzySearch, countdownHeat, geoUtils,
// userLocation.findNearestStation) over fixed inputs and writes golden JSON for the Kotlin port's
// JUnit tests to app/src/test/resources/vectors/.   Usage: node tools/dump-vectors.mjs
// Needs the repo's node_modules (vite). Re-run after any change to those JS modules or src/data.
import { createServer } from 'vite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = join(HERE, '..', 'app', 'src', 'test', 'resources', 'vectors');
mkdirSync(OUT, { recursive: true });

const vite = await createServer({
  configFile: false, root: REPO, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
});
const load = (p) => vite.ssrLoadModule(p);

const { default: engine } = await load('/src/services/trainPositionEngine.js');
const { default: arrivalStore } = await load('/src/services/arrivalStore.js');
const { getStationFocus } = await load('/src/services/stationFocus.js');
const fuzzy = await load('/src/utils/fuzzySearch.js');
const heat = await load('/src/utils/countdownHeat.js');
const geo = await load('/src/utils/geoUtils.js');
const { default: gtfs } = await load('/src/data/gtfs_expanded.json');
const { default: metro } = await load('/src/data/metro_lines.json');
const { default: returnTracks } = await load('/src/data/return_tracks.json');
let findNearestStation = null;
try { ({ findNearestStation } = await load('/src/services/userLocation.js')); } catch (e) { console.warn('userLocation not loadable:', e.message); }

const write = (name, value) => {
  writeFileSync(join(OUT, name), JSON.stringify(value, (_k, v) => (v === Infinity ? 'Infinity' : v === undefined ? null : v)));
  console.log('wrote', name);
};

const T0 = Date.UTC(2026, 9, 20, 17, 30, 0);

// ---------- engine scenarios ----------
// A "memory" is a list of Station entries: { key, stationName, fetchedAt, arrivals: [{line,destination,vehicleId,targetTimestamp,isLive}] }
const entryFor = (map, stationName, fetchedAt) => {
  if (!map.has(stationName)) map.set(stationName, { key: stationName, stationName, fetchedAt, arrivals: [] });
  return map.get(stationName);
};
const sight = (map, stationName, line, destination, vehicleId, targetTimestamp, fetchedAt) =>
  entryFor(map, stationName, fetchedAt).arrivals.push({ line, destination, vehicleId, targetTimestamp, isLive: true });

const chain = (line, fwd) => engine.getLineStations(line, fwd);

// One vehicle travelling along a Line's chain towards `fwd`, sighted at three stations ahead.
function addVehicle(map, line, fwd, vid, now, { from = 0.4, picks = [1, 2, 4], extra = 0, fetchedAt = now, dest } = {}) {
  const st = chain(line, fwd);
  const i0 = Math.floor(st.length * from);
  const step = fwd ? 1 : -1;
  let secs = 45 + extra;
  let prev = null;
  const out = [];
  for (const k of picks) {
    const idx = i0 + step * k;
    if (idx < 0 || idx >= st.length) continue;
    if (prev !== null) {
      for (let i = prev; i !== idx; i += step) secs += engine.getSegmentSeconds(line, st[i], st[i + step]);
    }
    prev = idx;
    out.push([st[idx].name, secs]);
  }
  const destination = dest ?? (fwd ? st[st.length - 1].name : st[0].name);
  for (const [name, s] of out) sight(map, name, String(line), destination, vid, now + s * 1000, fetchedAt);
}

const memList = (map) => [...map.values()];
const step = (now, map) => ({ now, memory: memList(map) });

const scenarios = [];
const add = (name, steps) => scenarios.push({ name, steps });

for (let l = 1; l <= 10; l++) {
  const line = String(l);
  const map = new Map();
  addVehicle(map, line, true, `${l}01`, T0);
  addVehicle(map, line, false, `${l}02`, T0, { from: 0.6, picks: [1, 3] });
  addVehicle(map, line, true, `${l}03`, T0, { from: 0.15, picks: [2], extra: 200 });
  add(`line-${l}-basic`, [step(T0, map), step(T0 + 1000, map), step(T0 + 30_000, map)]);
}

{ // Line 4 and 6: return track vehicles, beach stations, Cabanyal (return only), Platja (outbound only)
  for (const line of ['4', '6']) {
    const map = new Map();
    const names = (fwd) => chain(line, fwd).map(s => s.name);
    const out = names(true), back = names(false);
    const beach = out[out.length - 1];
    sight(map, beach, line, beach, `${line}-beach`, T0 + 60_000, T0);
    sight(map, out[out.length - 2], line, beach, `${line}-beach`, T0 + 20_000, T0);
    const cab = back.find(n => n === 'Cabanyal');
    sight(map, 'Cabanyal', line, out[0], `${line}-ret`, T0 + 40_000, T0);
    sight(map, 'Dr. Lluch', line, out[0], `${line}-ret`, T0 + 150_000, T0);
    sight(map, 'Dr. Lluch', line, beach, `${line}-out`, T0 + 25_000, T0);
    // headsign-only sighting (no vehicle id)
    sight(map, back[Math.floor(back.length / 2)], line, out[0], undefined, T0 + 300_000, T0);
    addVehicle(map, line, false, `${line}-back`, T0, { from: 0.8, picks: [1, 2, 3] });
    addVehicle(map, line, true, `${line}-fwd`, T0, { from: 0.1, picks: [1, 2, 3] });
    add(`line-${line}-return-and-beach`, [step(T0, map), step(T0 + 2000, map)]);
  }
}

{ // Contradicting Sighting on L4: La Cadena stated before Beteró
  const map = new Map();
  sight(map, 'Beteró', '4', 'Dr. Lluch', 'c1', T0 + 400_000, T0);
  sight(map, 'La Cadena', '4', 'Dr. Lluch', 'c1', T0 + 330_000, T0);
  sight(map, 'Trinitat', '4', 'Dr. Lluch', 'c1', T0 + 520_000, T0);
  sight(map, 'Empalme', '4', 'Dr. Lluch', 'c1', T0 + 700_000, T0);
  add('line-4-contradicting-sighting', [step(T0, map)]);
}

{ // Dead reckoning, dwell, stale predictions on L3 / L5 / L8
  const map = new Map();
  const st = chain('3', true);
  const mid = Math.floor(st.length / 2);
  sight(map, st[mid].name, '3', st[st.length - 1].name, 'dr1', T0 - 15_000, T0 - 30_000);   // dead reckoned
  sight(map, st[mid + 1].name, '3', st[st.length - 1].name, 'dw1', T0 - 5_000, T0);          // inside the dwell
  sight(map, st[mid + 2].name, '3', st[st.length - 1].name, 'dw2', T0, T0);                  // due exactly now
  sight(map, st[mid + 3].name, '3', st[0].name, 'dr2', T0 - 19_000, T0 - 40_000);            // edge of MAX_SECONDS_PAST
  sight(map, st[mid + 4].name, '3', st[0].name, 'dr3', T0 - 21_000, T0 - 40_000);            // past the cut-off: dropped
  const stale = new Map();
  addVehicle(stale, '5', true, 'stale5', T0, { fetchedAt: T0 - 400_000 });
  addVehicle(stale, '8', false, 'stale8', T0, { fetchedAt: T0 - 150_000 });
  addVehicle(stale, '1', true, 'far1', T0, { extra: 900 });
  for (const e of stale.values()) map.set(`${e.key}#stale`, { ...e, key: `${e.key}#stale` });
  add('dead-reckoning-and-stale', [step(T0, map), step(T0 + 5000, map), step(T0 + 25_000, map)]);
}

{ // Marker smoothing: re-timed predictions ease the drawn marker; a big jump resyncs
  const build = (extra) => { const m = new Map(); addVehicle(m, '1', true, 'sm1', T0, { extra, picks: [1, 2, 3] }); addVehicle(m, '3', false, 'sm3', T0, { extra: -20 + extra, picks: [1, 2] }); return m; };
  add('smoothing', [
    step(T0, build(0)),
    step(T0 + 1000, build(-30 + 0)),   // estimate runs ahead: marker catches up slowly
    step(T0 + 2000, build(40)),        // estimate falls behind: marker waits
    step(T0 + 4000, build(-40)),
    step(T0 + 9000, build(-40)),
    step(T0 + 12000, build(-400)),     // beyond the resync distance
  ]);
}

add('empty-network-all-simulated', [step(T0, new Map()), step(T0 + 17_000, new Map()), step(T0 + 600_000, new Map())]);

{
  const map = new Map();
  addVehicle(map, '1', true, 'only1', T0, {});
  add('one-live-vehicle-adds-opposite-simulated', [step(T0, map), step(T0 + 3000, map)]);
}

{ // L5 / L7 Machado (off-track) and a headsign naming an off-track Station
  const map = new Map();
  const st = chain('5', true);
  sight(map, 'Machado', '5', 'Aeroport', 'm5', T0 + 100_000, T0);
  sight(map, st[Math.floor(st.length / 2)].name, '5', 'Machado', 'm5', T0 + 200_000, T0);
  sight(map, st[Math.floor(st.length / 2) + 1].name, '5', 'Machado', 'm5', T0 + 260_000, T0);
  sight(map, 'Fira València', '4', 'Mas del Rosari', 'f4', T0 + 80_000, T0);
  add('off-track-and-unknown-stations', [step(T0, map)]);
}

const vehicleJson = (v) => ({
  id: v.id, line: v.line, vehicleId: v.vehicleId ?? null, direction: v.direction,
  lon: v.coordinates[0], lat: v.coordinates[1], bearing: v.bearing,
  distanceAlongTrack: v.distanceAlongTrack, isForward: v.isForward, isLive: !!v.isLive, isSimulated: !!v.isSimulated,
  status: v.status ?? null, sightingCount: v.sightingCount ?? null,
  positionUncertaintyMetres: v.positionUncertaintyMetres ?? null,
  positionConfidence: v.positionConfidence ?? null, isDeadReckoned: !!v.isDeadReckoned,
  runningSpeed: v.runningSpeed ?? null, secondsUnheard: v.secondsUnheard ?? null,
  targetStation: v.targetStation, secondsToTarget: v.secondsToTarget,
});

const engineOut = [];
for (const sc of scenarios) {
  engine.renderState.clear();
  const steps = [];
  for (const s of sc.steps) {
    arrivalStore.memory.clear();
    for (const e of s.memory) {
      arrivalStore.memory.set(e.key, { stationId: e.key, stationName: e.stationName, fetchedAt: e.fetchedAt, arrivals: e.arrivals });
    }
    const vehicles = engine.getAllVehicles(s.now).map(vehicleJson);
    steps.push({ now: s.now, memory: s.memory, vehicles });
  }
  engineOut.push({ name: sc.name, steps });
}
arrivalStore.memory.clear();
write('engine.json', engineOut);

// ---------- chain / timing / uncertainty spot checks ----------
const chainOut = {};
for (let l = 1; l <= 10; l++) {
  for (const fwd of [true, false]) {
    const key = `${l}:${fwd ? 'fwd' : 'back'}`;
    const st = engine.getLineStations(String(l), fwd);
    chainOut[key] = {
      stations: st.map(s => ({ id: s.id, name: s.name, trackDist: s.trackDist })),
      segmentSeconds: st.slice(0, -1).map((s, i) => engine.getSegmentSeconds(String(l), s, st[i + 1])),
    };
  }
}
write('chains.json', chainOut);
// (the uncertainty/confidence formulas are exported functions)
const eng = await load('/src/services/trainPositionEngine.js');
write('uncertainty.json', [
  [0, 0, 7], [1, 0, 7], [3.5, 100, 4.1], [9, 200, 11.01], [16, 300, 7.5], [25, 1000, 11], [0.3, 0, 4.1],
].map(([seg, unheard, mps]) => {
  const u = eng.estimatePositionUncertainty(seg, unheard, mps);
  return { segmentsWalked: seg, secondsUnheard: unheard, mps, uncertainty: u, confidence: eng.confidenceFromUncertainty(u) };
}));

// ---------- station focus ----------
const AG = { apiId: 17, name: 'Àngel Guimerà', lines: ['1', '2', '3', '5', '9'] };
const RAF = { apiId: 1, name: 'Rafelbunyol', lines: ['3'] };
const FIRA = { apiId: 68, name: 'Fira València', lines: ['4'] };
const AYORA = { name: 'Ayora', lines: ['5', '7'] };
const DRL = { apiId: 83, name: 'Dr. Lluch', lines: ['4', '6', '8', '10'] };
const CAB = { apiId: 80, name: 'Cabanyal', lines: ['4', '6', '8', '10'] };
const focusCases = [
  { name: 'ag-two-directions', station: AG, fetchedAtOffset: 0, arrivals: [['3', 'Rafelbunyol', 120], ['3', 'Aeroport', 300]] },
  { name: 'ag-mixed-lines', station: AG, fetchedAtOffset: 0, arrivals: [['3', 'Rafelbunyol', 200], ['1', 'Bétera', 260], ['3', 'Aeroport', 90], ['5', 'Marítim', 150], ['9', 'Alboraia', 340]] },
  { name: 'rafelbunyol-terminus', station: RAF, fetchedAtOffset: 0, arrivals: [['3', 'Aeroport', 90], ['3', 'Aeroport', 480]] },
  { name: 'ag-stale', station: AG, fetchedAtOffset: -180_000, arrivals: [['3', 'Aeroport', 300], ['3', 'Rafelbunyol', 400]] },
  { name: 'fira-off-track', station: FIRA, fetchedAtOffset: 0, arrivals: [['4', 'Mas del Rosari', 180]] },
  { name: 'drlluch-return-track', station: DRL, fetchedAtOffset: 0, arrivals: [['4', 'Dr. Lluch', 100], ['4', 'Mas del Rosari', 200], ['6', 'Platja les Arenes', 90], ['6', 'Tomás y Valiente', 400]] },
  { name: 'cabanyal-return-only', station: CAB, fetchedAtOffset: 0, arrivals: [['4', 'Dr. Lluch', 60], ['6', 'Mas del Rosari', 170]] },
  { name: 'ayora-by-name', station: AYORA, fetchedAtOffset: 0, arrivals: [['5', 'Aeroport', 100], ['7', 'Marítim', 220]] },
  { name: 'ag-nothing', station: AG, fetchedAtOffset: 0, arrivals: [] },
];
const focusOut = focusCases.map((c) => {
  arrivalStore.memory.clear();
  const key = String(arrivalStore.getStationKey(c.station));
  const entry = {
    stationId: c.station.apiId, stationName: c.station.name, fetchedAt: T0 + c.fetchedAtOffset,
    arrivals: c.arrivals.map(([line, destination, inSeconds], i) => ({
      line, destination, vehicleId: `v${i}`, lineColor: '#888', lineName: `Line ${line}`,
      targetTimestamp: T0 + inSeconds * 1000, isLive: true,
    })),
  };
  if (c.arrivals.length) arrivalStore.memory.set(key, entry);
  const f = getStationFocus(c.station, T0);
  const row = (a) => [a.line, a.destination, a.seconds, a.minutes, a.status];
  return {
    name: c.name, station: c.station, fetchedAtOffset: c.fetchedAtOffset, now: T0, key, entry,
    focus: {
      name: f.name, lines: f.lines, arrivals: f.arrivals.map(row), laterArrivals: f.laterArrivals.map(row),
      directions: f.directions.map(d => ({ key: d.key, destinations: d.destinations, destination: d.destination, label: d.label, bearing: d.bearing, arrivals: d.arrivals.map(row) })),
      isFresh: f.isFresh, fetchedAt: f.fetchedAt, secondsUnheard: f.secondsUnheard, fetchError: f.fetchError,
    },
  };
});
arrivalStore.memory.clear();
write('focus.json', focusOut);

// ---------- fuzzy search ----------
const stations = gtfs.features.filter(f => f.geometry.type === 'Point');
const lines = metro.features.filter(f => f.geometry.type === 'LineString');
const queries = ['guimera', 'angel', 'pl espanya', 'placa', 'av', 'dr lluch', 'doctor', 'eliana', 'leliana', 'pobla farnals', 'mal', 'xyz', '  ', 'l1', 'linia 3', 'line 4', 'Bétera', 'betera', 'aeroport', 'jesus', 'marit', 'cabanyal', 'platja', 'fira', 'mas', 'ben', 'ayo', 'rafel', 'torrent', 'aer', 'gran', 'a', 'ca'];
write('search.json', queries.map(q => ({
  query: q,
  lines: fuzzy.searchFuzzy(lines, q, l => `${l.properties.name} Line ${l.properties.line} Linia ${l.properties.line}`).map(l => l.properties.line),
  stations: fuzzy.searchFuzzy(stations, q, st => st.properties.name).map(st => st.properties.id),
})));
const scorePairs = [['L\'Eliana', 'leliana'], ['Àngel Guimerà', 'guimera'], ['Pl. Espanya', 'placa'], ['Pl. Espanya', 'pl'], ['La Pobla de Farnals', 'pobla farnals'], ['València Sud', 'vsud'], ['Dr. Lluch', 'doc'], ['Av. Corts', 'avinguda'], ['Alboraia Peris Aragó', 'aragó'], ['Torrent', 'torrent'], ['Torrent Avinguda', 'torrent'], ['x', 'y'], ['', 'a'], ['abc', ''], ['Beteró', 'bet'], ['Mas del Rosari', 'masdelrosari'], ['Ll. Llarga - Terramelar', 'llarga terra']];
write('fuzzyscore.json', scorePairs.map(([t, q]) => ({ target: t, query: q, score: fuzzy.fuzzyScore(t, q) })));

// ---------- countdown heat ----------
const secs = []; for (let s = 0; s <= 700; s += 1) secs.push(s); secs.push(59.5, 119.5, 120.5, 299.9, 300.1, 599.5, 600.5, 1e6);
write('heat.json', secs.map(s => ({ seconds: s, dark: heat.countdownHeat(s, 'dark'), light: heat.countdownHeat(s, 'light'), label: heat.countdownLabel(s), unit: heat.countdownUnit(s) })));

// ---------- geo ----------
const probe = [[-0.3774, 39.4699], [-0.4106, 39.4408], [-0.3800, 39.4700], [-0.35, 39.55], [-0.47, 39.49], [-0.33, 39.47], [-0.2, 39.3], [-0.5, 39.6]];
write('geo.json', {
  distances: [[[-0.38, 39.46], [-0.38, 39.48]], [[-0.3774, 39.4699], [-0.4106, 39.4408]], [[0, 0], [0, 0]], [[-0.47, 39.49], [-0.33, 39.47]]]
    .map(([a, b]) => ({ a, b, d: geo.getDistance(a, b) })),
  haversineEngine: [[[-0.38, 39.46], [-0.38, 39.48]], [[-0.3774, 39.4699], [-0.4106, 39.4408]]]
    .map(([a, b]) => ({ a, b, d: eng.haversineDistance(a, b) })),
  nearestOnPath: probe.map(p => { const path = metro.features.find(f => f.properties.line === '3' && f.geometry.type === 'LineString').geometry.coordinates; const r = geo.nearestPointOnPath(path, p); return { point: p, line: '3', coordinates: r.coordinates, distance: r.distance }; }),
  interpolate: [0, 0.1, 0.5, 0.77, 1, 1.5, -1].map(t => { const path = metro.features.find(f => f.properties.line === '1' && f.geometry.type === 'LineString').geometry.coordinates; return { line: '1', t, p: geo.interpolatePath(path, t) }; }),
  pathsOff: ['4', '6'].map(l => {
    const out = metro.features.find(f => f.properties.line === l && f.geometry.type === 'LineString').geometry.coordinates;
    return { line: l, runs: geo.pathsOffReference(returnTracks.lines[l].coordinates, out, 12) };
  }),
  nearest: findNearestStation ? probe.map(p => { const r = findNearestStation(p); return { point: p, name: r.station.properties.name, id: r.station.properties.id, distance: r.distance }; }) : [],
});

await vite.close();
