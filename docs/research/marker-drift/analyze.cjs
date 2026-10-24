// Stability of FGV predictions: per (vehicle, station) implied arrival jitter,
// behaviour near zero, and how long a vehicle stays listed after arrival.
const fs = require('fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse).filter(r => !r.err);
const series = new Map();
for (const r of rows) { const k = `${r.v}|${r.sid}`; if (!series.has(k)) series.set(k, []); series.get(k).push(r); }
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const deltas = [], deltasNear = [], zeroHold = [], secsMod = new Map(), lastSeen = [];
for (const [, s] of series) {
  s.sort((a, b) => a.t - b.t);
  for (let i = 1; i < s.length; i++) {
    if (s[i].t - s[i - 1].t > 15000) continue;
    const d = ((s[i].t + s[i].s * 1000) - (s[i - 1].t + s[i - 1].s * 1000)) / 1000;
    deltas.push(d); if (s[i].s < 120) deltasNear.push(d);
  }
  const zeros = s.filter(r => r.s === 0);
  if (zeros.length) zeroHold.push((zeros[zeros.length - 1].t - zeros[0].t) / 1000);
  // seconds value of the last sighting before vanishing
  lastSeen.push(s[s.length - 1].s);
  for (const r of s) secsMod.set(r.s % 60, (secsMod.get(r.s % 60) || 0) + 1);
}
const abs = deltas.map(Math.abs);
console.log('rows', rows.length, 'series', series.size);
console.log('implied-arrival change between 10s polls (s): p50', q(abs, .5), 'p90', q(abs, .9), 'p99', q(abs, .99), 'max', Math.max(...abs));
console.log('  signed p10/p50/p90', q(deltas, .1), q(deltas, .5), q(deltas, .9));
const an = deltasNear.map(Math.abs); console.log('  when <120s out: p50', q(an, .5), 'p90', q(an, .9), 'max', Math.max(...an));
console.log('share of deltas with |d|>=20s', (abs.filter(x => x >= 20).length / abs.length).toFixed(3));
console.log('seconds%60 distinct values', secsMod.size, ' (60 => second-resolution, few => minute-quantised)');
console.log('time a vehicle is listed with seconds=0 (s): n', zeroHold.length, 'p50', q(zeroHold, .5), 'p90', q(zeroHold, .9), 'max', Math.max(...zeroHold));
console.log('seconds at last sighting before it vanishes: p10', q(lastSeen, .1), 'p50', q(lastSeen, .5), 'p90', q(lastSeen, .9));
// worst series examples
const worst = [...series.entries()].map(([k, s]) => { let m = 0; for (let i = 1; i < s.length; i++) if (s[i].t - s[i-1].t <= 15000) m = Math.max(m, Math.abs((s[i].t + s[i].s*1000) - (s[i-1].t + s[i-1].s*1000)) / 1000); return [k, m, s]; }).sort((a, b) => b[1] - a[1]).slice(0, 3);
for (const [k, m, s] of worst) console.log('worst', k, s[0].name, 'maxJump', m, 's:', s.map(r => r.s).join(','));
