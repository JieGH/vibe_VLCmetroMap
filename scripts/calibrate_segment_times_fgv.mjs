// Measures Segment Intervals from FGV's own live predictions.
//
// segment_times.json comes from the GTFS Feed, which states every time to the
// minute, so its medians land on 60s or 120s: Amistat → Aragó is stored as
// 120s against about 85s timed on the platform. FGV's countdown has second
// resolution, and when one Vehicle is predicted at two adjacent Stations in
// the same sweep, the gap between the two implied arrival times is FGV's own
// interval for that Segment — dwell at the origin plus running time, the same
// quantity segment_times.json stores.
//
// Reads a capture from docs/research/marker-drift/capture_network.cjs and
// writes src/data/segment_times_fgv.json, which the engine prefers over the
// GTFS figure wherever it has one.
//
// Usage: npx vite-node scripts/calibrate_segment_times_fgv.mjs capture.jsonl

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import engine from '../src/services/trainPositionEngine.js';
import gtfsTimes from '../src/data/segment_times.json';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(projectRoot, 'src', 'data', 'segment_times_fgv.json');
const capturePath = process.argv[2];
if (!capturePath) throw new Error('Usage: vite-node scripts/calibrate_segment_times_fgv.mjs capture.jsonl');

// Two sightings this far apart in wall time belong to different sweeps; the
// implied arrival times still line up, but a re-time in between would not.
const MAX_SIGHTING_GAP_MS = 20000;
// Fewer pairs than this and one re-timed prediction can move the median.
const MIN_SAMPLES = 8;
// Outside this a pair is a turn-back, a hold, or two different trips.
const MIN_INTERVAL_SECONDS = 20;
const MAX_INTERVAL_SECONDS = 400;
// The Station Dwell carved out of each measured interval. FGV states arrivals
// only, so the split is not in the capture: 42.4s was timed at Aragó on Line 5
// (2026-10-24), and FGV's 91s for Amistat → Aragó less the 42.8s run timed on
// the same ride leaves 48s at Amistat. The GTFS figure, 12.5s, sent trains out
// of the platform half a minute early and then crawled them to the next one.
const DWELL_SECONDS = 40;

const rows = fs.readFileSync(capturePath, 'utf8').trim().split('\n')
  .map(line => JSON.parse(line))
  .filter(r => !r.err && Number.isFinite(r.s));

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

// line -> vehicle -> station index -> [{ t, arrival }]
const byVehicle = new Map();
for (const r of rows) {
  const line = String(r.line);
  const station = engine.findStation(line, r.name);
  if (!station) continue;
  const stations = engine.getLineStations(line);
  const index = stations.findIndex(s => s.id === station.id);
  const key = `${line}|${r.v}`;
  if (!byVehicle.has(key)) byVehicle.set(key, { line, stations, sightings: [] });
  byVehicle.get(key).sightings.push({ index, t: r.t, arrival: r.t + r.s * 1000 });
}

const intervals = new Map(); // line -> "from>to" -> seconds[]
for (const { line, stations, sightings } of byVehicle.values()) {
  sightings.sort((a, b) => a.t - b.t);
  for (const a of sightings) {
    for (const b of sightings) {
      if (Math.abs(b.index - a.index) !== 1) continue;
      if (Math.abs(b.t - a.t) > MAX_SIGHTING_GAP_MS) continue;
      const seconds = (b.arrival - a.arrival) / 1000;
      // The later arrival is the Station the Vehicle is heading for.
      if (seconds < MIN_INTERVAL_SECONDS || seconds > MAX_INTERVAL_SECONDS) continue;
      const from = stations[a.index];
      const to = stations[b.index];
      if (!from.stopId || !to.stopId) continue;
      if (!intervals.has(line)) intervals.set(line, new Map());
      const perLine = intervals.get(line);
      const pair = `${from.stopId}>${to.stopId}`;
      if (!perLine.has(pair)) perLine.set(pair, []);
      perLine.get(pair).push(seconds);
    }
  }
}

const lines = {};
const report = [];
for (const [line, perLine] of [...intervals].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const segments = {};
  for (const [pair, values] of perLine) {
    if (values.length < MIN_SAMPLES) continue;
    segments[pair] = { seconds: Math.round(median(values)), samples: values.length };
    const [fromId, toId] = pair.split('>');
    const stations = engine.getLineStations(line);
    const from = stations.find(s => s.stopId === fromId);
    const to = stations.find(s => s.stopId === toId);
    report.push({ line, from: from.name, to: to.name, fgv: segments[pair].seconds, gtfs: gtfsTimes.lines[line]?.segments[pair] ?? gtfsTimes.lines[line]?.segments[`${toId}>${fromId}`] ?? '—', samples: values.length });
  }
  lines[line] = { segments, segmentCount: Object.keys(segments).length };
}

const output = {
  generatedAt: new Date().toISOString(),
  source: `${path.basename(capturePath)}, ${rows.length} rows, ` +
    `${new Date(Math.min(...rows.map(r => r.t))).toISOString()} – ${new Date(Math.max(...rows.map(r => r.t))).toISOString()}`,
  note: 'Median seconds between one Vehicle\'s FGV-predicted arrivals at consecutive Stations, keyed "fromStopId>toStopId". Same quantity as segment_times.json: includes dwell at the origin; subtract dwellSeconds to get running time.',
  dwellSeconds: DWELL_SECONDS,
  lines,
};
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

const total = Object.values(lines).reduce((n, l) => n + l.segmentCount, 0);
console.log(`Wrote ${outPath}: ${total} segments across ${Object.keys(lines).length} lines`);
for (const r of report) {
  console.log(`  L${r.line.padEnd(2)} ${`${r.from} > ${r.to}`.padEnd(48)} fgv ${String(r.fgv).padStart(3)}s  gtfs ${String(r.gtfs).padStart(3)}s  n=${r.samples}`);
}
