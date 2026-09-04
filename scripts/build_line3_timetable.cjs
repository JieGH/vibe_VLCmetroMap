/* Build the browser-sized Line 3 timetable from an official Metrovalencia GTFS folder.
 * Usage: node scripts/build_line3_timetable.cjs /path/to/google_transit_folder
 */
const fs = require('node:fs');
const path = require('node:path');

function resolveGtfsDir() {
  const customArg = process.argv[2];
  if (customArg && fs.existsSync(path.join(customArg, 'stops.txt'))) return customArg;

  const projectRoot = path.resolve(__dirname, '..');
  const knownPath = path.join(projectRoot, '20260728_100006_Metro_Valencia');
  if (fs.existsSync(path.join(knownPath, 'stops.txt'))) return knownPath;

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

const inputDir = resolveGtfsDir();
if (!inputDir || !fs.existsSync(path.join(inputDir, 'stops.txt'))) {
  throw new Error(`GTFS folder not found. Looked in ${inputDir}`);
}

const parseCsv = (file) => {
  const [header, ...rows] = fs.readFileSync(path.join(inputDir, file), 'utf8').trim().split(/\r?\n/);
  const columns = header.split(',');
  return rows.map((row) => Object.fromEntries(row.split(',').map((value, index) => [columns[index], value.trim()])));
};
const toDate = (value) => `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
const toSeconds = (time) => {
  const [hours, minutes, seconds] = time.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};

const routes = new Set(parseCsv('routes.txt')
  .filter((route) => route.route_short_name === '3')
  .map((route) => route.route_id));
const stops = new Map(parseCsv('stops.txt').map((stop) => [stop.stop_id, stop.stop_name]));
const trips = new Map(parseCsv('trips.txt')
  .filter((trip) => routes.has(trip.route_id))
  .map((trip) => [trip.trip_id, trip]));

const activeServicesByDate = new Map();
parseCsv('calendar_dates.txt').forEach((entry) => {
  if (entry.exception_type !== '1') return;
  const date = toDate(entry.date);
  const services = activeServicesByDate.get(date) || new Set();
  services.add(entry.service_id);
  activeServicesByDate.set(date, services);
});

const tripStops = new Map();
parseCsv('stop_times.txt').forEach((entry) => {
  if (!trips.has(entry.trip_id) || !stops.has(entry.stop_id)) return;
  const entries = tripStops.get(entry.trip_id) || [];
  entries.push({
    station: stops.get(entry.stop_id),
    arrival: toSeconds(entry.arrival_time),
    departure: toSeconds(entry.departure_time),
    sequence: Number(entry.stop_sequence),
  });
  tripStops.set(entry.trip_id, entries);
});

const stationNames = Array.from(new Set(
  Array.from(tripStops.values()).flatMap((entries) => entries.map((entry) => entry.station))
)).sort();
const stationIndex = new Map(stationNames.map((name, index) => [name, index]));

// Compact tuple format keeps the browser payload small:
// [tripId, headsign, [[stationNameIndex, arrivalSeconds, departureSeconds], ...]]
const timetable = {
  generatedAt: new Date().toISOString(),
  source: 'Metrovalencia GTFS',
  timezone: 'Europe/Madrid',
  line: '3',
  stations: stationNames,
  serviceDates: Object.fromEntries(Array.from(activeServicesByDate.entries()).map(([date, serviceIds]) => [
    date,
    Array.from(trips.values())
      .filter((trip) => serviceIds.has(trip.service_id) && tripStops.has(trip.trip_id))
      .map((trip) => [
        trip.trip_id,
        trip.trip_headsign,
        tripStops.get(trip.trip_id)
          .sort((a, b) => a.sequence - b.sequence)
          .map((stop) => [stationIndex.get(stop.station), stop.arrival, stop.departure]),
      ]),
  ])),
};

const output = path.resolve(__dirname, '../src/data/line3_timetable.json');
fs.writeFileSync(output, `${JSON.stringify(timetable)}\n`);
console.log(`Wrote ${output} with ${Object.keys(timetable.serviceDates).length} service dates.`);
