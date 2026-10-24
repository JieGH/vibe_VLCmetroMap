// Same vehicle, same poll round, two stations: sB - sA is FGV's own
// second-resolution estimate of A→B (run + dwell at A).
const fs = require('fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n').map(JSON.parse).filter(r => !r.err);
const rounds = new Map();
for (const r of rows) { const k = `${Math.floor(r.t / 10000)}|${r.v}`; (rounds.get(k) || rounds.set(k, []).get(k)).push(r); }
const pairs = new Map();
for (const [, rs] of rounds) {
  rs.sort((a, b) => a.s - b.s);
  for (let i = 1; i < rs.length; i++) { const k = `L${rs[i].line} ${rs[i-1].name} > ${rs[i].name}`; (pairs.get(k) || pairs.set(k, []).get(k)).push(rs[i].s - rs[i-1].s); }
}
const med = a => [...a].sort((x, y) => x - y)[a.length >> 1];
for (const [k, v] of [...pairs].filter(([, v]) => v.length >= 10).sort()) if (/Amistat|Aragó|Alameda|Colón|Xàtiva|Benimaclet/.test(k)) console.log(k.padEnd(50), 'n', String(v.length).padStart(3), 'median', med(v), 'min', Math.min(...v), 'max', Math.max(...v));
