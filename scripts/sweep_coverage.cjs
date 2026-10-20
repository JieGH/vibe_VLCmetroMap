// Measures how many live Vehicles a set of Stations can see, so the Major
// Stations and Strategic Hubs are chosen by coverage rather than by how many
// Lines they serve.
//
// FGV returns at most 8 trains per Station, shared across every Line and both
// directions, so a busy interchange hears only one or two trains per Line. A
// Station's worth is therefore the Vehicles only it can see. Coverage counts
// Vehicles due within 20 minutes: beyond that a terminus is listing scheduled
// departures, not trains on the network.
//
// Usage:
//   npm run sweep
//       Sweep every Station once, save it under data/sweeps/, and report.
//   npm run sweep -- report [--size N] [--hubs N] <sweep.json>...
//       Report coverage over one or more saved sweeps, and recommend the best
//       N Major Stations (default 18) and N Strategic Hubs (default 3).
//       Merge sweeps taken at different times so the choice does not fit one
//       moment. Add --write to save the recommendation to live_stations.json
//       instead of printing it, so no Station id is ever typed by hand.

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sweepDir = path.join(projectRoot, 'data', 'sweeps');
const stations = require('../src/data/paradas_api.json');
const liveStationsPath = path.join(projectRoot, 'src', 'data', 'live_stations.json');
const live = require(liveStationsPath);

const FGV_PREVISION_URL = 'https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3';
// Same attempt budget as the app (see arrivalStore.js): ~6% of requests hang.
const ATTEMPT_TIMEOUT_MS = 4000;
const ATTEMPTS = 2;
const CONCURRENCY = 3;
const PAUSE_MS = 250;
const HORIZON_S = 20 * 60;
const TRAM_LINES = new Set(['4', '6', '8', '10']);

const nameOf = new Map(stations.map(s => [Number(s.id), s.nombre]));

async function fetchStation(id) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${FGV_PREVISION_URL}/${id}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      });
      if (!res.ok) return { id, ok: false, status: res.status, trains: [] };
      const body = await res.json();
      const trains = (body.previsiones || []).flatMap(group =>
        (group.trains || []).map(t => [String(group.line ?? group.line_id), String(t.vehicle), t.seconds])
      );
      return { id, ok: true, trains };
    } catch (err) {
      if (attempt === ATTEMPTS) return { id, ok: false, error: String(err.name || err), trains: [] };
    }
  }
}

async function sweep() {
  const queue = stations.map(s => Number(s.id));
  const results = [];
  const worker = async () => {
    while (queue.length) {
      results.push(await fetchStation(queue.shift()));
      await new Promise(r => setTimeout(r, PAUSE_MS));
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  results.sort((a, b) => a.id - b.id);
  return { takenAt: new Date().toISOString(), stations: results };
}

// Each sweep contributes its own Vehicles, keyed by sweep so the same train
// seen in two sweeps counts twice — it was missed or caught twice.
function sightingsByStation(sweeps) {
  const byStation = new Map();
  sweeps.forEach((s, i) => {
    for (const st of s.stations) {
      const seen = byStation.get(st.id) || new Set();
      for (const [line, vehicle, seconds] of st.trains) {
        if (seconds <= HORIZON_S) seen.add(`${i}|${line}|${vehicle}`);
      }
      byStation.set(st.id, seen);
    }
  });
  return byStation;
}

const lineOf = key => key.split('|')[1];

function covered(byStation, ids) {
  const out = new Set();
  for (const id of ids) (byStation.get(id) || new Set()).forEach(k => out.add(k));
  return out;
}

function greedy(byStation, size) {
  const chosen = [];
  const got = new Set();
  while (chosen.length < size) {
    let best = null;
    let gain = 0;
    for (const [id, seen] of byStation) {
      if (chosen.includes(id)) continue;
      let g = 0;
      seen.forEach(k => { if (!got.has(k)) g++; });
      if (g > gain) { gain = g; best = id; }
    }
    if (best === null) break;
    chosen.push(best);
    byStation.get(best).forEach(k => got.add(k));
  }
  return chosen;
}

const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '—');

function printCoverage(label, ids, byStation, universe) {
  const got = covered(byStation, ids);
  const lines = [...new Set([...universe].map(lineOf))].sort((a, b) => a - b);
  const mode = { metro: [0, 0], tram: [0, 0] };
  const perLine = lines.map(l => {
    const all = [...universe].filter(k => lineOf(k) === l).length;
    const seen = [...got].filter(k => lineOf(k) === l).length;
    const m = TRAM_LINES.has(l) ? 'tram' : 'metro';
    mode[m][0] += seen;
    mode[m][1] += all;
    return `L${l} ${pct(seen, all)}`;
  });
  console.log(`\n${label} (${ids.length} Stations): ${got.size}/${universe.size} = ${pct(got.size, universe.size)}` +
    `  · metro ${pct(...mode.metro)} · tram ${pct(...mode.tram)}`);
  console.log(`  ${perLine.join('  ')}`);
}

function report(sweeps, { size, hubs, write }) {
  const failed = sweeps.reduce((n, s) => n + s.stations.filter(st => !st.ok).length, 0);
  const total = sweeps.reduce((n, s) => n + s.stations.length, 0);
  console.log(`${sweeps.length} sweep(s): ${sweeps.map(s => s.takenAt).join(', ')}`);
  console.log(`${total - failed}/${total} Station responses usable`);

  const byStation = sightingsByStation(sweeps);
  const universe = covered(byStation, [...byStation.keys()]);
  console.log(`${universe.size} Vehicle sightings due within ${HORIZON_S / 60} min`);

  printCoverage('Current Strategic Hubs', live.strategicHubs.map(s => s.id), byStation, universe);
  printCoverage('Current Major Stations', live.majorStations.map(s => s.id), byStation, universe);

  const hubPick = greedy(byStation, hubs);
  const majorPick = greedy(byStation, size);
  printCoverage('Recommended Strategic Hubs', hubPick, byStation, universe);
  printCoverage('Recommended Major Stations', majorPick, byStation, universe);

  const asJson = ids => `[\n${ids.map(id => `    ${JSON.stringify({ id, name: nameOf.get(id) })}`).join(',\n')}\n  ]`;
  const json = `{\n  "strategicHubs": ${asJson(hubPick)},\n  "majorStations": ${asJson(majorPick)}\n}\n`;
  if (write) {
    fs.writeFileSync(liveStationsPath, json);
    console.log(`\nwrote ${path.relative(projectRoot, liveStationsPath)}`);
  } else {
    console.log(`\n${json}`);
  }
}

function flag(args, name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const opts = { size: flag(args, '--size', 18), hubs: flag(args, '--hubs', 3), write: args.includes('--write') };

  if (args[0] === 'report') {
    const valued = new Set(['--size', '--hubs']);
    const files = args.slice(1).filter((a, i, all) => !a.startsWith('--') && !valued.has(all[i]) && !valued.has(all[i - 1]));
    if (!files.length) throw new Error('report needs at least one sweep file');
    report(files.map(f => JSON.parse(fs.readFileSync(f, 'utf8'))), opts);
    return;
  }

  const result = await sweep();
  fs.mkdirSync(sweepDir, { recursive: true });
  const file = path.join(sweepDir, `${result.takenAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, `${JSON.stringify(result)}\n`);
  console.log(`saved ${path.relative(projectRoot, file)}`);
  report([result], opts);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
