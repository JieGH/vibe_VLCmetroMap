// Poll FGV every 10s for a run of Line 3/5 stations; log raw rows as JSONL.
const fs = require('fs');
const p = require(process.cwd() + '/src/data/paradas_api.json');
const want = ['Benimaclet','Machado','Alboraia','Facultats','Alameda','Colón','Xàtiva','Àngel Guimerà','Avinguda del Cid','Nou d\'Octubre','Mislata','Aragó','Amistat','Ajuntament','Ayora','Marítim'];
const st = p.filter(s => want.some(w => s.nombre.toLowerCase().startsWith(w.toLowerCase())));
const out = process.argv[2]; const durMs = Number(process.argv[3] || 900000);
console.log(st.map(s => s.id + ':' + s.nombre).join(', '));
const end = Date.now() + durMs;
async function one(s) {
  const t0 = Date.now();
  try {
    const r = await fetch(`https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3/${s.id}`, { signal: AbortSignal.timeout(4000) });
    const d = await r.json(); const t = Date.now();
    for (const g of d.previsiones || []) for (const tr of g.trains || [])
      fs.appendFileSync(out, JSON.stringify({ t, rtt: t - t0, sid: s.id, name: s.nombre, line: g.line ?? g.line_id, v: tr.vehicle, dest: tr.destino, s: tr.seconds }) + '\n');
  } catch (e) { fs.appendFileSync(out, JSON.stringify({ t: Date.now(), sid: s.id, err: String(e) }) + '\n'); }
}
(async () => { while (Date.now() < end) { const t = Date.now(); await Promise.all(st.map(one)); await new Promise(r => setTimeout(r, Math.max(0, 10000 - (Date.now() - t)))); } console.log('done'); })();
