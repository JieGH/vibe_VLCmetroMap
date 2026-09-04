// Distils per-segment travel times out of the GTFS timetable.
//
// The position engine needs to answer "a train is N seconds from station S —
// where is it?".  Multiplying N by one commercial speed is wrong in both
// directions: real Metrovalencia segments run anywhere from 3.9 m/s (Machado →
// Alboraia Palmaret) to 16.9 m/s (La Pobla de Farnals → Rafelbunyol).  Walking
// the station chain and spending each segment's real timetabled interval places
// the train where the timetable says it is.
//
// The full timetable is far too large to ship (one line is 1.6 MB); this keeps
// only the median interval per ordered station pair, which is a few KB.
//
// Usage: node scripts/build_segment_times.cjs [gtfsDir]

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

// Newest feed wins — see the same note in generate_gtfs_geojson.cjs.
const newestFeed = () => {
  const dated = fs.readdirSync(projectRoot)
    .filter(name => /^\d{8}_\d{6}_/.test(name))
    .filter(name => fs.existsSync(path.join(projectRoot, name, 'stops.txt')))
    .sort()
    .reverse();
  if (!dated.length) throw new Error('No GTFS feed directory found in the project root');
  return path.join(projectRoot, dated[0]);
};

const gtfsDir = process.argv[2] || newestFeed();
const outPath = path.join(projectRoot, 'src', 'data', 'segment_times.json');

// Metrovalencia holds a platform for roughly this long. GTFS records
// arrival == departure for every stop in this feed, so a segment interval is
// "dwell at the origin + running time"; the engine needs the two apart.
const DWELL_SECONDS = 25;

const readCsv = (name) => {
  const lines = fs.readFileSync(path.join(gtfsDir, name), 'utf8').trim().split('\n');
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const parts = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = parts[i]; });
    return row;
  });
};

const toSeconds = (hhmmss) => {
  const [h, m, s] = hhmmss.split(':').map(Number);
  return h * 3600 + m * 60 + s;
};

const metresBetween = (a, b) => {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

const stops = new Map(readCsv('stops.txt').map(s => [s.stop_id, {
  id: s.stop_id, name: s.stop_name, lat: Number(s.stop_lat), lon: Number(s.stop_lon),
}]));

const trips = new Map(readCsv('trips.txt').map(t => [t.trip_id, {
  line: t.route_id.split('-')[0].replace(/^V/, ''),
  headsign: t.trip_headsign,
}]));

// ── Collect every observed consecutive stop pair, per line ───────────────────
// stop_times.txt is grouped by trip and ordered by stop_sequence, so a single
// pass with a one-row lookbehind is enough.
const observations = new Map(); // line -> Map("from>to" -> seconds[])
let previous = null;

for (const row of readCsv('stop_times.txt')) {
  const trip = trips.get(row.trip_id);
  const sequence = Number(row.stop_sequence);
  if (!trip) { previous = null; continue; }

  const isContinuation = previous &&
    previous.tripId === row.trip_id &&
    sequence === previous.sequence + 1;

  if (isContinuation) {
    const interval = toSeconds(row.arrival_time) - previous.departure;
    // Guard against midnight rollovers and layovers parked at a terminus.
    if (interval > 0 && interval < 1200) {
      if (!observations.has(trip.line)) observations.set(trip.line, new Map());
      const perLine = observations.get(trip.line);
      const key = `${previous.stopId}>${row.stop_id}`;
      if (!perLine.has(key)) perLine.set(key, []);
      perLine.get(key).push(interval);
    }
  }

  previous = {
    tripId: row.trip_id,
    stopId: row.stop_id,
    departure: toSeconds(row.departure_time),
    sequence,
  };
}

// ── Fit a fallback for segments the timetable does not cover ────────────────
// A least-squares fit of interval = intercept + distance/speed looks like the
// right model but collapses here: this feed quantises every time to a whole
// minute, so on tram lines whose segments are all 60s or 120s the slope goes to
// noise and implies speeds of 90 m/s. The median of the per-segment implied
// speeds cannot do that — half the observations have to be wrong before it
// moves — so it is what the fallback uses.
const MIN_PLAUSIBLE_SPEED = 3;   // m/s, slower than any observed segment
const MAX_PLAUSIBLE_SPEED = 30;  // m/s, ~108 km/h, above Metrovalencia's stock

const fitModel = (samples) => {
  if (samples.length < 4) return null;

  const speeds = samples
    .map(s => s.metres / s.seconds)
    .filter(v => v >= MIN_PLAUSIBLE_SPEED && v <= MAX_PLAUSIBLE_SPEED)
    .sort((a, b) => a - b);
  if (speeds.length < 4) return null;

  const mid = speeds.length >> 1;
  const metresPerSecond = speeds.length % 2
    ? speeds[mid]
    : (speeds[mid - 1] + speeds[mid]) / 2;

  return {
    metresPerSecond: Number(metresPerSecond.toFixed(2)),
    minSeconds: DWELL_SECONDS + 15,
    samples: speeds.length,
  };
};

const lines = {};
const allSamples = [];

for (const [line, perLine] of [...observations].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const segments = {};
  const lineSamples = [];

  for (const [key, intervals] of perLine) {
    const [fromId, toId] = key.split('>');
    const from = stops.get(fromId);
    const to = stops.get(toId);
    if (!from || !to) continue;

    const seconds = median(intervals);
    segments[key] = seconds;

    const sample = { metres: metresBetween(from, to), seconds };
    lineSamples.push(sample);
    allSamples.push(sample);
  }

  lines[line] = {
    segments,
    segmentCount: Object.keys(segments).length,
    fallback: fitModel(lineSamples),
  };
}

const output = {
  generatedAt: new Date().toISOString(),
  source: path.basename(gtfsDir),
  note: 'Median seconds between consecutive station arrivals, keyed "fromStopId>toStopId". Includes dwell at the origin station; subtract dwellSeconds to get running time.',
  dwellSeconds: DWELL_SECONDS,
  networkFallback: fitModel(allSamples),
  lines,
};

fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

const totalSegments = Object.values(lines).reduce((acc, l) => acc + l.segmentCount, 0);
console.log(`Wrote ${outPath}`);
console.log(`  ${Object.keys(lines).length} lines, ${totalSegments} segments, ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
console.log(`  network fallback: ${output.networkFallback.metresPerSecond} m/s`);
for (const [line, data] of Object.entries(lines)) {
  const f = data.fallback;
  console.log(`  L${line.padEnd(2)} ${String(data.segmentCount).padStart(3)} segments` +
    (f ? `  fallback ${f.metresPerSecond} m/s (from ${f.samples})` : '  (uses network fallback)'));
}
