// Poll every Station in paradas_api.json, 4 requests in flight, one full pass
// at most every 30 s; log raw rows as JSONL. Feeds build_segment_times_fgv.
// Usage: node capture_network.cjs out.jsonl [durationMs]
const fs = require('fs');
const stations = require(process.cwd() + '/src/data/paradas_api.json');
const out = process.argv[2];
const end = Date.now() + Number(process.argv[3] || 1200000);

async function one(s) {
  const t0 = Date.now();
  try {
    const r = await fetch(`https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3/${s.id}`, { signal: AbortSignal.timeout(4000) });
    const d = await r.json();
    const t = Date.now();
    const lines = [];
    for (const g of d.previsiones || []) for (const tr of g.trains || [])
      lines.push(JSON.stringify({ t, rtt: t - t0, sid: s.id, name: s.nombre, line: g.line ?? g.line_id, v: tr.vehicle, dest: tr.destino, s: tr.seconds }));
    if (lines.length) fs.appendFileSync(out, lines.join('\n') + '\n');
  } catch (e) {
    fs.appendFileSync(out, JSON.stringify({ t: Date.now(), sid: s.id, err: String(e) }) + '\n');
  }
}

(async () => {
  while (Date.now() < end) {
    const started = Date.now();
    let next = 0;
    await Promise.all(Array.from({ length: 4 }, async () => { while (next < stations.length) await one(stations[next++]); }));
    await new Promise(r => setTimeout(r, Math.max(0, 30000 - (Date.now() - started))));
  }
  console.log('done');
})();
