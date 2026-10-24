// Replay captured FGV rows through the real trainPositionEngine and measure
// marker discontinuities. Usage: vite-node replay.mjs raw.jsonl <refreshSec> <staggerSec>
import fs from 'fs';
import engine from '../../../src/services/trainPositionEngine.js';
import arrivalStore from '../../../src/services/arrivalStore.js';

const [file, refreshArg = '120', staggerArg = '1', lagArg = '25'] = process.argv.slice(2);
const REFRESH = Number(refreshArg) * 1000, STAGGER = Number(staggerArg) * 1000, LAG = Number(lagArg) * 1000;
const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => !r.err);

// snapshots[sid] = [{t, rows}] — rows of one poll share t within ~1s; bucket by 10s round
const snaps = new Map();
for (const r of rows) {
  if (!snaps.has(r.sid)) snaps.set(r.sid, new Map());
  const k = Math.floor(r.t / 5000);
  const m = snaps.get(r.sid);
  if (!m.has(k)) m.set(k, { t: r.t, rows: [] });
  m.get(k).rows.push(r);
}
const sids = [...snaps.keys()].sort((a, b) => a - b);
for (const sid of sids) snaps.set(sid, [...snaps.get(sid).values()].sort((a, b) => a.t - b.t));

// The app stores the API's own station name (paradas_api nombre) and lets the
// engine fuzzy-match it, so the replay does the same.
const apiNames = new Map(rows.map(r => [r.sid, r.name]));
const nameFor = (sid) => apiNames.get(sid) || null;

const t0 = Math.min(...rows.map(r => r.t)), tEnd = Math.max(...rows.map(r => r.t));
const refreshAt = new Map(sids.map((sid, i) => [sid, t0 + i * STAGGER]));

let lastAnchor = null;
const realWalk = engine.walkFromStation.bind(engine);
engine.walkFromStation = (line, target, secs, fwd) => { lastAnchor = { name: target.name, secs }; return realWalk(line, target, secs, fwd); };

const prev = new Map();
const events = [];
const disp = new Map(); let lagSum = 0, lagN = 0;
let ticks = 0, backwardMetres = 0, vehTicks = 0;
const TICK = 250;
for (let now = t0 + 30000; now <= tEnd; now += TICK) {
  for (const sid of sids) {
    if (now < refreshAt.get(sid)) continue;
    refreshAt.set(sid, refreshAt.get(sid) + REFRESH);
    const snap = [...snaps.get(sid)].reverse().find(s => s.t <= now);
    const name = nameFor(sid);
    if (!snap || !name) continue;
    arrivalStore.memory.set(String(sid), {
      stationId: sid, stationName: name, fetchedAt: snap.t,
      arrivals: snap.rows.map(r => ({ line: String(r.line), destination: r.dest, targetTimestamp: snap.t + r.s * 1000 - LAG, isLive: true, vehicleId: String(r.v) })),
    });
  }
  // capture anchors per vehicle
  const anchors = new Map();
  const realGet = engine.walkFromStation;
  const vs = [];
  // DRAWN=1 measures what the map draws (after smoothVehicle), not the raw walk.
  for (const v of engine.getLiveVehiclesFromMemory(now)) vs.push(process.env.DRAWN ? engine.smoothVehicle(v, now) : v);
  // recompute anchors (cheap: re-run to tag) — getLive calls walk once per vehicle in order
  let i = 0; const order = [];
  engine.walkFromStation = (l, tg, s, f) => { order.push({ name: tg.name, secs: s }); return realWalk(l, tg, s, f); };
  engine.getLiveVehiclesFromMemory(now);
  engine.walkFromStation = realGet;
  vs.forEach((v, j) => anchors.set(v.id, order[j]));
  ticks++;
  for (const v0 of vs) {
    vehTicks++;
    let v = v0;
    // Prototype: forward-only marker. Never step backwards along the direction
    // of travel; when the estimate runs ahead, close the gap at most MONO
    // metres per second. Cost tracked as distance from the raw estimate.
    if (process.env.MONO) {
      const sgn = v0.isForward ? 1 : -1;
      const p0 = disp.get(v0.id);
      let d = v0.distanceAlongTrack;
      if (p0 !== undefined) {
        const ahead = (v0.distanceAlongTrack - p0) * sgn;
        const cap = Number(process.env.MONO) * TICK / 1000;
        d = ahead <= 0 ? p0 : p0 + sgn * Math.min(ahead, cap);
      }
      disp.set(v0.id, d);
      lagSum += Math.abs(d - v0.distanceAlongTrack); lagN++;
      v = { ...v0, distanceAlongTrack: d };
    }
    const p = prev.get(v.id);
    const a = anchors.get(v.id);
    if (p) {
      const delta = (v.distanceAlongTrack - p.d) * (v.isForward ? 1 : -1);
      if (delta < -1) backwardMetres += -delta;
      if (Math.abs(delta) > 25) {
        const cause = p.anchor.name !== a.name ? 'anchor-switch'
          : Math.abs((a.secs - p.anchor.secs) - (-TICK / 1000)) > 1 ? 'refetch-retimed'
          : 'walk-step';
        events.push({ at: Math.round((now - t0) / 1000), id: v.id, delta: Math.round(delta), cause, from: `${p.anchor.name}@${Math.round(p.anchor.secs)}`, to: `${a.name}@${Math.round(a.secs)}`, status: `${p.status}->${v.status}` });
      }
    }
    prev.set(v.id, { d: v.distanceAlongTrack, anchor: a, status: v.status });
  }
}
const mins = (tEnd - t0 - 30000) / 60000;
const by = {};
for (const e of events) { by[e.cause] ??= { n: 0, back: 0, fwd: 0, sumAbs: 0 }; const b = by[e.cause]; b.n++; b.sumAbs += Math.abs(e.delta); e.delta < 0 ? b.back++ : b.fwd++; }
console.log(`refresh=${refreshArg}s stagger=${staggerArg}s lag=${lagArg}s  minutes=${mins.toFixed(1)} vehicles=${prev.size}`);
console.log(`jumps>25m: ${events.length} (${(events.length / mins).toFixed(1)}/min), backward travel total ${Math.round(backwardMetres)} m`);
for (const [c, b] of Object.entries(by)) console.log(`  ${c.padEnd(16)} n=${b.n} back=${b.back} fwd=${b.fwd} meanAbs=${Math.round(b.sumAbs / b.n)}m`);
if (lagN) console.log(`  mean distance from raw estimate ${Math.round(lagSum / lagN)} m`);
if (process.env.SHOW) for (const e of events.slice(0, Number(process.env.SHOW))) console.log(JSON.stringify(e));
