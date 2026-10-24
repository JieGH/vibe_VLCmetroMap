// For each (vehicle, station) that gets close, print the last 3 minutes of
// countdown as "elapsed:seconds" and the implied arrival drift.
const fs = require('fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse).filter(r => !r.err);
const series = new Map();
for (const r of rows) { const k = `${r.line}|${r.v}|${r.name}`; (series.get(k) || series.set(k, []).get(k)).push(r); }
let stalls = 0, n = 0; const bumpUps = [], finalLate = [];
for (const [k, s] of series) {
  s.sort((a, b) => a.t - b.t);
  const last = s[s.length - 1];
  if (last.s > 60) continue; // never got close
  n++;
  const tail = s.filter(r => r.t >= last.t - 180000);
  // implied arrival at first tail point vs vanish time (train actually arrived ≈ when it disappears)
  const vanish = last.t + 10000; // next poll it was gone
  const firstImplied = tail[0].t + tail[0].s * 1000;
  finalLate.push(Math.round((vanish - firstImplied) / 1000));
  let maxUp = 0; for (let i = 1; i < tail.length; i++) maxUp = Math.max(maxUp, (tail[i].t + tail[i].s*1000 - tail[i-1].t - tail[i-1].s*1000) / 1000);
  bumpUps.push(Math.round(maxUp));
  if (process.env.V) console.log(k.padEnd(32), tail.map(r => r.s).join(','));
}
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
console.log('close approaches', n);
console.log('vanish time minus implied arrival 3 min out (s, + = later than FGV said): p10', q(finalLate, .1), 'p50', q(finalLate, .5), 'p90', q(finalLate, .9));
console.log('largest single upward retime in last 3 min (s): p50', q(bumpUps, .5), 'p90', q(bumpUps, .9), 'max', Math.max(...bumpUps));
