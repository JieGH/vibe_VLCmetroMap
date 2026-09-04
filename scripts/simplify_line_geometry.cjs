// Simplifies the Track Geometry in metro_lines.json.
//
// The polylines are imported by trainPositionEngine, which needs them
// synchronously to build its Station Chains, so they cannot be fetched at
// runtime the way public/line4_osm.geojson is — they have to be small instead.
// Line 1 alone carries 1,703 points for a route the map then Chaikin-smooths
// anyway, so most of that detail never reaches a pixel.
//
// Douglas-Peucker, with the tolerance measured in metres rather than degrees so
// it means the same thing at every latitude. The engine drops a station from a
// chain once it sits more than 250 m off its line, so the tolerance here is two
// orders of magnitude inside the value that would actually change behaviour.
//
// Usage: node scripts/simplify_line_geometry.cjs [toleranceMetres]

const fs = require('fs');
const path = require('path');

const TOLERANCE_METRES = Number(process.argv[2]) || 3;

// Refuse to write if any point moved further than this. The engine's own
// threshold is 250 m; stopping well short of it leaves room for the
// accumulated error of projecting a station and then interpolating back.
const MAX_ACCEPTABLE_DEVIATION = 25;

const filePath = path.resolve(__dirname, '..', 'src', 'data', 'metro_lines.json');

const metresPerDegreeLat = 111320;
const metresPerDegreeLon = (lat) => 111320 * Math.cos(lat * Math.PI / 180);

// Perpendicular distance from p to the segment a→b, in metres. Coordinates are
// projected to a local metre grid first so the arithmetic is plain Euclidean.
const perpendicularMetres = (p, a, b) => {
  const lat0 = a[1];
  const mx = metresPerDegreeLon(lat0);
  const toXY = (c) => [(c[0] - a[0]) * mx, (c[1] - a[1]) * metresPerDegreeLat];

  const [px, py] = toXY(p);
  const [bx, by] = toXY(b);
  const lenSq = bx * bx + by * by;
  if (lenSq === 0) return Math.hypot(px, py);

  let t = (px * bx + py * by) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
};

const douglasPeucker = (points, tolerance) => {
  if (points.length < 3) return points.slice();

  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularMetres(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; index = i; }
  }

  if (maxDist <= tolerance) return [points[0], points[points.length - 1]];

  const left = douglasPeucker(points.slice(0, index + 1), tolerance);
  const right = douglasPeucker(points.slice(index), tolerance);
  return left.slice(0, -1).concat(right);
};

// How far the worst original point now sits from the simplified line.
const worstDeviation = (original, simplified) => {
  let worst = 0;
  for (const p of original) {
    let best = Infinity;
    for (let i = 0; i < simplified.length - 1; i++) {
      best = Math.min(best, perpendicularMetres(p, simplified[i], simplified[i + 1]));
      if (best === 0) break;
    }
    worst = Math.max(worst, best);
  }
  return worst;
};

const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const before = fs.statSync(filePath).size;

let totalBefore = 0;
let totalAfter = 0;
let overallWorst = 0;
const report = [];

for (const feature of data.features) {
  if (!feature.geometry || feature.geometry.type !== 'LineString') continue;
  const original = feature.geometry.coordinates;
  if (!original || original.length < 3) continue;

  const simplified = douglasPeucker(original, TOLERANCE_METRES);
  const deviation = worstDeviation(original, simplified);

  if (deviation > MAX_ACCEPTABLE_DEVIATION) {
    console.error(
      `Refusing to write: line ${feature.properties.line} would move a point ` +
      `${deviation.toFixed(1)}m, over the ${MAX_ACCEPTABLE_DEVIATION}m limit. ` +
      `Try a smaller tolerance.`
    );
    process.exit(1);
  }

  feature.geometry.coordinates = simplified;
  totalBefore += original.length;
  totalAfter += simplified.length;
  overallWorst = Math.max(overallWorst, deviation);
  report.push({
    line: feature.properties.line,
    from: original.length,
    to: simplified.length,
    deviation,
  });
}

fs.writeFileSync(filePath, JSON.stringify(data));
const after = fs.statSync(filePath).size;

console.log(`Simplified at ${TOLERANCE_METRES}m tolerance\n`);
for (const r of report.sort((a, b) => Number(a.line) - Number(b.line))) {
  console.log(
    `  L${String(r.line).padEnd(3)}${String(r.from).padStart(5)} → ${String(r.to).padStart(4)} points` +
    `  (${String(Math.round(100 - (r.to / r.from) * 100)).padStart(2)}% fewer)` +
    `   worst deviation ${r.deviation.toFixed(2)}m`
  );
}
console.log(
  `\n  ${totalBefore} → ${totalAfter} points, ` +
  `${Math.round(before / 1024)}K → ${Math.round(after / 1024)}K, ` +
  `worst deviation anywhere ${overallWorst.toFixed(2)}m`
);
console.log('\nRun `npm test` — the track-geometry-fidelity tests guard this.');
